"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
exports.Embedding = void 0;
// (c) Copyright Microsoft Corp
var vectormath = require("./vectormath");
var Embedding = /** @class */ (function (_super) {
    __extends(Embedding, _super);
    function Embedding(vector) {
        return _super.call(this, vector) || this;
    }
    Embedding.prototype.euclideanLength = function () {
        return vectormath.euclideanLength32(this);
    };
    Embedding.prototype.dotProduct = function (other) {
        return vectormath.dot32(this, other);
    };
    Embedding.prototype.cosineSimilarity = function (other) {
        return vectormath.cosineSimilarity32(this, other);
    };
    /**
     * Normalized vectors have unit length and cosine similarity reduces to a dot product
     * @param other Normalized vector
     * @returns cosine similarity
     */
    Embedding.prototype.cosineSimilarityN = function (other) {
        return vectormath.dot32(this, other);
    };
    Embedding.prototype.normalize = function () {
        vectormath.normalize32(this);
    };
    return Embedding;
}(Float32Array));
exports.Embedding = Embedding;
