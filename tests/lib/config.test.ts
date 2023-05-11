import * as tcConfig from '../../src/lib/typechatConfig';
import * as fs from 'fs';
import * as path from 'path';

test('ConfigTests: TestConfig', () => {
    let configPath = './tests/lib/appConfig.json';
    configPath = path.resolve(configPath);
    if (!fs.existsSync(configPath)) {
        console.log('No config file. Config tests will be ignored');
        return;
    }

    const config = tcConfig.fromFile(configPath, false);
    tcConfig.validate(config);
});
