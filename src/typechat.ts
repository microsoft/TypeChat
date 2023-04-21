import { llmComplete } from './llm';
import { verifyJsonObject } from './verify';

export interface ICompletionResult {
    jsontext?: string;
    diagnostics?: string[];
    error: boolean;
    errorMessage?: string;
}

function validate(ret: string, schemaText:string, typeName: string) {
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
    
    const postamble = `\nIn the following paragraph ${frame}. Write out the person's requests as a **single** JSON object of type ${typeName}. **Do not** add comments when writing out the JSON object because some JSON parsers can't understand comments.\n`;
    
    const prompt = preamble + st + postamble + text +"\nJSON object:\n";
    return prompt;
}

export async function completeAndValidate(p: string, schemaText: string, typeName: string) {
    const ret = await llmComplete(p);
    if (ret) {
        const result = validate(ret, schemaText, typeName);
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
* Complete and validate a set of test prompts.
* @param testPrompts The set of test prompts to complete (as JSON instances) and validate
* @param typeName The name of the type to use to validate the instance
* @param typeInterp Description of the validation type
* @param frame Description of the overall prompt context
* @param schemaText Text of the schema for use in validation
* @param delay Delay in seconds between tests
* @param handleResult Handler for each valid result
*/
export async function runTests<TSchema>(testPrompts: string[], typeName: string, typeInterp: string,
    frame: string, schemaText: string, delay = 0, handleResult:(result: TSchema) => void = printJSON) {
        for (let testPrompt of testPrompts) {
            let totalPrompt = makePrompt(schemaText, typeName, typeInterp, frame, testPrompt);
            console.log(testPrompt);
            let result = await completeAndValidate(totalPrompt, schemaText, typeName);
            if (result.error) {
                console.log("Error: " + result.errorMessage);
                if (result.diagnostics) {
                    totalPrompt += result.jsontext ? result.jsontext : "";
                    for (let d of result.diagnostics) {
                        console.log(d);
                        totalPrompt += d;
                    }
                    totalPrompt += "Revised JSON object:"
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
        }
    }
    