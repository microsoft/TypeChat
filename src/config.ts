import * as fs from 'fs';
import {ModelSettings} from './openai';

export type AppConfig = {
    models : ModelSettings[];
}

export function loadConfig(configPath : string) : AppConfig {
    const data = fs.readFileSync(configPath, 'utf8');
    let config: AppConfig = JSON.parse(data);
    return config;
}
