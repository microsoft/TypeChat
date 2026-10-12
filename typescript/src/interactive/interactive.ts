import fs from "fs";
import readline from "readline/promises";

/**
 * A request processor for interactive input or input from a text file. If an input file name is specified,
 * the callback function is invoked for each line in file. Otherwise, the callback function is invoked for
 * each line of interactive input until the user types "quit" or "exit".
 * @param interactivePrompt Prompt to present to user.
 * @param inputFileName Input text file name, if any.
 * @param processRequest Async callback function that is invoked for each interactive input or each line in text file.
 */
export async function processRequests(interactivePrompt: string, inputFileName: string | undefined, processRequest: (request: string) => Promise<void>) {
    if (inputFileName) {
        const lines = fs.readFileSync(inputFileName).toString().split(/\r?\n/);
        for (const line of lines) {
            if (line.length) {
                console.log(interactivePrompt + line);
                await processRequest(line);
            }
        }
    }
    else {
        const stdio = readline.createInterface({ input: process.stdin, output: process.stdout });
        while (true) {
            const input = await stdio.question(interactivePrompt);
            if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") {
                break;
            }
            else if (input.length) {
                await processRequest(input);
            }
        }
        stdio.close();
    }
}
