// (c) Copyright Microsoft Corp

import * as fs from 'fs';
import {ModelAPISettings} from './openai';

export type TypechatConfig = {
    completionModel: ModelAPISettings;
    embeddingModel: ModelAPISettings;
};

/**
 *
 * @param configPath - load config from this file path. Assumes file  exists
 * @returns Typechat configuration object
 */
export function loadConfig(configPath: string): TypechatConfig {
    const data = fs.readFileSync(configPath, 'utf8');
    const config: TypechatConfig = JSON.parse(data);
    return config;
}
