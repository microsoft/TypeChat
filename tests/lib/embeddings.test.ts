import * as oai from '../../src/lib/openai';
import { Embedding, TopNCollection, TextEmbeddingGenerator } from '../../src/lib/embeddings';
import * as random from './random';
import * as setup from './testsetup'

const g_config = setup.loadConfig();
const test_texts: string[] = [
    'the quick brown fox jumps over the lazy dog',
    'He was born with a gift of laughter and a sense that the world was mad'
];

describe('Embeddings: TextEmbeddingGenerator', async () => {
    if (g_config === null) {
        console.log('No configuration. Embedding tests disabled');
        return;
    }
    const client = new oai.AzureOAIClient(g_config?.azureOAI);
    const generator = new TextEmbeddingGenerator(
        client,
        oai.ModelNames.Text_Embedding_Ada2
    );
    const embedding = await generator.createEmbedding(test_texts[0]);
    expect(embedding.length).toBeGreaterThan(0);

    const embeddings = await generator.createEmbeddings(test_texts);
    expect(embeddings.length).toEqual(test_texts.length);

    const score = embeddings[0].cosineSimilarity(embedding);
    expect(score).toEqual(Math.round(1));
});

// This ends up testing both normalize and dot product
describe('Embeddings: normalize', () => {
    const vector: number[] = random.array(1024);
    const embedding: Embedding = new Embedding(vector);

    embedding.normalize();
    const length: number = embedding.euclideanLength();
    expect(Math.round(length)).toEqual(1);

    const lengthManual: number = Math.sqrt(embedding.dotProduct(embedding));
    expect(length).toEqual(lengthManual);
});

describe('Embeddings: TopNCollection', () => {
    const maxN = 8;
    const topN: TopNCollection<string> = new TopNCollection<string>(maxN);

    topN.reset();
    topN.add('4.0', 4.0);
    topN.add('3.3', 3.3);
    for (const num of random.numbersInRange(16, 0.5, 3.0)) {
        topN.add(num.toString(), num);
    }
    topN.add('3.5', 3.5);

    const matches = topN.byRank();
    expect(matches.length).toEqual(maxN);

    expect(matches[0].value).toEqual('4.0');
    expect(matches[1].value).toEqual('3.5');
    expect(matches[2].value).toEqual('3.3');
});
