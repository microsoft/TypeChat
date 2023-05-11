import * as config from './typechatConfig';
import * as oai from './openai';
import { TypechatErrorCode, TypechatException } from './typechatException';

// This is short term. Duplicating existing behavior
const tcConfig: config.TypechatConfig = config.fromEnv();
const openAIClient: oai.OpenAIClient = new oai.OpenAIClient(
    tcConfig.azureOAI as oai.OpenAISettings,
    true
);

export async function llmComplete(
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
