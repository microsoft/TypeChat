import * as setup from './testsetup';
import * as tcConfig from '../../src/lib/typechatConfig';
import * as oai from '../../src/lib/openai';
import * as process from 'process';

const g_config = setup.loadConfig();
// These tests can go long due to throttling
jest.setTimeout(60000);

const test_texts: string[] = [
    'He was born with a gift of laughter and a sense that the world was mad',
    'Far out in the uncharted backwaters of the unfashionable end of the western spiral arm of the Galaxy lies a small, unregarded yellow sun',
];

test('OpenAI: Completion', async () => {
    if (g_config === null) {
        console.log('No configuration. OpenAI tests disabled');
        return;
    }

    const client = new oai.AzureOAIClient(g_config?.azureOAI);
    const model = client.models.getCompletion();
    expect(model).toBeDefined();
    if (model === undefined) {
        return;
    }
    const response = await client.getCompletion(test_texts[0], model, 100);
    expect(response.length).toBeGreaterThan(0);
});

// Here we duplicate some functions in llm.ts
test('OpenAI: llmCompletion', async () => {
    if (g_config === null) {
        console.log('No configuration. OpenAI tests disabled');
        return;
    }

    const apiKey = setup.getEnv('OPENAI_API_KEY');
    const apiBase = setup.getEnv('OPENAI_API_BASE');
    const deployment = setup.getEnv('DEPLOYMENT_NAME');
    try {
        setup.setEnv('OPENAI_API_KEY', g_config.azureOAI.apiKey);
        setup.setEnv('OPENAI_API_BASE', g_config.azureOAI.endpoint);
        setup.setEnv('DEPLOYMENT_NAME', g_config.azureOAI.models[0].deployment);

        const envConfig = tcConfig.fromEnv();
        const openAIClient = new oai.AzureOAIClient(envConfig.azureOAI);
        const model = openAIClient.models.getCompletion();
        if (model !== undefined) {
            const result = await openAIClient.getCompletion(
                test_texts[0],
                model,
                100
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
