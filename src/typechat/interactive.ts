import fs from "fs";
import readline from "readline/promises";

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
