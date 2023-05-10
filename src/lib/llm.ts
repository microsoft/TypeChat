import { Configuration, OpenAIApi } from 'azure-openai';
import * as process from 'process';

import * as config from './typechatConfig';
import * as oai from './openai';
import { TypechatErrorCode, TypechatException } from './typechatException';

const apiKey = process.env.OPENAI_API_KEY;
const apiBase = process.env.OPENAI_API_BASE;
const apiDeploymentName: string = process.env.DEPLOYMENT_NAME
    ? process.env.DEPLOYMENT_NAME
    : 'error';

const openai = new OpenAIApi(
    new Configuration({
        apiKey: apiKey,
        azure: {
            apiKey: apiKey,
            endpoint: apiBase,
            deploymentName: apiDeploymentName,
        },
    })
);

export async function llmComplete(prompt: string, max_tokens = 4000) {
    let retryCount = 0;
    while (retryCount < 200) {
        try {
            const completion = await openai.createCompletion({
                model: apiDeploymentName,
                prompt: prompt,
                max_tokens: max_tokens,
                temperature: 0.05,
                top_p: 1,
                best_of: 1,
            });
            if (completion.status === 200) {
                return completion.data.choices[0].text;
            } else {
                return `Error: ${completion.status} `;
            }
            // According to C:\git\llm-tools\typechat\node_modules\azure-openai\dist\api.d.ts,
            // openai.createCompletion() throws RequiredError, but there is no definition for
            // RequiredError in the file. For now, suppress no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            retryCount++;
            if (e.response.status !== 429) {
                return `Error: ${e.response.status} `;
            }
            if (retryCount % 10 === 0) {
                console.log(`retries ${retryCount}`);
            }
        }
    }
    return `Error: ${retryCount} retries`;
}

// This is short term. Duplicating existing behavior
const tcConfig: config.TypechatConfig = config.fromEnv();
const openAIClient: oai.AzureOAIClient = new oai.AzureOAIClient(
    tcConfig.azureOAI
);

export async function llmCompleteNew(
    prompt: string,
    max_tokens = 4000,
    temperature = 0.05
): Promise<string> {
    const model = openAIClient.models.getCompletion();
    if (model === undefined) {
        throw new TypechatException(
            TypechatErrorCode.CompletionModelNotAvailable
        );
    }
    return await openAIClient.getCompletion(
        prompt,
        model,
        max_tokens,
        temperature
    );
}
