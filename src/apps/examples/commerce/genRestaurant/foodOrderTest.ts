import fs from 'fs';
import path from 'path';
import { runTests, runTestsInteractive, IPromptContext } from '../../../../lib';
import { Order } from './foodOrderSchema';

const schemaFilename = 'foodOrderSchema.ts';
// open schema file containing ts definitions
const schemaText = fs.readFileSync(
    path.join(__dirname, schemaFilename),
    'utf8'
);

const typeInterp = 'the list of items in a restaurant order';
const frame = 'a person is ordering  from a pizza restaurant by texting a bot';

const testPrompts = [
    "I'd like two large, one with pepperoni and the other with extra sauce.  The pepperoni gets basil and the extra sauce gets Canadian bacon.  And add a whole salad. Make the Canadian bacon a medium. Make the salad a Greek with no red onions.  And give me two Mack and Jacks and a Sierra Nevada.  Oh, and add another salad with no red onions.",
    "I'd like two large with olives and mushrooms.  And the first one gets extra sauce.  The second one gets basil.  Both get arugula.  And add a Pale Ale. Give me a two Greeks with no red onions, a half and a whole.  And a large with sausage and mushrooms.  Plus three Pale Ales and a Mack and Jacks.",
    "I'll take two pepperoni and give me the second one with olives.  Make the olive a small.  And give me whole Greek plus a Pale Ale and an M&J.",
    'I want three pizzas, one with mushrooms and the other two with sausage.  Make one sausage a small.  And give me a whole Greek and a Pale Ale.  And give me a Mack and Jacks.',
    'I would like to order one with basil and one with extra sauce.  Throw in a salad and an ale.',
    "I would love to have a pepperoni with extra sauce, basil and arugula. Lovely weather we're having. Throw in some pineapple.  And give me a whole Greek and a Pale Ale.  Boy, those Mariners are doggin it. And how about a Mack and Jacks.",
    "I'll have two pepperoni, the first with extra sauce and the second with basil.  Add pineapple to the first and add olives to the second.",
    "I sure am hungry for a pizza with pepperoni and a salad with no croutons.  And I'm thirsty for 3 Pale Ales",
    'give me three regular salads and two Greeks and make the regular ones with no red onions',
    "I'll take four pepperoni pizzas and two of them get extra sauce.  plus an M&J and a Pale Ale",
];

function printOrder(order: Order) {
    if (order.items && order.items.length > 0) {
        for (const item of order.items) {
            if (!item.quantity) {
                item.quantity = 1;
            }
            switch (item.type) {
                case 'pizza': {
                    if (!item.size) {
                        item.size = 'large';
                    }
                    let pizzaStr = `    ${item.quantity} ${item.size} pizza`;
                    if (item.toppings && item.toppings.length > 0) {
                        pizzaStr += ' with';
                        for (const [
                            index,
                            addedTopping,
                        ] of item.toppings.entries()) {
                            pizzaStr += `${
                                index === 0 ? ' ' : ', '
                            }${addedTopping}`;
                        }
                    }
                    console.log(pizzaStr);
                    break;
                }
                case 'beer': {
                    const beerStr = `    ${item.quantity} ${item.kind}`;
                    console.log(beerStr);
                    break;
                }
                case 'salad': {
                    if (!item.size) {
                        item.size = 'half';
                    }
                    if (!item.style) {
                        item.style = 'Garden';
                    }
                    let saladStr = `    ${item.quantity} ${item.size} ${item.style} salad`;
                    if (
                        item.removedIngredients &&
                        item.removedIngredients.length > 0
                    ) {
                        saladStr += ' without';
                        for (const [
                            index,
                            removedIngredient,
                        ] of item.removedIngredients.entries()) {
                            saladStr += `${
                                index === 0 ? ' ' : ', '
                            }${removedIngredient}`;
                        }
                    }
                    console.log(saladStr);
                    break;
                }
            }
        }
    }
}

export async function pizzaTests() {
    const promptContext: IPromptContext<Order> = {
        typeInterp,
        frame,
        schemaText,
        typeName: 'Order',
        handleResult: printOrder,
    };
    return await runTests(testPrompts, promptContext, 1);
}

// read arguments from command line
const args = process.argv.slice(2);
// if there are no arguments, run the tests
if (args.length === 0) {
    pizzaTests();
} else {
    if (args.length === 1 && args[0] === '-i') {
        const promptContext: IPromptContext<Order> = {
            typeInterp,
            frame,
            schemaText,
            typeName: 'Order',
            handleResult: printOrder,
        };
        runTestsInteractive(promptContext);
    }
}
