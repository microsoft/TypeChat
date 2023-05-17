import { ChatBot, ChatBotSettings } from '../../lib/chat/chatBot';
import { IPromptContext, makePrompt } from '../../lib/typechat';

// Multi-turn but with a single schema
/*
export class TypechatApp<TSchema> {
    _promptContext: IPromptContext<TSchema>;
    _bot: ChatBot;

    constructor(prompt: IPromptContext<TSchema>) {
        this._promptContext = prompt;
    }

    private createBotSetting(): ChatBotSettings {

    }
}
*/