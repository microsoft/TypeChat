import { describe, expect, test } from '@jest/globals'
import stripJsonTrailingCommas from "./strip-whitespace";

describe('stripJsonTrailingCommas', () => {
    test('removes trailing comma after a boolean', () => {
        const input: string = '{"foo": true,}';
        const expectedOutput: string = '{"foo": true}';
        expect(stripJsonTrailingCommas(input)).toEqual(expectedOutput);
    });

    test('removes trailing comma after a number', () => {
        const input: string = '{"foo": 123,}';
        const expectedOutput: string = '{"foo": 123}';
        expect(stripJsonTrailingCommas(input)).toEqual(expectedOutput);
    });

    test('removes trailing comma after a string', () => {
        const input: string = '{"foo": "bar",}';
        const expectedOutput: string = '{"foo": "bar"}';
        expect(stripJsonTrailingCommas(input)).toEqual(expectedOutput);
    });

    test('removes trailing comma after an array', () => {
        const input: string = '{"foo": [],}';
        const expectedOutput: string = '{"foo": []}';
        expect(stripJsonTrailingCommas(input)).toEqual(expectedOutput);
    });

    test('removes trailing comma after an array item', () => {
        const input: string = '{"foo": ["bar", "baz",]}';
        const expectedOutput: string = '{"foo": ["bar", "baz"]}';
        expect(stripJsonTrailingCommas(input)).toEqual(expectedOutput);
    });
});
