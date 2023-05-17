import * as config from '../../lib/typechatConfig';
import { ChatBot, ChatBotSettings } from '../../lib/chat/chatBot';
import { ConsoleUI } from './consoleui';
import { OpenAIClient } from '../../lib';

//
// Have a conversation with the AI
//
export class ChatApp {
    private _bot: ChatBot;
    private _maxTokens: number;
    private _temperature: number;

    constructor(
        maxContextLength: number,
        maxTokens: number,
        temperature: number
    ) {
        const client = this.createAIClient();
        const botSettings = this.createBotSettings(client);
        this._bot = new ChatBot(client, botSettings);
        this._bot.maxContextLength = maxContextLength;
        this._maxTokens = maxTokens;
        this._temperature = temperature;
    }

    public get bot(): ChatBot {
        return this._bot;
    }

    public async InputHandler(userInput: string): Promise<string> {
        return this._bot.getCompletion(
            userInput,
            this._maxTokens,
            this._temperature
        );
    }

    private createAIClient(): OpenAIClient {
        const tcConfig = config.fromEnv(true);
        let oaiClient;
        if (tcConfig.azureOAI) {
            oaiClient = new OpenAIClient(tcConfig.azureOAI, true);
        } else if (tcConfig.OAI) {
            oaiClient = new OpenAIClient(tcConfig.OAI, false);
        } else {
            throw new Error('No AI configured');
        }
        return oaiClient;
    }

    private createBotSettings(client: OpenAIClient): ChatBotSettings {
        const settings: ChatBotSettings = {
            userName: ConsoleUI.getArg(0, 'Toby'),
            botName: ConsoleUI.getArg(1, 'Simon'),
            chatModelName: client.settings.models[0].modelName,
        };
        //
        // This prompt should be moved to use the prompt template object
        // Allow for easy customization, loading template from a file etc
        //
        let prompt = `This is a conversation between ${settings.userName} and you.\n`;
        prompt += `Your Name: ${settings.botName}\n`;
        prompt += `ONLY SPEAK FOR ${settings.botName}\n. *NEVER* SAY ANYTHING AS ${settings.userName}`;
        prompt +=
            `${settings.userName}\n Looking forward to our talk? Here goes\n` +
            `${settings.botName}\n Of course, me too. Go on!\n`;
        settings.promptStartBlock = prompt;
        settings.promptEndBlock = `\n${settings.botName}\n`;
        return settings;
    }
}

const chat = new ChatApp(1000, 1000, 0.7);
const ux = new ConsoleUI({
    greeting: 'You are now Chatting with ' + chat.bot.modelInfo?.name,
    goodbye: 'Goodbye',
    prompt: '?:',
});
ux.run((message) => chat.InputHandler(message));
