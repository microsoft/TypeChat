import { TopNCollection } from '../../src/lib/embeddings';

describe('Embeddings: TopNCollection', () => {
    const topN: TopNCollection<string> = new TopNCollection<string>(3);
    topN.add('3', 3.0);
    topN.add('1', 1.0);
    topN.add('2', 2.0);
    topN.add('0.6', 0.6);
    topN.add('4.0', 4.0);
    topN.sortDescending();
    expect(topN.top.value).toEqual('4.0');
});
