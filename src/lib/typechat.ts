import { llmComplete } from './llm';
import { verifyJsonObject } from './verify';
import * as readline from 'readline';

export interface ICompletionResult {
    jsontext?: string;
    diagnostics?: string[];
    error: boolean;
    errorMessage?: string;
}

export interface IPromptContext<TSchema> {
    // Text of the schema that will be part of the prompt
    schemaText: string;
    // Name of the type in the schema that will be used to validate the JSON output
    typeName: string;
    // Informal interpretation the validation type
    typeInterp: string;
    // Description of the overall prompt context
    frame: string;
    // Function to check additional constraints on the JSON output
    checkConstraints?: (result: TSchema) => string[];
    // Function to handle the result of the interaction
    handleResult?: (result: TSchema) => void;
    // Async funtion to handle the result of the interaction
    asyncHandleResult?: (result: TSchema) => Promise<void>;
    // local parser to avoid calls to LLM
    localParser?: (userPrompt: string) => string | undefined;
}

function validate<TSchema>(
    ret: string,
    schemaText: string,
    typeName: string,
    checkConstraints?: (result: TSchema) => string[]
) {
    // find the first '{' in ret
    const start = ret.indexOf('{');
    // find the last '}' in ret
    const end = ret.lastIndexOf('}');
    const result = { error: false } as ICompletionResult;
    if (start >= 0 && end >= 0) {
        const jsontext = ret.substring(start, end + 1);
        result.jsontext = jsontext;

        try {
            const testJSON = JSON.parse(jsontext);
            const diagnostics = verifyJsonObject(
                testJSON,
                schemaText,
                typeName
            );
            if (checkConstraints) {
                const constraintDiagnostics = checkConstraints(testJSON);
                if (constraintDiagnostics && constraintDiagnostics.length > 0) {
                    if (diagnostics) {
                        diagnostics.push(...constraintDiagnostics);
                    } else {
                        result.diagnostics = constraintDiagnostics;
                    }
                }
            }
            if (diagnostics && diagnostics.length > 0) {
                result.diagnostics = diagnostics;
                result.error = true;
                result.errorMessage = 'JSON instance does not match schema';
            }
        } catch (e) {
            result.error = true;
            result.errorMessage = 'JSON parse error';
            console.log(jsontext);
        }
    } else {
        result.error = true;
        result.errorMessage = 'No JSON instance found';
        console.log(ret);
    }
    return result;
}

/**
 * Create a prompt for a completion service
 */
export function makePrompt<TSchema>(
    promptContext: IPromptContext<TSchema>,
    text: string
) {
    const preamble = `Here is a set of TypeScript data types that define the structure of an object of type ${promptContext.typeName} that represents ${promptContext.typeInterp}.\n`;

    const postamble = `\nIn the following paragraph ${promptContext.frame}. Write out the person's requests as a **single** JSON object of type ${promptContext.typeName}. Never write null or undefined as values in the JSON object. **Do not** add comments when writing out the JSON object because some JSON parsers can't understand comments.\n`;

    const prompt =
        preamble +
        promptContext.schemaText +
        postamble +
        '\nText of user request:\n' +
        text +
        '\nJSON object:\n';
    return prompt;
}

export async function completeAndValidate<TSchema>(
    promptContext: IPromptContext<TSchema>,
    prompt: string,
    userPrompt?: string
) {
    let ret: string | undefined = undefined;
    if (userPrompt && promptContext.localParser) {
        ret = promptContext.localParser(userPrompt);
    }
    if (ret === undefined) {
        ret = await llmComplete(prompt);
    }
    if (ret) {
        const result = validate(
            ret,
            promptContext.schemaText,
            promptContext.typeName,
            promptContext.checkConstraints
        );
        return result;
    }
    return { error: true } as ICompletionResult;
}

export function printJSON<TSchema>(result: TSchema) {
    console.log(JSON.stringify(result, null, 2));
}

export async function runTest<TSchema>(
    promptContext: IPromptContext<TSchema>,
    prompt: string,
    showPrompt = false,
    delay = 0
) {
    let totalPrompt = makePrompt(promptContext, prompt);
    if (showPrompt) {
        console.log(prompt);
    }
    let result = await completeAndValidate(promptContext, totalPrompt, prompt);
    if (result.error) {
        console.log('Error: ' + result.errorMessage);
        if (result.diagnostics && result.diagnostics.length > 0) {
            totalPrompt += result.jsontext ? result.jsontext : '';
            for (const d of result.diagnostics) {
                console.log(d);
                totalPrompt += d;
            }
            totalPrompt +=
                "Reminder:\n If a property is null or undefined, do not include it. **Do not** add comments when writing out the JSON object because some JSON parsers can't understand comments. Write out only a single JSON object with no extra comments.\nRevised JSON object:";
            result = await completeAndValidate(promptContext, totalPrompt);
            if (result.error) {
                console.log('error on second try ' + result.errorMessage);
                console.log(result.jsontext!);
            }
        }
    }
    if (!result.error) {
        if (result.jsontext) {
            const typedResult = JSON.parse(result.jsontext) as TSchema;
            if (promptContext.handleResult) {
                promptContext.handleResult(typedResult);
            } else if (promptContext.asyncHandleResult) {
                await promptContext.asyncHandleResult(typedResult);
            } else {
                printJSON(typedResult);
            }
        }
    }
    // insert a delay
    if (delay > 0) {
        // console.log(`Delaying ${delay} seconds`);
        await new Promise((r) => setTimeout(r, Math.round(delay * 1000)));
    }
    return result;
}

export async function runTests<TSchema>(
    testPrompts: string[],
    promptContext: IPromptContext<TSchema>,
    delay = 0
) {
    for (const prompt of testPrompts) {
        await runTest(promptContext, prompt, true, delay);
    }
}

function interactivePrompt(
    handler: (prompt: string) => Promise<void>,
    linePrompt = '>'
) {
    const lineReader = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    lineReader.on('line', async (line: string) => {
        if (line === 'exit') {
            // eslint-disable-next-line no-process-exit
            process.exit();
        } else {
            lineReader.pause();
            await handler(line);
            lineReader.resume();
            lineReader.prompt();
        }
    });
    lineReader.setPrompt(linePrompt);
    lineReader.prompt();
}

export function runTestsInteractive<TSchema>(
    promptContext: IPromptContext<TSchema>,
    linePrompt = '>'
) {
    interactivePrompt(async (prompt: string) => {
        await runTest(promptContext, prompt);
    }, linePrompt);
}

export function makePromptsInteractive<TSchema>(
    promptContext: IPromptContext<TSchema>
) {
    interactivePrompt(async (prompt: string) => {
        console.log(makePrompt(promptContext, prompt));
    });
}
