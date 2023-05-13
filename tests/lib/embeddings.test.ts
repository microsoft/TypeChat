import * as oai from '../../src/lib/openai';
import {
    Embedding,
    TopNCollection,
    OpenAITextEmbeddingGenerator,
    VectorizedTextList,
} from '../../src/lib/embeddings';
import * as random from './random';
import * as setup from './testsetup';

const g_config = setup.loadConfig();
jest.setTimeout(10000);

test('Embeddings: TextEmbeddingGenerator', async () => {
    if (g_config === null || g_config.azureOAI === undefined) {
        console.log('No configuration. Embedding tests disabled');
        return;
    }
    const test_texts: string[] = [
        'the quick brown fox jumps over the lazy dog',
        'He was born with a gift of laughter and a sense that the world was mad',
    ];
    const client = new oai.OpenAIClient(g_config?.azureOAI, true);
    const generator = new OpenAITextEmbeddingGenerator(
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

test('Embeddings: vectorCollection', async () => {
    if (g_config === null || g_config.azureOAI === undefined) {
        console.log('No configuration. Embedding tests disabled');
        return;
    }
    const composers: string[] = [
        'Johann Sebastian Bach',
        'Ludwig Van Beethoven',
        'Wolfgang Amadeus Mozart',
        'Felix Mendelssohn',
        'Franz List',
        'Frederick Chopin',
        'Claude Debussy',
        'Maurice Ravel',
        'Gabriel Faure',
        'Gustav Mahler',
        'Aaron Copeland',
        'George Gershwin',
        'Ralph Vaughn Williams',
        'Igor Stravinsky',
        'Pyotr Tchaikovsky',
        'Sergei Rachmaninoff',
    ];

    const client = new oai.OpenAIClient(g_config?.azureOAI, true);
    const generator = new OpenAITextEmbeddingGenerator(
        client,
        oai.ModelNames.Text_Embedding_Ada2
    );
    const vectorList = new VectorizedTextList(generator);
    await vectorList.vectorizeAndAdd(composers);
    let matches = await vectorList.nearestText('Impressionist Music', 3);
    expect(matches.length).toEqual(3);
    let match = matches.find((item) => item.value?.includes('Debussy'));
    expect(match).toBeDefined();

    matches = await vectorList.nearestText('Fugues and Canons', 4);
    expect(matches.length).toEqual(4);

    match = matches.find((item) => item.value?.includes('Bach'));
    expect(match).toBeDefined();
});

// This ends up testing both normalize and dot product
test('Embeddings: normalize', () => {
    const vector: number[] = random.array(1024);
    const embedding: Embedding = new Embedding(vector);

    embedding.normalize();
    const length: number = embedding.euclideanLength();
    expect(Math.round(length)).toEqual(1);

    const lengthManual: number = Math.sqrt(embedding.dotProduct(embedding));
    expect(Math.round(length)).toEqual(Math.round(Math.round(lengthManual)));
});

test('Embeddings: TopNCollection', () => {
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
