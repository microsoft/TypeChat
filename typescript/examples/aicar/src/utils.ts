import { z } from "zod";
import { VAL} from "../src/gen/kuksa/val/v1/val_connect";
import { GetRequest, SetRequest} from "../src/gen/kuksa/val/v1/val_pb";
import { createPromiseClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { Command, Option, OptionValues } from 'commander';
import { createAzureOpenAILanguageModel, createLanguageModel,createOpenAILanguageModel } from "typechat";
import fs from "fs";

export class requestTracking { 
    request: string | undefined;
    status?: string;
    expectedRequest?: string;
    generatedRequest?: string;
    expectedAPIResponse?: string;
    APIResponse?: string;
    unknownRequest?: string;
    errors?: string[];
    prompt?: string;
}

export function parseCommandLine(){
    const program = new Command();
    program.addOption(new Option('-v, --validate', 'perform validattion of the input file'),);
    program.addOption(new Option('-i, --inputfile <string>', 'file to parse input from'),);
    program.addOption(new Option('-o, --outputfile <string>', 'file to parse input from'),);
    program.addOption(new Option('-m, --model <string>', 'model to select from the modelconfig.json'),);
    program.parse(process.argv);
    return program.opts();
};

export function createLLM(inputOptions: OptionValues, modelConfigPath: string | undefined){
  let llmodel;
  if(inputOptions.model && modelConfigPath){
    const models = JSON.parse(fs.readFileSync(modelConfigPath, "utf8")) as ModelConfig[];
    const model = models.find(x => x.name === inputOptions.model);
    if(model){
        llmodel = model.type === 'AzureOpenAI' ? createAzureOpenAILanguageModel(model.modelDetails.apiKey, model.modelDetails.apiEndpoint)
        : model.type === 'Ollama' ? createOpenAILanguageModel(model.modelDetails.apiKey, model.name, model.modelDetails.apiEndpoint)
        : createLanguageModel(process.env)
        }
    }
    else{
        console.log('Model not found');
        llmodel = createLanguageModel(process.env);
    }
    return llmodel;
}

export const SDVRequestResponse = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      value: z.object({ timestamp: z.string(), int32: z.number() })
    })
  ),
  errors: z.array(z.unknown())
})

export const SDVSetResponse = z.object({
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.object({
        code: z.number(),
        reason: z.string(),
        message: z.string()
      })
    })
  )
})

export type Error = {
  code: 0;
  reason: "";
  message: "";
}
export type DataEntryError = {
  path: "";
  error?: Error;
}

export interface ModelDetails {
  apiKey: string;
  apiEndpoint: string;
  port?: number | string;
}

export interface ModelConfig {
  name: string;
  type: string;
  modelDetails: ModelDetails;
}

export async function validateCarResponse(request: string, translator: any) {
  const transport = createGrpcTransport({baseUrl: "http://localhost:55556",httpVersion: "2"}); //assumes local databroker on commonly used port
  const vl = createPromiseClient(VAL, transport);
  let requestTracking: requestTracking = {request: request};
  translator.attemptRepair = true;
  requestTracking.prompt = translator.createRequestPrompt(request);
  const response = await translator.translate(request);
  if (!response.success) {
      requestTracking.status = "Failed";
      requestTracking.errors = [response.message];
      return requestTracking;
  }
  const car = response.data;
  for (const item of car.actions) {
      if(item.type.includes('Set'))
      {
          requestTracking.generatedRequest = JSON.stringify(item.command);
          const s1 = await vl.set(SetRequest.fromJsonString(JSON.stringify(item.command)));
          requestTracking.APIResponse = JSON.stringify(s1);
          requestTracking.status = s1.errors.length > 0 ? "Failed" : "Passed"
      }
      else if(item.type.includes('Get'))
      {
          requestTracking.generatedRequest = JSON.stringify(item.command);
          const g1 = await vl.get(GetRequest.fromJsonString(JSON.stringify(item.command)));
          requestTracking.APIResponse = JSON.stringify(g1);
          requestTracking.status = g1.errors.length > 0 ? "Failed" : "Passed"
      }
      else
      {
          requestTracking.unknownRequest = JSON.stringify(item.command);
      }
  }
  return requestTracking;
}
