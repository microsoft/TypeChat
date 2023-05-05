// (c) Copyright Microsoft Corp
// Ultra vanilla, non-accelerated (currently), non-unrolled vector operations

import exp from 'constants';

const ERROR_ARRAYLENGTH = 'array length mismatch';

export function dot(x: number[], y: number[]): number {
    if (x.length !== y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }
    let sum = 0;
    for (let i = 0; i < x.length; ++i) {
        sum += x[i] * y[i];
    }
    return sum;
}

export function dot32(x: Float32Array, y: Float32Array): number {
    if (x.length !== y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }
    let sum = 0;
    for (let i = 0; i < x.length; ++i) {
        sum += x[i] * y[i];
    }
    return sum;
}

export function euclideanLength(x: number[]): number {
    return Math.sqrt(dot(x, x));
}

export function euclideanLength32(x: Float32Array): number {
    return Math.sqrt(dot32(x, x));
}

export function divide(x: number[], divisor: number): void {
    for (let i = 0; i < x.length; ++i) {
        x[i] /= divisor;
    }
}

export function divide32(x: Float32Array, divisor: number): void {
    for (let i = 0; i < x.length; ++i) {
        x[i] /= divisor;
    }
}

export function normalize(x: number[]): void {
    divide(x, euclideanLength(x));
}

export function normalize32(x: Float32Array): void {
    divide32(x, euclideanLength32(x));
}

export function cosineSimilarity(x: number[], y: number[]): number {
    if (x.length !== y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }

    let dotSum = 0;
    let lenXSum = 0;
    let lenYSum = 0;
    for (let i = 0; i < x.length; ++i) {
        const xVal: number = x[i];
        const yVal: number = y[i];

        dotSum += xVal * yVal; // Dot product
        lenXSum += xVal * xVal; // For magnitude of x
        lenYSum += yVal * yVal; // For magnitude of y
    }

    // Cosine Similarity of X, Y
    // Sum(X * Y) / |X| * |Y|
    return dotSum / (Math.sqrt(lenXSum) * Math.sqrt(lenYSum));
}

export function cosineSimilarity32(x: Float32Array, y: Float32Array): number {
    if (x.length !== y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }

    let dotSum = 0;
    let lenXSum = 0;
    let lenYSum = 0;
    for (let i = 0; i < x.length; ++i) {
        const xVal: number = x[i];
        const yVal: number = y[i];

        dotSum += xVal * yVal; // Dot product
        lenXSum += xVal * xVal; // For magnitude of x
        lenYSum += yVal * yVal; // For magnitude of y
    }

    // Cosine Similarity of X, Y
    // Sum(X * Y) / |X| * |Y|
    return dotSum / (Math.sqrt(lenXSum) * Math.sqrt(lenYSum));
}
