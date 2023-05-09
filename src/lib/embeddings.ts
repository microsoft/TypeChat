// (c) Copyright Microsoft Corp
import * as vectorMath from './vectormath';
import { ArgumentException, Validator } from './core';
import { AzureOAIClient } from './openai';

export interface IEmbedding {
    length: number;

    euclideanLength(): number;
    dotProduct(other: Embedding): number;
    cosineSimilarity(other: Embedding): number;
    normalize(): void;
}

export interface ITextEmbeddingGenerator {
    createEmbedding(text: string): Promise<Embedding>;
    createEmbeddings(texts: string[]): Promise<Embedding[]>;
}

export interface IScoredValue<T> {
    value?: T;
    score: number;
}

export class Embedding extends Float32Array implements IEmbedding {
    private _normalized: boolean;

    constructor(vector: number[] | Float32Array) {
        super(vector);
        this._normalized = false;
    }

    get isNormalized() {
        return this._normalized;
    }

    public euclideanLength(): number {
        if (this._normalized) {
            return 1.0; // Unit vector
        }
        return vectorMath.euclideanLength32(this);
    }

    public dotProduct(other: Embedding): number {
        return vectorMath.dot32(this, other);
    }

    public cosineSimilarity(other: Embedding): number {
        if (this._normalized && other._normalized) {
            return vectorMath.dot32(this, other);
        }
        // We can also optimize this by skipping a square root
        return vectorMath.cosineSimilarity32(this, other);
    }

    public normalize(): void {
        if (!this._normalized) {
            vectorMath.normalize32(this);
            this._normalized = true;
        }
    }
}

// Always normalizes embeddings in place, for speed
export class VectorizedList<T> {
    _items: T[];
    _embeddings: Embedding[];

    constructor() {
        this._items = [];
        this._embeddings = [];
    }

    public add(item: T, vector: number[] | Embedding) {
        Validator.exists(vector, 'vector');

        let embedding: Embedding;
        if (vector instanceof Embedding) {
            embedding = vector as Embedding;
        } else {
            embedding = new Embedding(vector as number[]);
        }
        this._items.push(item);
        embedding.normalize();
        this._embeddings.push(embedding);
    }

    public get(index: number): T {
        return this._items[index];
    }

    public embedding(index: number): Embedding {
        return this._embeddings[index];
    }

    /**
     * Return the nearest neighbor - the most cosine similar - of the given embedding
     * @param other embedding to compare against
     * @returns The nearest neighbor
     */
    public nearestNeighbor(other: Embedding): T {
        let bestScore: number = Number.MIN_VALUE;
        let iNearest = -1;
        for (let i = 0; i < this._embeddings.length; ++i) {
            const score = this._embeddings[i].cosineSimilarity(other);
            if (score >= bestScore) {
                bestScore = score;
                iNearest = i;
            }
        }
        return this._items[iNearest];
    }

    /**
     * Return N nearest neighbors
     * @param other embedding to compare against
     * @param topN number of topN matches
     * @param minScore the min nearness score neighbors must have
     * @returns TopNCollection
     */
    public nearestNeighbors(
        other: Embedding,
        topN: number,
        minScore: number = Number.MIN_VALUE
    ): IScoredValue<T>[] {
        const matches = new TopNCollection<T>(topN as number);
        for (let i = 0; i < this._embeddings.length; ++i) {
            const score: number = this._embeddings[i].cosineSimilarity(other);
            if (score >= minScore) {
                matches.add(this._items[i], score);
            }
        }
        return matches.byRank();
    }

    /**
     * Returns the cosine similarity of each item in the list
     * @param other The embedding to compare against
     * @param minScore Only select items with this minimal score
     */
    public *similarityScore(
        other: Embedding,
        minScore: number
    ): IterableIterator<IScoredValue<T>> {
        for (let i = 0; i < this._embeddings.length; ++i) {
            const score: number = this._embeddings[i].cosineSimilarity(other);
            if (score >= minScore) {
                const scoredValue: IScoredValue<T> = {
                    value: this._items[i],
                    score: score,
                };
                yield scoredValue;
            }
        }
    }
}

