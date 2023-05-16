import * as fs from 'fs';
import { Validator } from './core';

export interface IPromptTemplate {
    render(replacements: { [key: string]: string }): string;
}

//
// Maintains a raw prompt template and applies substitutions
// Substitutions follow standard ts syntax of ${varName}
// Prompts now don't have to be hardcoded in compiled code, can be refreshed, rewritten etc.
// Currently uses Regex, but we can optimize into a proper template if needed
//
export class PromptTemplate implements IPromptTemplate {
    private static defaultTemplateRegex = /\$\{(?<key>[^}]+)\}/g;

    private _template: string;
    private _replaceRegx: RegExp;

    constructor(
        template: string,
        replaceRegEx: RegExp = PromptTemplate.defaultTemplateRegex
    ) {
        Validator.notEmpty(template, 'template');
        this._template = template;
        this._replaceRegx = replaceRegEx;
    }
    public get template(): string {
        return this._template;
    }
    public render(replacements: { [key: string]: string }): string {
        const prompt = this._template.replace(
            this._replaceRegx,
            (match, key) => {
                let value = replacements[key];
                if (value === undefined) {
                    value = '';
                }
                return value;
            }
        );
        return prompt;
    }

    public static fromFile(filePath: string): PromptTemplate {
        const data = fs.readFileSync(filePath, 'utf8');
        return new PromptTemplate(data);
    }
}
