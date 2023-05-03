import {TestContext} from './testing';
import {ModelAPISettings} from '../src/openai';
import {TypechatConfig, loadConfig} from '../src/typechatConfig';
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

    const config: TypechatConfig = loadConfig(configPath);
    testModelConfig(context, config.completionModel);
    testModelConfig(context, config.embeddingModel);
}

function testModelConfig(context: TestContext, model: ModelAPISettings) {
    context.assertNotNullOrEmpty(model.endpoint);
    context.assertNotNullOrEmpty(model.apiKey);
}
