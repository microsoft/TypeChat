import * as setup from './testsetup';
import * as tcConfig from '../../src/lib/typechatConfig';
import * as oai from '../../src/lib/openai';

const g_config = setup.loadConfig();
// These tests can go long due to throttling
jest.setTimeout(60000);

const test_texts: string[] = [
    'He was born with a gift of laughter and a sense that the world was mad',
    'Far out in the uncharted backwaters of the unfashionable end of the western spiral arm of the Galaxy lies a small, unregarded yellow sun',
];

test('OpenAI: OpenAI Direct', async () => {
    if (g_config === null || g_config?.OAI === undefined) {
        console.log('No configuration. OpenAI Direct disabled');
        return;
    }
    const client = new oai.OpenAIClient(g_config?.OAI, false);
    const model = client.models.getCompletion();
    if (model === undefined) {
        console.log('No completion model. Test will not run');
        return;
    }
    const response = await client.getCompletion(test_texts[0], model, 100);
    expect(response.length).toBeGreaterThan(0);
});

test('OpenAI: AzureOpenAI Direct', async () => {
    if (g_config === null || g_config?.azureOAI === undefined) {
        console.log('No configuration. OpenAI Direct disabled');
        return;
    }
    const client = new oai.OpenAIClient(g_config?.azureOAI, true);
    let model = client.models.getByType(oai.ModelType.Completion);
    if (model !== undefined) {
        const response = await client.getCompletion(test_texts[0], model, 100);
        expect(response.length).toBeGreaterThan(0);
    }
    model = client.models.getByType(oai.ModelType.Chat);
    if (model !== undefined) {
        // Also do a completion on the chat model
        const response = await client.getCompletion(test_texts[0], model, 100);
        expect(response.length).toBeGreaterThan(0);
    }
});

// Here we duplicate some functions in llm.ts
test('OpenAI: llmCompletion', async () => {
    if (g_config === null || g_config.azureOAI === undefined) {
        console.log('No configuration. llmCompletion disabled');
        return;
    }

    const apiKey = setup.getEnv('OPENAI_API_KEY');
    const apiBase = setup.getEnv('OPENAI_API_BASE');
    const deployment = setup.getEnv('DEPLOYMENT_NAME');
    try {
        setup.setEnv('OPENAI_API_KEY', g_config.azureOAI.apiKey);
        setup.setEnv('OPENAI_API_BASE', g_config.azureOAI.endpoint);
        setup.setEnv(
            'DEPLOYMENT_NAME',
            g_config.azureOAI!.models[0].deployment
        );

        const envConfig = tcConfig.fromEnv();
        expect(envConfig.azureOAI).toBeDefined();
        if (envConfig.azureOAI === undefined) {
            console.log('No configuration. llmCompletion disabled');
            return;
        }
        const openAIClient = new oai.OpenAIClient(envConfig.azureOAI, true);
        const model = openAIClient.models.getCompletion();
        if (model !== undefined) {
            const result = await openAIClient.getCompletion(
                test_texts[0],
                model,
                100,
                0.05
            );
            expect(result.length).toBeGreaterThan(0);
        } else {
            console.log('No completion model available. Tests will not run.');
        }
    } finally {
        // Restore variables
        setup.setEnv('OPENAI_API_KEY', apiKey);
        setup.setEnv('OPENAI_API_BASE', apiBase);
        setup.setEnv('DEPLOYMENT_NAME', deployment);
    }
});
