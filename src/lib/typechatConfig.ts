// (c) Copyright Microsoft Corp

import * as fs from 'fs';
import * as process from 'process';
import { Validator } from './core';
import * as oai from './openai';
import { TypechatErrorCode, TypechatException } from './typechatException';

/**
 * Configuration for Typechat.
 * Typically parsed from a JSON source.
 * This is not necessarily the final form of how config will look like.
 * But since time is of the essence...
 */
export type TypechatConfig = {
    azureOAI?: oai.OpenAISettings; // Azure AI configuration
    OAI?: oai.OpenAISettings; // Open AI
};

// I am sure there is an automated way to do this.
// This manually visits the tree for now
export function validate(config: TypechatConfig): void {
    Validator.defined(config, 'config');

    let hasOpenAISettings = false;
    if (Validator.isDefined(config.azureOAI)) {
        oai.validateOAISettings(config.azureOAI!);
        hasOpenAISettings = true;
    } else if (Validator.isDefined(config.OAI)) {
        oai.validateOAISettings(config.OAI!);
        hasOpenAISettings = true;
    }
    if (!hasOpenAISettings) {
        throw new TypechatException(
            TypechatErrorCode.ConfigMissingOpenAISettings
        );
    }
}
/**
 *
 * @param configPath - load config from this file path. Assumes file  exists
 * @param autoValidate: useful for tools etc..
 * @returns Typechat configuration object
 */
export function fromFile(
    configPath: string,
    autoValidate = true
): TypechatConfig {
    const data = fs.readFileSync(configPath, 'utf8');
    const config: TypechatConfig = JSON.parse(data);
    if (autoValidate) {
        validate(config);
    }
    return config;
}

export function fromEnv(autoValidate = true): TypechatConfig {
    const config: TypechatConfig = {
        azureOAI: settingsFromEnv(),
    };
    if (autoValidate) {
        validate(config);
    }
    return config;
}

function settingsFromEnv(): oai.OpenAISettings {
    let modelName = process.env.MODEL_NAME;
    const deployment = process.env.DEPLOYMENT_NAME;
    if (modelName === undefined) {
        modelName = deployment;
    }
    return {
        apiKey: process.env.OPENAI_API_KEY as string,
        endpoint: process.env.OPENAI_API_BASE as string,
        models: [
            {
                modelName: modelName as string,
                deployment: deployment as string,
            },
        ],
    };
}
