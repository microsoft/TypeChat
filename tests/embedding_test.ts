import {TestContext} from  "./testing";
import * as embeddings from "../src/embeddings"
import * as random from "./random"

export function runTests(context : TestContext) : void {
    testNormalize(context);
}
runTests.TestName = "Embeddings";

// This ends up testing both normalize and dot product
function testNormalize(context : TestContext) {
    let vector : number[] = random.array(1024);
    let embedding : embeddings.Embedding =  new embeddings.Embedding(vector);
    embedding.normalize();
    let length : number = embedding.euclideanLength();
    context.assertTrue(Math.round(length) == 1);
}
