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
exports.TypechatException = exports.TypechatErrorCode = void 0;
var core_1 = require("./core");
var TypechatErrorCode;
(function (TypechatErrorCode) {
    TypechatErrorCode[TypechatErrorCode["Unknown"] = 1] = "Unknown";
    TypechatErrorCode[TypechatErrorCode["ModelNotFound"] = 2] = "ModelNotFound";
    TypechatErrorCode[TypechatErrorCode["ModelDoesNotSupportCompletion"] = 3] = "ModelDoesNotSupportCompletion";
    TypechatErrorCode[TypechatErrorCode["ModelDoesNotSupportEmbeddings"] = 4] = "ModelDoesNotSupportEmbeddings";
})(TypechatErrorCode = exports.TypechatErrorCode || (exports.TypechatErrorCode = {}));
var TypechatException = /** @class */ (function (_super) {
    __extends(TypechatException, _super);
    function TypechatException(errorCode, message) {
        return _super.call(this, errorCode, message) || this;
    }
    return TypechatException;
}(core_1.Exception));
exports.TypechatException = TypechatException;
