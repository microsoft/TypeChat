enum ParseState {
    SingleLineComment,
    MultiComment,
    OutsideComment,
}

const stripWithoutWhitespace = () => '';
const stripWithWhitespace = (s: string, start?: number, end?: number) =>
    s.slice(start, end).replace(/\S/g, ' ');

const isEscaped = (jsonString: string, quotePosition: number) => {
    let index = quotePosition - 1;
    let backslashCount = 0;

    while (jsonString[index] === '\\') {
        index -= 1;
        backslashCount += 1;
    }

    return Boolean(backslashCount % 2);
};

export function stripJsonComments(
    jsonString: string,
    { whitespace = true, trailingCommas = false } = {}
) {
    const strip = whitespace ? stripWithWhitespace : stripWithoutWhitespace;

    let isInsideString = false;
    let parseState = ParseState.OutsideComment;
    let offset = 0;
    let buffer = '';
    let result = '';
    let commaIndex = -1;

    for (let index = 0; index < jsonString.length; index++) {
        const currentCharacter = jsonString[index];
        const nextCharacter = jsonString[index + 1];

        if (
            parseState === ParseState.OutsideComment &&
            currentCharacter === '"'
        ) {
            // Enter or exit string
            const escaped = isEscaped(jsonString, index);
            if (!escaped) {
                isInsideString = !isInsideString;
            }
        }

        if (isInsideString) {
            continue;
        }

        if (!parseState && currentCharacter + nextCharacter === '//') {
            // Enter single-line comment
            buffer += jsonString.slice(offset, index);
            offset = index;
            parseState = ParseState.SingleLineComment;
            index++;
        } else if (
            parseState === ParseState.SingleLineComment &&
            currentCharacter + nextCharacter === '\r\n'
        ) {
            // Exit single-line comment via \r\n
            index++;
            parseState = ParseState.OutsideComment;
            buffer += strip(jsonString, offset, index);
            offset = index;
            continue;
        } else if (
            parseState === ParseState.SingleLineComment &&
            currentCharacter === '\n'
        ) {
            // Exit single-line comment via \n
            parseState = ParseState.OutsideComment;
            buffer += strip(jsonString, offset, index);
            offset = index;
        } else if (
            parseState === ParseState.OutsideComment &&
            currentCharacter + nextCharacter === '/*'
        ) {
            // Enter multiline comment
            buffer += jsonString.slice(offset, index);
            offset = index;
            parseState = ParseState.MultiComment;
            index++;
            continue;
        } else if (
            parseState === ParseState.MultiComment &&
            currentCharacter + nextCharacter === '*/'
        ) {
            // Exit multiline comment
            index++;
            parseState = ParseState.OutsideComment;
            buffer += strip(jsonString, offset, index + 1);
            offset = index + 1;
            continue;
        } else if (trailingCommas && !parseState) {
            if (commaIndex !== -1) {
                if (currentCharacter === '}' || currentCharacter === ']') {
                    // Strip trailing comma
                    buffer += jsonString.slice(offset, index);
                    result += strip(buffer, 0, 1) + buffer.slice(1);
                    buffer = '';
                    offset = index;
                    commaIndex = -1;
                } else if (
                    currentCharacter !== ' ' &&
                    currentCharacter !== '\t' &&
                    currentCharacter !== '\r' &&
                    currentCharacter !== '\n'
                ) {
                    // Hit non-whitespace following a comma; comma is not trailing
                    buffer += jsonString.slice(offset, index);
                    offset = index;
                    commaIndex = -1;
                }
            } else if (currentCharacter === ',') {
                // Flush buffer prior to this point, and save new comma index
                result += buffer + jsonString.slice(offset, index);
                buffer = '';
                offset = index;
                commaIndex = index;
            }
        }
    }

    return (
        result +
        buffer +
        (parseState
            ? strip(jsonString.slice(offset))
            : jsonString.slice(offset))
    );
}

interface Indexable extends Object {
    [key: string]: unknown;
}

export function removeNulls(obj: Indexable) {
    const keysToRemove = [];
    for (const k in obj) {
        if (obj[k] === null || obj[k] === undefined) {
            keysToRemove.push(k);
        }
    }
    for (const k of keysToRemove) {
        delete obj[k];
    }
}
