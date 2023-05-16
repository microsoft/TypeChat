// Copyright Microsoft Corp

import * as readline from 'readline';
import { strEqInsensitive } from '../../lib/core';

export interface ConsoleSettings {
    greeting?: string;
    goodbye?: string;
    prompt?: string;
    quitStrings?: string[];
}

export class ConsoleUI {
    private _settings: ConsoleSettings;
    private _ux: readline.Interface;

    constructor(settings?: ConsoleSettings) {
        if (!settings) {
            settings = {};
        }
        this._settings = settings;
        this.fixupSettings();
        this._ux = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    public run(handler: (line: string) => Promise<string>): number {
        if (this._settings.prompt) {
            this._ux.setPrompt(this._settings.prompt);
        }
        this.printGreeting();

        this._ux.prompt();
        this._ux
            .on('line', async (line: string) => {
                line = line.trim();
                if (this.isStop(line)) {
                    this.printGoodbye();
                    this._ux.close();
                } else {
                    try {
                        const response = await handler(line);
                        if (response) {
                            console.log(response);
                        }
                    } catch (e) {
                        console.error(e);
                    }
                    console.log('');
                    this._ux.prompt();
                }
            })
            .on('close', () => {
                this.printGoodbye();
            });
        return 0;
    }

    private isStop(input: string): boolean {
        return (
            this._settings.quitStrings!.find((q: string) =>
                strEqInsensitive(q, input)
            ) !== undefined
        );
    }
    private fixupSettings(): void {
        if (!this._settings.quitStrings) {
            this._settings.quitStrings = ['quit', 'exit'];
        }
    }

    private printGreeting(): void {
        if (this._settings.greeting) {
            console.log(this._settings.greeting);
        }
        console.log('To stop, type:');
        console.log(this._settings.quitStrings!);
    }

    private printGoodbye(): void {
        if (this._settings.goodbye) {
            console.log(this._settings.goodbye);
        }
    }
}
