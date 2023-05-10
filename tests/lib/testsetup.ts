// Copyright Microsoft Corp
// Utility methods for setting up tests
import * as fs from 'fs';
import * as path from 'path';
import * as config from '../../src/lib/typechatConfig';
import * as process from 'process';

export function loadConfig(): config.TypechatConfig | null {
    let configPath = './tests/lib/appConfig.json';
    configPath = path.resolve('./tests/lib/appConfig.json');
    if (!fs.existsSync(configPath)) {
        console.log('No Config Found. Embedding tests will not run ');
        return null;
    }
    try {
        return config.fromFile(configPath, true); // eslint-disable-next-line no-empty
    } catch {}
    return null;
}

export function getEnv(name: string): string | undefined {
    return process.env[name];
}

export function setEnv(name: string, value: string | undefined): void {
    if (value !== undefined) {
        process.env[name] = value;
    }
}
