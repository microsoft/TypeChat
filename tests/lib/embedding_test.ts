import { TestContext } from './testing';
import * as embeddings from '../../src/lib/embeddings';

import * as random from './random';

export function runTests(context: TestContext): void {
    testNormalize(context);
}
runTests.TestName = 'Embeddings';

// This ends up testing both normalize and dot product
function testNormalize(context: TestContext) {
    const vector: number[] = random.array(1024);
    const embedding: embeddings.Embedding = new embeddings.Embedding(vector);

    embedding.normalize();

    const length: number = embedding.euclideanLength();
    context.assertTrue(Math.round(length) === 1);

    const lengthManual: number = Math.sqrt(embedding.dotProduct(embedding));
    context.assertTrue(length === Math.round(lengthManual));
}
