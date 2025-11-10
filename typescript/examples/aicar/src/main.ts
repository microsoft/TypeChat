import assert from "assert";
import dotenv from "dotenv";
import findConfig from "find-config";
import fs from "fs";
import path from "path";
import { createJsonTranslator } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import { processRequests } from "typechat/interactive";
import { CarActions } from "./SDVCarActionSchema";
import {ModelConfig, requestTracking, validateCarResponse, parseCommandLine, createLLM} from "./utils"
import * as tsprogress from 'ts-progress';

const inputOptions = parseCommandLine();
let models: ModelConfig[] = [];
const dotEnvPath = findConfig(".env");
const modelConfigPath = findConfig("modelconfig.json");
assert(dotEnvPath, ".env file not found!");
dotenv.config({ path: dotEnvPath });

const llmodel = createLLM(inputOptions, modelConfigPath ?? undefined)!;
const schema = fs.readFileSync(path.join(__dirname, "SDVCarActionSchema.ts"), "utf8");
const validator = createTypeScriptJsonValidator<CarActions>(schema, "CarActions");
const translator = createJsonTranslator(llmodel, validator);

if(inputOptions.validate){

    if(inputOptions.inputfile) 
    {
        const lines = fs.readFileSync(inputOptions.inputfile).toString().split(/\r?\n/);
        var progress = tsprogress.create({total: lines.length});
        let responses = Promise.all(lines.map(async (x) => {
            const result = await validateCarResponse(x, translator);
            progress.update();
            return result;
        }))
        .then((values) => {
            console.log('Processing Complete - Recap:');
            let passed = values.filter(e => e.status === 'Passed').length
            let failed = values.filter(e => e.status === 'Failed').length
            console.log('#of Requests: ' +values.length+ ' Passed: ' + passed + ' Failed: ' + failed + ' % correct: ' + (passed/values.length)*100 + '%');
            if(inputOptions.outputfile){
                fs.writeFileSync(inputOptions.outputfile, values.map(x=>JSON.stringify(x)).join('\n'));
            }
        });
    }
}
else{
    console.log('Interactive mode');
    processRequests("☕> ", "", async (request): Promise<void> => {
        const res: requestTracking = await validateCarResponse(request, translator);
        console.log(res);
        return;
    });
}
