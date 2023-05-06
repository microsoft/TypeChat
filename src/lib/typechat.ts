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
    // Function to print the result of the interaction
    handleResult?: (result: TSchema) => void;
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
        text +
        '\nJSON object:\n';
    return prompt;
}

export async function completeAndValidate<TSchema>(
    promptContext: IPromptContext<TSchema>,
    p: string
) {
    const ret = await llmComplete(p);
    if (ret) {
        const result = validate(
            ret,
            promptContext.schemaText,
            promptContext.typeName,
            promptContext.checkConstraints
        );
        return result;
    } else {
        return { error: true } as ICompletionResult;
    }
}

function printJSON<TSchema>(result: TSchema) {
    console.log(JSON.stringify(result, null, 2));
}

/**
 * Construct, complete and validate a prompt.
 * @param testPrompts The set of test prompts to complete (as JSON instances) and validate
 * @param typeName The name of the type to use to validate the instance
 * @param typeInterp Description of the validation type
 * @param frame Description of the overall prompt context
 * @param schemaText Text of the schema for use in validation
 * @param delay Delay in seconds between tests
 * @param handleResult Handler for each valid result
 */
export async function runTest<TSchema>(
    promptContext: IPromptContext<TSchema>,
    prompt: string,
    delay = 0
) {
    let totalPrompt = makePrompt(promptContext, prompt);
    console.log(prompt);
    let result = await completeAndValidate(promptContext, totalPrompt);
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
        console.log('Valid instance:');
        if (result.jsontext) {
            const typedResult = JSON.parse(result.jsontext) as TSchema;
            if (promptContext.handleResult) {
                promptContext.handleResult(typedResult);
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
        await runTest(promptContext, prompt, delay);
    }
}

function interactivePrompt(handler: (prompt: string) => void) {
    // read a prompt from the console line by line and test the prompt after an empty line
    let prompt = '';
    const lineReader = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    lineReader.on('line', (line: string) => {
        if (line.length === 0) {
            handler(prompt);
            prompt = '';
        } else {
            if (line === 'exit') {
                // eslint-disable-next-line no-process-exit
                process.exit();
            }
            prompt += line + ' ';
        }
    });
    // wait for the user to enter a prompt
    console.log(
        "Enter a multi-line prompt.  Enter a blank line to test the prompt.  Enter 'exit' to exit."
    );
    lineReader.prompt();
}

export function runTestsInteractive<TSchema>(
    promptContext: IPromptContext<TSchema>
) {
    interactivePrompt((prompt: string) => {
        runTest(promptContext, prompt, 0);
    });
}

export function makePromptsInteractive<TSchema>(
    promptContext: IPromptContext<TSchema>
) {
    interactivePrompt((prompt: string) => {
        console.log(makePrompt(promptContext, prompt));
    });
}
