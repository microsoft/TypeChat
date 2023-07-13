// This is a schema for writing programs that evaluate expressions

type API = {
    // Add two numbers
    add(a: number, b: number): number;
    // Subtract two numbers
    sub(a: number, b: number): number;
    // Multiply  two numbers
    mul(a: number, b: number): number;
    // Divide two numbers
    div(a: number, b: number): number;
    // Negate a number
    neg(a: number): number;
}

// A program consists of a sequence of expressions that are executed in order.
export type Program = {
    expressions: Expression[];
}

// An expression is a JSON value, a function call, or a reference to the result of a preceding expression.
// Function calls and result references may occur at any level of nesting.
export type Expression = JSONValue | FunctionCall | ResultReference;

// Represents a JSON value.
export type JSONValue = string | number | boolean | null | { [x: string]: Expression } | Expression[];

// Represents a call to one of the API functions. Function calls may be nested in JSON objects.
export type FunctionCall = {
    // Name of the API function called by this expression
    "@func": keyof API;
    // Arguments for the function
    "@args": Expression[];
};

// Represents a reference to the result of a preceding expression. Result references may be nested in JSON objects.
export type ResultReference = {
    // Index of the previous expression in the expressions array
    "@ref": number;
};
