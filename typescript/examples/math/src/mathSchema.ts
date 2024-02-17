// This is a schema for writing programs that evaluate expressions.

export type API = {
    // Add two numbers
    add(x: number, y: number): number;
    // Subtract two numbers
    sub(x: number, y: number): number;
    // Multiply two numbers
    mul(x: number, y: number): number;
    // Divide two numbers
    div(x: number, y: number): number;
    // Negate a number
    neg(x: number): number;
    // Identity function
    id(x: number): number;
    // Unknown request
    unknown(text: string): number;
}
