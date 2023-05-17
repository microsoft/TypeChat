import { ConsoleUI } from './consoleui';
import { ChatApp } from './chatAppLib';

const client = ChatApp.createAIClientFromEnv();
const settings = ChatApp.createBotSettings(client);
const chat = new ChatApp(client, settings, 1000, 1000, 0.7);
const ux = new ConsoleUI({
    greeting: 'You are now Chatting with ' + chat.bot.modelInfo?.name,
    goodbye: 'Goodbye',
    prompt: '?:',
});
ux.run((message) => chat.InputHandler(message));
