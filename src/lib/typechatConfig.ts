// (c) Copyright Microsoft Corp

import * as fs from 'fs';
import { Validator } from './core';
import * as oai from './openai';

/**
 * Configuration for Typechat.
 * Typically parsed from a JSON source.
 * This is not necessarily the final form of how config will look like.
 * But since time is of the essence...
 */
export type TypechatConfig = {
    azureOAI: oai.AzureOAISettings; // Azure AI configuration
};

// I am sure there is an automated way to do this.
// This manually visits the tree for now
export function validate(config: TypechatConfig): void {
    Validator.exists(config, 'config');
    Validator.exists(config.azureOAI, 'azureOAI');
    oai.validateAzureOAISettings(config.azureOAI);
}
/**
 *
 * @param configPath - load config from this file path. Assumes file  exists
 * @param autoValidate: useful for tools etc..
 * @returns Typechat configuration object
 */
export function loadConfig(
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
