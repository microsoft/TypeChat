// (c) Copyright Microsoft Corp
import * as vectorMath from './vectormath';
import { ArgumentException, Validator } from './core';
import { OpenAIClient } from './openai';
import { assert } from 'console';

export interface TextEmbeddingGenerator {
    createEmbedding(text: string): Promise<Embedding>;
    createEmbeddings(texts: string[]): Promise<Embedding[]>;
}

export interface ScoredValue<T> {
    value: T;
    score: number;
}

export class Embedding extends Float32Array {
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
export class EmbeddingList {
    _embeddings: Embedding[];

    constructor() {
        this._embeddings = [];
    }

    public add(vector: number[] | Embedding) {
        Validator.defined(vector, 'vector');
        let embedding: Embedding;
        if (vector instanceof Embedding) {
            embedding = vector as Embedding;
        } else {
            embedding = new Embedding(vector as number[]);
        }
        embedding.normalize();
        this._embeddings.push(embedding);
    }

    public push(vector: number[] | Embedding) {
        this.add(vector);
    }

    public get(index: number): Embedding {
        return this._embeddings[index];
    }

    public indexOfNearestNeighbor(other: Embedding): number {
        let bestScore: number = Number.MIN_VALUE;
        let iNearest = -1;
        for (let i = 0; i < this._embeddings.length; ++i) {
            const score = this._embeddings[i].cosineSimilarity(other);
            if (score >= bestScore) {
                bestScore = score;
                iNearest = i;
            }
        }
        return iNearest;
    }

    /**
     * Return index of N nearest neighbors
     * @param other embedding to compare against
     * @param topN number of topN matches
     * @param minScore the min nearness score neighbors must have
     * @returns Top N matches
     */
    public indexOfNearestNeighbors(
        other: Embedding,
        topN: number,
        minScore: number = Number.MIN_VALUE
    ): ScoredValue<number>[] {
        const matches = new TopNCollection<number>(topN as number, 0);
        for (let i = 0; i < this._embeddings.length; ++i) {
            const score: number = this._embeddings[i].cosineSimilarity(other);
            if (score >= minScore) {
                matches.add(i, score);
            }
        }
        return matches.byRank();
    }

    public *similarityScore(other: Embedding): IterableIterator<number> {
        for (let i = 0; i < this._embeddings.length; ++i) {
            yield this._embeddings[i].cosineSimilarity(other);
        }
    }

    public trim(trimBy: number): void {
        if (trimBy >= this._embeddings.length) {
            this._embeddings.length = 0;
        } else {
            this._embeddings.splice(0, trimBy);
        }
    }
}

// Always normalizes embeddings in place, for speed
export class VectorizedList<T> {
    _items: T[];
    _embeddings: EmbeddingList;

    constructor() {
        this._items = [];
        this._embeddings = new EmbeddingList();
    }

    public add(item: T, vector: number[] | Embedding) {
        this._items.push(item);
        this._embeddings.add(vector);
    }

    public get(index: number): T {
        return this._items[index];
    }

    public embedding(index: number): Embedding {
        return this._embeddings.get(index);
    }

    public indexOfNearest(other: Embedding): number {
        return this._embeddings.indexOfNearestNeighbor(other);
    }

    public indexOfNearestNeighbors(
        other: Embedding,
        topN: number,
        minScore: number = Number.MIN_VALUE
    ): ScoredValue<number>[] {
        return this._embeddings.indexOfNearestNeighbors(other, minScore);
    }
}

export class OpenAITextEmbeddingGenerator implements TextEmbeddingGenerator {
    private _modelName: string;
    private _oaiClient: OpenAIClient;

    constructor(oaiClient: OpenAIClient, modelName: string) {
        Validator.defined(oaiClient, 'oaiClient');
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

export class VectorizedTextList extends VectorizedList<string> {
    private _generator: TextEmbeddingGenerator;
    constructor(generator: TextEmbeddingGenerator) {
        Validator.defined(generator, 'generator');
        super();
        this._generator = generator;
    }

    get generator(): TextEmbeddingGenerator {
        return this._generator;
    }

    public async vectorizeAndAdd(value: string | string[]): Promise<void> {
        if (value instanceof String) {
            const text: string = value as string;
            const embedding = await this._generator.createEmbedding(text);
            this.add(text, embedding);
        } else {
            const texts: string[] = value as string[];
            const embeddings = await this._generator.createEmbeddings(texts);
            for (let i = 0; i < texts.length; ++i) {
                this.add(texts[i], embeddings[i]);
            }
        }
    }

    public async nearestText(
        text: string,
        topN: number,
        minScore: number = Number.MIN_VALUE
    ): Promise<ScoredValue<string>[]> {
        const embedding = await this._generator.createEmbedding(text);
        const matches = this.indexOfNearestNeighbors(embedding, topN, minScore);
        const textMatches: ScoredValue<string>[] = new Array(matches.length);
        for (let i = 0; i < matches.length; ++i) {
            const match = matches[i];
            textMatches.push({
                value: this.get(match.value),
                score: match.score,
            });
        }
        return textMatches;
    }
}
/**
 * Min-Heap based topN match collection. Matches are ordered by lowest ranking
 */

export class TopNCollection<T> {
    private _items: ScoredValue<T>[];
    private _count: number;
    private _maxCount: number;

    constructor(maxCount: number, defaultT: T) {
        Validator.greaterThan(maxCount, 0, 'maxCount');
        this._items = [];
        this._count = 0;
        this._maxCount = maxCount;
        this._items.push({
            score: Number.MIN_VALUE,
            value: defaultT,
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
    public get pop(): ScoredValue<T> {
        return this.removeTop();
    }

    public get top(): ScoredValue<T> {
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

    byRank(): ScoredValue<T>[] {
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

    private removeTop(): ScoredValue<T> {
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
