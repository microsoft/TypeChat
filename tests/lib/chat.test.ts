import { AgentEventList } from '../../src/lib/chat/agentHistory';
import {
    Message,
    MessageSource,
    MessageSourceType,
} from '../../src/lib/chat/agent';
import {
    ChatBot,
    ChatBotSettings,
    ContextBuffer,
} from '../../src/lib/chat/chatBot';
import * as setup from './testsetup';
import { OpenAIClient, ModelSettings, ModelType } from '../../src/lib/openai';
import * as vector from '../../src/lib/embeddings';

import { TypechatErrorCode, TypechatException } from '../../src/lib';

const g_config = setup.loadConfig();

// These tests can go long due to throttling
jest.setTimeout(120 * 1000);

function getChatAI(): [OpenAIClient, ModelSettings] {
    if (g_config === null || g_config?.azureOAI === undefined) {
        throw new TypechatException(
            TypechatErrorCode.CompletionModelNotAvailable
        );
    }
    const client = new OpenAIClient(g_config.azureOAI, true);
    const model = client.models.getCompletion();
    if (model === undefined) {
        throw new TypechatException(
            TypechatErrorCode.CompletionModelNotAvailable
        );
    }
    return [client, model];
}

test('Chat: EventHistory', async () => {
    const history = new AgentEventList<Message>();
    const numMessages = 50;
    for (let i = 0; i < numMessages; ++i) {
        const sourceType =
            i % 2 === 0 ? MessageSourceType.User : MessageSourceType.AI;
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
    const context = new ContextBuffer(targetLength);
    context.start();
    context.append('foo');
    context.appendEvents(history.allEvents());
    const result = await context.complete();

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(targetLength);
});

test('Chat: Basic Chat', async () => {
    const [chatAI, model] = getChatAI();
    const settings: ChatBotSettings = {
        userName: 'Toby',
        botName: 'Simon',
        chatModelName: model.modelName,
    };
    settings.promptStartBlock = `You are friendly bot named ${settings.botName} having a conversation with ${settings.userName}`;
    const chatBot = new ChatBot(chatAI, settings);
    chatBot.maxContextLength = 256;
    const messages = [
        'Hello, my name is Toby McDuff. I am a cute cairn terrier!',
        'Woof woof',
        'Oh yeah? Tell me more!',
    ];
    await runMessages(chatBot, messages);
});

test('Chat: Relevance Chat', async () => {
    const [chatAI, model] = getChatAI();
    const emodel = chatAI.models.getByType(ModelType.Embedding);
    if (emodel === undefined) {
        throw new TypechatException(
            TypechatErrorCode.EmbeddingModelNotAvailable
        );
    }
    const embeddingGenerator = new vector.OpenAITextEmbeddingGenerator(
        chatAI,
        emodel.modelName
    );
    const settings: ChatBotSettings = {
        userName: 'Toby',
        botName: 'Simon',
        chatModelName: model.modelName,
        relevancy: {
            embeddingGenerator: embeddingGenerator,
            topN: 2,
            minScore: 0,
        },
    };
    settings.promptStartBlock = `You are friendly bot named ${settings.botName} having a conversation with ${settings.userName}`;
    const chatBot = new ChatBot(chatAI, settings);
    chatBot.maxContextLength = 256;
    const messageSource: MessageSource = {
        name: 'Toby',
        type: MessageSourceType.User,
    };
    const messages = [
        'Hello, my name is Toby McDuff. I am a cute cairn terrier!',
        'Woof woof',
        'Oh yeah? Tell me more!',
    ];
    await runMessages(chatBot, messages);
});

async function runMessages(
    chatBot: ChatBot,
    messages: string[]
): Promise<void> {
    const history = chatBot.history;
    for (let i = 0; i < messages.length; ++i) {
        const response = await chatBot.getCompletion(messages[i], 100, 0.7);
        expect(history.count).toBe((i + 1) * 2);

        const requestData = history.get(i * 2).data;
        const responseData = history.get(i * 2 + 1).data;
        expect(requestData.text).toEqual(messages[i]);
        expect(responseData.text).toEqual(response);
    }
}
