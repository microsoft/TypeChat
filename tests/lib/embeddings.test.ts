import { TopNCollection } from '../../src/lib/embeddings';
import './random';
import { numbersInRange } from './random';

describe('Embeddings: TopNCollection', () => {
    const maxN = 8;
    const topN: TopNCollection<string> = new TopNCollection<string>(maxN);

    topN.reset();
    topN.add('4.0', 4.0);
    topN.add('3.3', 3.3);
    for (const num of numbersInRange(16, 0.5, 3.0)) {
        topN.add(num.toString(), num);
    }
    topN.add('3.5', 3.5);

    const matches = topN.byRank();
    expect(matches.length).toEqual(maxN);

    expect(matches[0].value).toEqual('4.0');
    expect(matches[1].value).toEqual('3.5');
    expect(matches[2].value).toEqual('3.3');
});
