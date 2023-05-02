import {TestContext} from "./testing"
import * as vector from "../src/vectormath"

export function runTests(context : TestContext) : void {
    testCosine(context);
}
runTests.TestName = "VectorTests";

function testCosine(context : TestContext) : void {
    context.log("testCosine");

    let x : number[] = [3, 2, 0, 5];
    let y : number[] = [1, 0, 0, 0];
    let target : number = 0.49;
    
    doCosine32(context, x, y, target, 100);

    x = [5, 23, 2, 5, 9 ];
    y = [3, 21, 2, 5, 14 ];
    target = 0.975;
    doCosine32(context, x, y, target, 1000);
}

function doCosine32(context : TestContext, x : number[], y : number[], target : number, scale : number) : void  {
    let x32 : Float32Array = new Float32Array(x);
    let y32 : Float32Array = new Float32Array(y);
    let cosine : number = vector.cosineSimilarity(x, y);
    context.assertTrue(Math.round(cosine * scale) == target * scale);
}
