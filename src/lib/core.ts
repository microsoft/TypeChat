// (c) Copyright Microsoft Corp
//
// For speed of experimentation, core  libraries parked here for now. As project evolves, some of these will be replaced by
// standard libraries. Others will get refactored into their own modules.

import { assert } from "console";

export class Exception<TError> extends Error {
    private _errorCode: TError;
    private _innerEx?: Error;

    public constructor(errorCode: TError, message?: string, innerEx?: Error) {
        if (message === undefined || message === null) {
            message = '';
        }
        message = `Typescript Error: ${errorCode}. ${message}`;
        super(message);
        this._errorCode = errorCode;
        this._innerEx = innerEx;
    }

    get errorCode(): TError {
        return this._errorCode;
    }
    get innerEx() {
        return this._innerEx;
    }
}

export class ArgumentException extends Error {
    public constructor(message: string, name?: string) {
        if (name) {
            message = name + ':' + message;
        }
        super(message);
    }
}

export class Validator {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static isDefined(value: any): boolean {
        return value !== undefined && value !== null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static defined(value: any, name?: string): void {
        if (value === undefined || value === null) {
            throw new Error(`${name || 'Value'} must be defined`);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static true(value: boolean, name?: string): void {
        if (value) {
            throw new Error(`${name || 'Value'} must be true`);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static notEmpty(value: string | Array<any>, name?: string): void {
        if (value === null || value === undefined || value.length === 0) {
            throw new Error(`${name || 'Value'} must not be null or empty`);
        }
    }
    public static greaterThan(
        value: number,
        minValue: number,
        name?: string
    ): void {
        if (value < minValue) {
            throw new ArgumentException(
                `${value} is not greater than ${minValue}`,
                name
            );
        }
    }
    public static validate<T>(items: T[], validator: (value: T) => void): void {
        Validator.notEmpty(items);
        for (let i = 0; i < items.length; ++i) {
            validator(items[i]);
        }
    }
}

const strEqIOptions = { sensitivity: 'base' };
export function strEqInsensitive(x: string, y: string): boolean {
    return x.localeCompare(y, undefined, strEqIOptions) === 0;
}

export class StringBuilder {
    private _buffer: string[];
    private _length: number;

    constructor() {
        this._buffer = [];
        this._length = 0;
    }

    public get length() {
        return this._length;
    }

    public reset(): StringBuilder {
        this._buffer.length = 0;
        this._length = 0;
        return this;
    }

    public append(value: string): StringBuilder {
        this._length += value.length;
        this._buffer.push(value);
        return this;
    }

    public appendLine(value: string): StringBuilder {
        this.append(value).append('\n');
        return this;
    }
    public reverse(): StringBuilder {
        this._buffer.reverse();
        return this;
    }

    public toString(): string {
        return this._buffer.join('');
    }

    public static join(...args: (string | undefined)[]): string {
        return args.join('');
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PropertyBag = { [key: string]: any };