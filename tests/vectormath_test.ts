import {Test, TestContext} from "./testing"
import * as vector from "../src/vectormath"

export class VectorTests extends Test {
    public run(context: TestContext) : void {
        this.testCosine(context);
    }

    testCosine(context : TestContext) : void {
        context.log("testCosine");

        let x : number[] = [3, 2, 0, 5];
        let y : number[] = [1, 0, 0, 0];
        let target : number = 0.49;
        
        this.doCosine32(x, y, target, 100);

        x = [5, 23, 2, 5, 9 ];
        y = [3, 21, 2, 5, 14 ];
        target = 0.975;
        this.doCosine32(x, y, target, 1000);
    }

    doCosine32(x : number[], y : number[], target : number, scale : number) : void  {
        let x32 : Float32Array = new Float32Array(x);
        let y32 : Float32Array = new Float32Array(y);
        let cosine : number = vector.cosineSimilarity(x, y);
        this.assertTrue(Math.round(cosine * scale) == target * scale);
    }
}