import { Result, success, error } from './result.js';
import { ChatOpenAI } from '@langchain/openai';
import type { Runnable } from '@langchain/core/runnables';
import type { BaseFunctionCallOptions, BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { BaseMessageChunk } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * Represents a section of an LLM prompt with an associated role. TypeChat uses the "user" role for
 * prompts it generates and the "assistant" role for previous LLM responses (which will be part of
 * the prompt in repair attempts). TypeChat currently doesn't use the "system" role.
 */
export type PromptSection = Parameters<Runnable<BaseLanguageModelInput, BaseMessageChunk, BaseFunctionCallOptions>['invoke']>[0];

/**
 * Represents a AI language model that can complete prompts. TypeChat uses an implementation of this
 * interface to communicate with an AI service that can translate natural language requests to JSON
 * instances according to a provided schema. The `createLanguageModel`, `createOpenAILanguageModel`,
 * and `createAzureOpenAILanguageModel` functions create instances of this interface.
 */
export interface TypeChatLanguageModel {
	/**
	 * Optional property that specifies the maximum number of retry attempts (the default is 3).
	 */
	retryMaxAttempts?: number;
	/**
	 * Optional property that specifies the delay before retrying in milliseconds (the default is 1000ms).
	 */
	retryPauseMs?: number;
	/**
	 * Obtains a completion from the language model for the given prompt.
	 * @param prompt A prompt string or an array of prompt sections. If a string is specified,
	 *   it is converted into a single "user" role prompt section.
	 */
	complete(prompt: string | PromptSection): Promise<Result<string>>;
}

/**
 * Creates a language model encapsulation of an OpenAI or Azure OpenAI REST API endpoint
 * chosen by environment variables.
 *
 * If an `OPENAI_API_KEY` environment variable exists, the `createOpenAILanguageModel` function
 * is used to create the instance. The `OPENAI_ENDPOINT` and `OPENAI_MODEL` environment variables
 * must also be defined or an exception will be thrown.
 *
 * If an `AZURE_OPENAI_API_KEY` environment variable exists, the `createAzureOpenAILanguageModel` function
 * is used to create the instance. The `AZURE_OPENAI_ENDPOINT` environment variable must also be defined
 * or an exception will be thrown.
 *
 * If none of these key variables are defined, an exception is thrown.
 * @returns An instance of `TypeChatLanguageModel`.
 */
export function createLanguageModel(chatModel: Runnable<BaseLanguageModelInput, BaseMessageChunk, BaseFunctionCallOptions>): TypeChatLanguageModel {
	if (chatModel) {
		if (chatModel instanceof ChatOpenAI) {
			chatModel = (chatModel as ChatOpenAI).bind({
				response_format: { type: 'json_object' },
			});
		}
		return createLangchianLanguageModel(chatModel);
	} else {
		throw new Error('Missing langchain model');
	}
}

/**
 * Common OpenAI REST API endpoint encapsulation using the fetch API.
 */
function createLangchianLanguageModel(chatModel: Runnable<BaseLanguageModelInput, BaseMessageChunk, BaseFunctionCallOptions>) {
	const model: TypeChatLanguageModel = {
		complete,
	};
	return model;

	async function complete(prompt: string | PromptSection) {
		let retryCount = 0;
		const retryMaxAttempts = model.retryMaxAttempts ?? 3;
		const retryPauseMs = model.retryPauseMs ?? 1000;
		const messages: typeof prompt = typeof prompt === 'string' ? [['user', prompt]] : prompt;

		while (true) {
			const outputParser = new StringOutputParser();

			try {
				const response = await chatModel.pipe(outputParser).invoke(messages);

				return success(response ?? '');
			} catch (err) {
				if (retryCount >= retryMaxAttempts) {
					return error(`API error ${err}`);
				}
			}

			await sleep(retryPauseMs);
			retryCount++;
		}
	}
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
