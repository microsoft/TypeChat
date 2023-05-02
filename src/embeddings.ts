// (c) Copyright Microsoft Corp
import * as vectormath from "./vectormath"

export interface IEmbedding {
    length : number;
    
    euclideanLength() : number;
    dotProduct(other : Float32Array) : number;
    cosineSimilarity(other : Float32Array) : number;
    cosineSimilarityN(other : Float32Array) : number;
    normalize() : void;
}

export class Embedding extends Float32Array implements IEmbedding {
    constructor(vector : number[]) {
        super(vector);
    }
    public euclideanLength(): number {
        return vectormath.euclideanLength32(this);
    }
    public dotProduct(other : Float32Array) : number {
        return vectormath.dot32(this, other);
    }
    public cosineSimilarity(other: Float32Array): number {
        return vectormath.cosineSimilarity32(this, other);
    }
    /**
     * Normalized vectors have unit length and cosine similarity reduces to a dot product 
     * @param other Normalized vector
     * @returns cosine similarity
     */
    public cosineSimilarityN(other: Float32Array): number {
        return vectormath.dot32(this, other);
    }
    public normalize(): void {
        vectormath.normalize32(this);
    }
}
