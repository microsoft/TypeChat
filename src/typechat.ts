import { llmComplete } from './llm';
import { verifyJsonObject } from './verify';
import * as readline from 'readline';

export interface ICompletionResult {
    jsontext?: string;
    diagnostics?: string[];
    error: boolean;
    errorMessage?: string;
}

function validate<TSchema>(ret: string, schemaText:string, typeName: string, checkConstraints?:(result: TSchema) => string[]) {
    // find the first '{' in ret
    const start = ret.indexOf('{');
    // find the last '}' in ret
    const end = ret.lastIndexOf('}');
    let result = { error: false }  as ICompletionResult;
    if ((start >= 0) && (end >= 0)) {
        const jsontext = ret.substring(start, end + 1);
        result.jsontext = jsontext;
        
        try {
            const testJSON = JSON.parse(jsontext);
            const diagnostics = verifyJsonObject(testJSON, schemaText, typeName);
            if (checkConstraints) {
                const constraintDiagnostics = checkConstraints(testJSON);
                if (constraintDiagnostics && constraintDiagnostics.length > 0) {
                    if (diagnostics) {
                        diagnostics.push(...constraintDiagnostics);
                    }
                    else {
                        result.diagnostics = constraintDiagnostics;
                    }
                }
            }
            if (diagnostics && diagnostics.length > 0) {
                result.diagnostics = diagnostics;
                result.error = true;
                result.errorMessage = "JSON instance does not match schema";
            } 
        }
        catch (e) {
            result.error = true;
            result.errorMessage = "JSON parse error";
        }
    }
    else {
        result.error = true;
        result.errorMessage = "No JSON instance found";
    }
    return result;
}

/**
* Create a prompt for a completion service
* @param st The text of a schema that specifies the type of the JSON output
* @param typeName The name of a type in the schema to use for validating the JSON output
* @param typeInterp Description of the validation type
* @param frame Description of the overall prompt context
* @param text Text of the user request to be schematized into JSON
* @returns 
*/
export function makePrompt(st: string,typeName: string,typeInterp: string, frame: string, text: string) {
    const preamble = `Here is a set of typescript data types that define the structure of an object of type ${typeName} that represents ${typeInterp}.\n`;
    
    const postamble = `\nIn the following paragraph ${frame}. Write out the person's requests as a **single** JSON object of type ${typeName}. If a property is null or undefined, do not include it. **Do not** add comments when writing out the JSON object because some JSON parsers can't understand comments.\n`;
    
    const prompt = preamble + st + postamble + text +"\nJSON object:\n";
    return prompt;
}

export async function completeAndValidate<TSchema>(p: string, schemaText: string, typeName: string, checkConstraints?:(result: TSchema) => string[]) {
    const ret = await llmComplete(p);
    if (ret) {
        const result = validate(ret, schemaText, typeName, checkConstraints);
        return result;
    } else 
    {
        return { error: true } as ICompletionResult;
    }
}

function printJSON<TSchema>(result: TSchema) {
    console.log(JSON.stringify(result));
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
export async function runTest<TSchema>(prompt: string, typeName: string, typeInterp: string,frame: string, 
    schemaText: string, delay = 0, checkConstraints?:(result: TSchema) => string[], handleResult:(result: TSchema) => void = printJSON, printTotalPrompt = false) {
        let totalPrompt = makePrompt(schemaText, typeName, typeInterp, frame, prompt);
        if (printTotalPrompt) {
            console.log(totalPrompt);
        }
        else {
            console.log(prompt);
        }
        let result = await completeAndValidate(totalPrompt, schemaText, typeName, checkConstraints);
        if (result.error) {
            console.log("Error: " + result.errorMessage);
            if (result.diagnostics && result.diagnostics.length > 0) {
                totalPrompt += result.jsontext ? result.jsontext : "";
                for (let d of result.diagnostics) {
                    console.log(d);
                    totalPrompt += d;
                }
                totalPrompt += "Reminder:\n If a property is null or undefined, do not include it. **Do not** add comments when writing out the JSON object because some JSON parsers can't understand comments. Write out only a single JSON object with no extra comments.\nRevised JSON object:"
                result = await completeAndValidate(totalPrompt, schemaText, typeName);
                if (result.error) {
                    console.log("error on second try " + result.errorMessage);
                    console.log(result.jsontext!);
                }
            }
        } 
        if (!result.error) {
            console.log("Valid instance:");
            if (result.jsontext) {
                const typedResult = JSON.parse(result.jsontext) as TSchema;
                handleResult(typedResult);
            }
        }
        // insert a delay 
        if (delay > 0) {
            // console.log(`Delaying ${delay} seconds`);
            await new Promise(r => setTimeout(r, Math.round(delay*1000)));
        }
        return result;
    }
    
    export async function runTests<TSchema>(testPrompts: string[], typeName: string, typeInterp: string, frame: string, schemaText: string, delay = 0, checkConstraints?:(result: TSchema) => string[], handleResult:(result: TSchema) => void = printJSON) {
        for (let prompt of testPrompts) {
            await runTest(prompt, typeName, typeInterp, frame, schemaText, delay, checkConstraints, handleResult);
        }   
    }
    
    function interactivePrompt(handler: (prompt: string) => void) {
        // read a prompt from the console line by line and test the prompt after an empty line
        let prompt = "";
        let lineReader = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        lineReader.on('line', function (line: string) {
            if (line.length == 0) {
                handler(prompt);
                prompt = "";
            }
            else {
                if (line == "exit") {
                    process.exit();
                }
                prompt += line + " ";
            }
        });
        // wait for the user to enter a prompt
        console.log("Enter a multi-line prompt.  Enter a blank line to test the prompt.  Enter 'exit' to exit.");
        lineReader.prompt();   
        
    }
    
    export function runTestsInteractive<TSchema>(typeName: string, typeInterp: string, frame: string, schemaText: string, checkConstraints?:(result: TSchema) => string[], handleResult:(result: TSchema) => void = printJSON) {
        interactivePrompt((prompt: string) => {
            runTest(prompt, typeName, typeInterp, frame, schemaText, 0, checkConstraints, handleResult);
        });
    }
    
    export function makePromptsInteractive<TSchema>(typeName: string, typeInterp: string, frame: string,schemaText: string) {
        interactivePrompt((prompt: string) => {
            console.log(makePrompt(schemaText, typeName, typeInterp, frame, prompt));
        });
    }