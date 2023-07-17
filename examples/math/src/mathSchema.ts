// This is a schema for writing programs that evaluate expressions.

export type API = {
    // Add two numbers
    add(a: number, b: number): number;
    // Subtract two numbers
    sub(a: number, b: number): number;
    // Multiply two numbers
    mul(a: number, b: number): number;
    // Divide two numbers
    div(a: number, b: number): number;
    // Negate a number
    neg(a: number): number;
    // Unknown request
    unknown(text: string): unknown;
}
