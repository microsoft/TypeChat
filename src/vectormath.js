"use strict";
// (c) Copyright Microsoft Corp
// Ultra vanilla, non-accelerated (currently), non-unrolled vector operations
exports.__esModule = true;
exports.cosineSimilarity32 = exports.cosineSimilarity = exports.normalize32 = exports.normalize = exports.divide32 = exports.divide = exports.euclideanLength32 = exports.euclideanLength = exports.dot32 = exports.dot = void 0;
var ERROR_ARRAYLENGTH = 'array length mismatch';
function dot(x, y) {
    if (x.length != y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }
    var sum = 0;
    for (var i = 0; i < x.length; ++i) {
        sum += x[i] * y[i];
    }
    return sum;
}
exports.dot = dot;
function dot32(x, y) {
    if (x.length != y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }
    var sum = 0;
    for (var i = 0; i < x.length; ++i) {
        sum += x[i] * y[i];
    }
    return sum;
}
exports.dot32 = dot32;
function euclideanLength(x) {
    return Math.sqrt(dot(x, x));
}
exports.euclideanLength = euclideanLength;
function euclideanLength32(x) {
    return Math.sqrt(dot32(x, x));
}
exports.euclideanLength32 = euclideanLength32;
function divide(x, divisor) {
    for (var i = 0; i < x.length; ++i) {
        x[i] /= divisor;
    }
}
exports.divide = divide;
function divide32(x, divisor) {
    for (var i = 0; i < x.length; ++i) {
        x[i] /= divisor;
    }
}
exports.divide32 = divide32;
function normalize(x) {
    divide(x, euclideanLength(x));
}
exports.normalize = normalize;
function normalize32(x) {
    divide32(x, euclideanLength32(x));
}
exports.normalize32 = normalize32;
function cosineSimilarity(x, y) {
    if (x.length != y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }
    var dotSum = 0;
    var lenXSum = 0;
    var lenYSum = 0;
    for (var i = 0; i < x.length; ++i) {
        var xVal = x[i];
        var yVal = y[i];
        dotSum += xVal * yVal; // Dot product
        lenXSum += xVal * xVal; // For magnitude of x
        lenYSum += yVal * yVal; // For magnitude of y
    }
    // Cosine Similarity of X, Y
    // Sum(X * Y) / |X| * |Y|
    return dotSum / (Math.sqrt(lenXSum) * Math.sqrt(lenYSum));
}
exports.cosineSimilarity = cosineSimilarity;
function cosineSimilarity32(x, y) {
    if (x.length != y.length) {
        throw new Error(ERROR_ARRAYLENGTH);
    }
    var dotSum = 0;
    var lenXSum = 0;
    var lenYSum = 0;
    for (var i = 0; i < x.length; ++i) {
        var xVal = x[i];
        var yVal = y[i];
        dotSum += xVal * yVal; // Dot product
        lenXSum += xVal * xVal; // For magnitude of x
        lenYSum += yVal * yVal; // For magnitude of y
    }
    // Cosine Similarity of X, Y
    // Sum(X * Y) / |X| * |Y|
    return dotSum / (Math.sqrt(lenXSum) * Math.sqrt(lenYSum));
}
exports.cosineSimilarity32 = cosineSimilarity32;
