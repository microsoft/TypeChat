import * as chat from '../../src/lib/chatAgent';
import * as setup from './testsetup';
import * as oai from '../../src/lib/openai';

const g_config = setup.loadConfig();
let g_ai: oai.OpenAIClient;

if (g_config === null || g_config?.azureOAI === undefined) {
    console.log('No AI configuration. Chat tests disabled');
} else {
    g_ai = new oai.OpenAIClient(g_config.azureOAI, true);
}

// These tests can go long due to throttling
jest.setTimeout(60000);

test('Chat: EventHistory', async () => {
    const history = new chat.EventHistory<chat.Message>();
    const numMessages = 50;
    for (let i = 0; i < numMessages; ++i) {
        const sourceType =
            i % 2 === 0
                ? chat.MessageSourceType.User
                : chat.MessageSourceType.AI;
        history.append({
            text: 'Message: ' + i.toString(),
            source: {
                type: sourceType,
                name: sourceType.toString(),
            },
        });
    }
    expect(history.count).toEqual(numMessages);
    let iMsg = numMessages - 1;
    for (const msg of history.allEvents()) {
        expect(msg.data.text).toEqual(history.get(iMsg).data.text);
        --iMsg;
    }

    const targetLength = 100;
    const context = new chat.ContextBuilder(targetLength);
    context.start();
    context.append('foo');
    context.appendEvents(history.allEvents());
    const result = await context.complete();

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(targetLength);
});

test('Chat: Basic Chat', async () => {
    if (g_ai === undefined) {
        console.log('No AI configuration. Chat: Basic Chat disabled');
        return;
    }
    const model = g_ai.models.getCompletion();
    if (model === undefined) {
        console.log('No available model. Chat: Basic Chat disabled');
        return;
    }
    const settings: chat.ChatSettings = {
        userName: 'Toby',
        botName: 'Simon',
        chatModelName: model.modelName,
    };
    settings.promptStartBlock = `You are friendly bot named ${settings.botName} having a conversation with ${settings.userName}`;
    const chatBot = new chat.ChatBot(g_ai, settings);
    chatBot.maxContextLength = 256;
    const messages = [
        'Hello, my name is Toby McDuff. I am a cute cairn terrier!',
        'Woof woof',
        'Oh yeah? Tell me more!',
    ];
    const history = chatBot.history as chat.EventHistory<chat.Message>;
    for (let i = 0; i < messages.length; ++i) {
        const response = await chatBot.getCompletion(messages[i], 100, 0.7);
        expect(history.count).toBe((i + 1) * 2);

        const requestData = history.get(i * 2).data;
        const responseData = history.get(i * 2 + 1).data;
        expect(requestData.text).toEqual(messages[i]);
        expect(responseData.text).toEqual(response);
    }
});
