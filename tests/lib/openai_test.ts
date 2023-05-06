import * as oai from '../../src/lib/openai';
import * as config from '../../src/lib/typechatConfig';
import { Embedding } from '../../src/lib/embeddings';
import { TestContext } from './testing';
import * as fs from 'fs';
import * as path from 'path';

const test_texts: string[] = [
    'the quick brown fox jumps over the lazy dog',
    /*
    'He was born with a gift of laughter and a sense that the world was mad',
    'Far out in the uncharted backwaters of the unfashionable end of the western spiral arm of the Galaxy lies a small, unregarded yellow sun',
    */
];

export async function runTestsAsync(context: TestContext): Promise<void> {
    const configPath = path.resolve('./tests/appConfig.json');
    if (!fs.existsSync(configPath)) {
        context.log('No Config Found. OpenAI tests will not run ');
        return;
    }

    const tcConfig: config.TypechatConfig = config.loadConfig(
        './tests/appConfig.json'
    );

    const models = tcConfig.azureOAI.models;
    const client: oai.AzureOAIClient = new oai.AzureOAIClient(
        tcConfig.azureOAI
    );
    await testCompletions(context, models, client);
    await testEmbeddings(context, models, client);
}
runTestsAsync.TestName = 'OpenAI';

async function testCompletions(
    context: TestContext,
    models: oai.AzureOAIModel[],
    client: oai.AzureOAIClient
): Promise<void> {
    const texts: string[] = test_texts;
    for (let i = 0; i < texts.length; ++i) {
        for (let m = 0; m < models.length; ++m) {
            const model = models[m];
            if (
                model.type === oai.ModelType.Chat ||
                model.type === oai.ModelType.Completion
            ) {
                const result = await client.getCompletion(
                    texts[i],
                    model.modelName,
                    256,
                    0.2
                );
                context.assertNotNullOrEmpty(result);
            }
        }
    }
}

async function testEmbeddings(
    context: TestContext,
    models: oai.AzureOAIModel[],
    client: oai.AzureOAIClient
): Promise<void> {
    const texts: string[] = test_texts;
    for (let m = 0; m < models.length; ++m) {
        const model = models[m];
        if (model.type === oai.ModelType.Embedding) {
            const embeddings: Embedding[] = await client.createEmbeddings(
                texts,
                model.modelName
            );
            context.assertTrue(embeddings.length === texts.length);
            const x: Embedding = embeddings[0];
            for (let i = 1; i < embeddings.length; ++i) {
                x.cosineSimilarity(embeddings[i]);
            }
        }
    }
}
