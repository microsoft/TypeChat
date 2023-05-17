import { PromptTemplate } from '../../src/lib/prompt';
import * as path from 'path';

test('Prompt: Template from file', () => {
    let promptPath = './tests/lib/testPrompt.txt';
    promptPath = path.resolve(promptPath);

    const prompt = PromptTemplate.fromFile(promptPath);
    const map = {
        botName: 'Simon',
        userName: 'Toby',
        input: 'Hello!',
    };
    const text = prompt.render(map);
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes('${')).toBeFalsy();
    expect(text.includes('}')).toBeFalsy();
    
});
