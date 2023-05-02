import {ModelInfo, Models} from "../src/openai";
import {TestContext} from  "./testing";
import { AppConfig, loadConfig } from "../src/config";
import * as fs from 'fs';
import * as path from 'path';

export function runTests(context : TestContext) : void {
    testConfig(context);
}
runTests.TestName = "OpenAI";

function testConfig(context: TestContext) : void {
    const configPath = path.resolve("./src/appConfig.json");
    if (!fs.existsSync(configPath)) {
        return;
    }

    let config : AppConfig = loadConfig(configPath);
    context.log(config.models.length);
    for (let i = 0; i < config.models.length; ++i)
    {
        context.assertNotNullOrEmpty(config.models[i].endpoint);
        context.assertNotNullOrEmpty(config.models[i].apiKey);
    }
}