import * as chat from '../../src/lib/agent';
import * as setup from './testsetup';
import * as tcConfig from '../../src/lib/typechatConfig';
import * as oai from '../../src/lib/openai';

const g_config = setup.loadConfig();

// These tests can go long due to throttling
jest.setTimeout(60000);

test('Chat: EventHistory', () => {
    const history = new chat.EventHistory<chat.ChatMessage>();
    const numMessages = 50;
    for (let i = 0; i < numMessages; ++i) {
        const sourceType =
            i % 2 === 0 ? chat.SourceType.User : chat.SourceType.AI;
        history.append({
            text: 'Message: ' + i.toString(),
            source: {
                type: sourceType,
                name: sourceType.toString(),
            },
        });
    }
    expect(history.length).toEqual(numMessages);
    let iMsg = numMessages - 1;
    for (const msg of history.allEvents()) {
        expect(msg.data.text).toEqual(history.get(iMsg).data.text);
        --iMsg;
    }

    const targetLength = 100;
    const context = new chat.ChatContextBuilder(targetLength);
    const result = context.buildContext('foo', history.allEvents());
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(targetLength);
});

test('Chat: Basic Chat', async () => {
    if (g_config === null || g_config?.azureOAI === undefined) {
        console.log('No AI configuration. Chat: Basic Chat disabled');
        return;
    }
    const openAIClient = new oai.OpenAIClient(g_config.azureOAI, true);
    const model = openAIClient.models.getCompletion();
    if (model === undefined) {
        console.log('No available model. Chat: Basic Chat disabled');
        return;
    }
    const chatSettings: chat.IChatSettings = {
        modelName: model.modelName,
        maxTokensIn: 1000,
        maxTokensOut: 100,
    };
    const chatBot = new chat.Chat(chatSettings, openAIClient);
    const messages = [
        'Hello, my name is Toby McDuff. I am a cute cairn terrier!',
        'Woof woof',
        'Oh yeah? Tell me more!',
    ];
    const history = chatBot.history as chat.EventHistory<chat.ChatMessage>;
    for (let i = 0; i < messages.length; ++i) {
        const response = await chatBot.getResponse(messages[i]);
        expect(history.length).toBe((i + 1) * 2);

        const requestData = history.get(i * 2).data;
        const responseData = history.get(i * 2 + 1).data;
        expect(requestData.text).toEqual(messages[i]);
        expect(responseData.text).toEqual(response);
    }
});
