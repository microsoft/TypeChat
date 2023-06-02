import fs from 'fs';
import path from 'path';
import { runTests, runTestsInteractive, IPromptContext } from '../../../lib';
import { Requests } from './metaSchema';

const schemaFilename = 'metaSchema.ts';
const schemaText = fs.readFileSync(
    path.join(__dirname, schemaFilename),
    'utf8'
);

const typeInterp =
    'a list of user requests and the application relevant to that request';
const frame =
    'A person is working with a generative AI model on a broad set of applications';

const testPrompts = [
    "I'd like two large, one with pepperoni and the other with extra sauce.  The pepperoni gets basil and the extra sauce gets Canadian bacon.  And add a whole salad. Make the Canadian bacon a medium. Make the salad a Greek with no red onions.  And give me two Mack and Jacks and a Sierra Nevada.  Oh, and add another salad with no red onions.",
    "I'd like two large with olives and mushrooms.  And the first one gets extra sauce.  The second one gets basil.  Both get arugula.  And add a Pale Ale. Give me a two Greeks with no red onions, a half and a whole.  And a large with sausage and mushrooms.  Plus three Pale Ales and a Mack and Jacks.",
    "I'll take four pepperoni pizzas and two of them get extra sauce.  plus an M&J and a Pale Ale",
    'Add meeting with team today at 2',
    'can you record lunch with Luis at 12pm on Friday and also add Isobel to the Wednesday ping pong game at 4pm',
    "I said I'd meet with Jenny this afternoon at 2pm and after that I need to go to the dry cleaner and then the soccer game.  Leave an hour for each of those starting at 3:30",
    "I'd like a half caf latte and a bagel with locks",
    'two grande mochas and a decaf espresso',
    'play Taylor Swift Shake It Off',
    'make a playlist of my tracks from the past week that have animals in their names and name the playlist animalTracks',
    'get my top ten tracks since January',
];

const promptContext: IPromptContext<Requests> = {
    typeInterp,
    frame,
    schemaText,
    typeName: 'Requests',
};

export async function metaTests() {
    return await runTests(testPrompts, promptContext, 1);
}

// read arguments from command line
const args = process.argv.slice(2);
// if there are no arguments, run the tests
if (args.length === 0) {
    metaTests();
} else {
    if (args.length === 1 && args[0] === '-i') {
        runTestsInteractive(promptContext);
    }
}
