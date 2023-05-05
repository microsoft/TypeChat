import { TestContext } from './testing';
import * as tcConfig from '../src/typechatConfig';
import * as fs from 'fs';
import * as path from 'path';

export function runTests(context: TestContext): void {
    testConfig(context);
}
runTests.TestName = 'Config';

function testConfig(context: TestContext): void {
    const configPath = path.resolve('./tests/appConfig.json');
    if (!fs.existsSync(configPath)) {
        return;
    }

    const config = tcConfig.loadConfig(configPath, false);
    tcConfig.validate(config);
}
