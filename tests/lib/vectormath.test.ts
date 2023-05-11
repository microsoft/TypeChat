import * as vectormath from '../../src/lib/vectormath';

test('VectorMath: testCosine', () => {
    let x: number[] = [3, 2, 0, 5];
    let y: number[] = [1, 0, 0, 0];
    let target = 0.49;

    expect(doCosine32(x, y, target, 100)).toBeTruthy();

    x = [5, 23, 2, 5, 9];
    y = [3, 21, 2, 5, 14];
    target = 0.975;
    expect(doCosine32(x, y, target, 1000)).toBeTruthy();
});

function doCosine32(
    x: number[],
    y: number[],
    target: number,
    scale: number
): boolean {
    const x32 = new Float32Array(x);
    const y32 = new Float32Array(y);
    const cosine: number = vectormath.cosineSimilarity32(x32, y32);
    return Math.round(cosine * scale) === target * scale;
}
