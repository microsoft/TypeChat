// Copyright Microsoft Corporation

// Random number generation methods that are useful for testing etc

export function* numbers(count: number) {
    for (let i = 0; i < count; ++i) {
        yield Math.random();
    }
}

export function floatArray(length: number): Float32Array {
    const array = new Float32Array(length);
    for (let i = 0; i < length; ++i) {
        array[i] = Math.random();
    }
    return array;
}

export function array(length: number): number[] {
    const buffer: number[] = new Array(length);
    for (let i = 0; i < length; ++i) {
        buffer[i] = Math.random();
    }
    return buffer;
}

export function fill(buffer: number[]): number[] {
    for (let i = 0; i < buffer.length; ++i) {
        buffer[i] = Math.random();
    }
    return buffer;
}

// Min and max are inclusive...
export function numberInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function* numbersInRange(count: number, min: number, max: number) {
    for (let i = 0; i < count; ++i) {
        yield numberInRange(min, max);
    }
}
