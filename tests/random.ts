// Copyright Microsoft Corporation

export function *numbers(count : number)  {
    for (let i = 0; i < count; ++i){
        yield Math.random();
    }
}

export function floatArray(length : number) : Float32Array {
        let array = new Float32Array(length);
        for (let i = 0; i < length; ++i) {
            array[i] = Math.random();
        }
        return array;
}

export function array(length : number) : number[] {
    let buffer:number[] = new Array(length);
    for (let i = 0; i < length; ++i) {
        buffer[i] = Math.random();
    }
    return buffer;
}

export function fill(buffer : number[]) : number[] {
    for (let i = 0; i < buffer.length; ++i) {
        buffer[i] = Math.random();
    }
    return buffer;
}

