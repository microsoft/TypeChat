// Copyright Microsoft Corp
// Utility methods for setting up tests
import * as fs from 'fs';
import * as path from 'path';
import * as config from '../../src/lib/typechatConfig';

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