export class TextEmbeddingGenerator implements ITextEmbeddingGenerator {
    private _modelName: string;
    private _oaiClient: AzureOAIClient;

    constructor(oaiClient: AzureOAIClient, modelName: string) {
        Validator.exists(oaiClient, 'oaiClient');
        Validator.notEmpty(modelName, 'modelName');
        this._oaiClient = oaiClient;
        this._modelName = modelName;
    }
    public async createEmbedding(text: string): Promise<Embedding> {
        const vector = await this._oaiClient.createEmbedding(
            text,
            this._modelName
        );
        return new Embedding(vector);
    }
    public async createEmbeddings(texts: string[]): Promise<Embedding[]> {
        const vectors = await this._oaiClient.createEmbeddings(
            texts,
            this._modelName
        );
        return vectors.map((v) => new Embedding(v));
    }
}

/**
 * Min-Heap based topN match collection. Matches are ordered by lowest ranking
 */
export class TopNCollection<T> {
    private _items: IScoredValue<T>[];
    private _count: number;
    private _maxCount: number;

    constructor(maxCount: number) {
        Validator.greaterThan(maxCount, 0, 'maxCount');
        this._items = [];
        this._count = 0;
        this._maxCount = maxCount;
        this._items.push({
            score: Number.MIN_VALUE,
            value: undefined,
        });
        // The first item is a sentinel, always
    }

    public get length() {
        return this._count;
    }

    public reset(): void {
        this._count = 0;
    }

    // Returns the lowest scoring item in the collection
    public get pop(): IScoredValue<T> {
        return this.removeTop();
    }

    public get top(): IScoredValue<T> {
        return this._items[1];
    }

    add(value: T, score: number): void {
        if (this._count === this._maxCount) {
            if (score < this.top.score) {
                return;
            }
            const scoredValue = this.removeTop();
            scoredValue.value = value;
            scoredValue.score = score;
            this._count++;
            this._items[this._count] = scoredValue;
        } else {
            this._count++;
            this._items.push({
                value: value,
                score: score,
            });
        }
        this.upHeap(this._count);
    }

    byRank(): IScoredValue<T>[] {
        this.sortDescending();
        this._items.shift();
        return this._items;
    }

    // Heap sort in place
    private sortDescending(): void {
        const count = this._count;
        let i = count;
        while (this._count > 0) {
            // this de-queues the item with the current LOWEST relevancy
            // We take that and place it at the 'back' of the array - thus inverting it
            const item = this.removeTop();
            this._items[i--] = item;
        }
        this._count = count;
    }

    private removeTop(): IScoredValue<T> {
        if (this._count === 0) {
            throw new ArgumentException('Empty queue');
        }
        // At the top
        const item = this._items[1];
        this._items[1] = this._items[this._count];
        this._count--;
        this.downHeap(1);
        return item;
    }

    private upHeap(startAt: number): void {
        let i = startAt;
        const item = this._items[i];
        let parent = i >> 1;
        // As long as child has a lower score than the parent, keep moving the child up
        while (parent > 0 && this._items[parent].score > item.score) {
            this._items[i] = this._items[parent];
            i = parent;
            parent = i >> 1;
        }
        // Found our slot
        this._items[i] = item;
    }

    private downHeap(startAt: number): void {
        let i: number = startAt;
        const maxParent = this._count >> 1;
        const item = this._items[i];
        while (i <= maxParent) {
            let iChild = i + i;
            let childScore = this._items[iChild].score;
            // Exchange the item with the smaller of its two children - if one is smaller, i.e.
            // First, find the smaller child
            if (
                iChild < this._count &&
                childScore > this._items[iChild + 1].score
            ) {
                iChild++;
                childScore = this._items[iChild].score;
            }
            if (item.score <= childScore) {
                // Heap condition is satisfied. Parent <= both its children
                break;
            }
            // Else, swap parent with the smallest child
            this._items[i] = this._items[iChild];
            i = iChild;
        }
        this._items[i] = item;
    }
}
