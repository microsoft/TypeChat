"use strict";
// (c) Copyright Microsoft Corp
//
// For speed of experimentation, core  libraries parked here for now. As project evolves, some of these will be replaced by
// standard libraries. Others will get refactored into their own modules.
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
exports.strEqInsensitive = exports.Validator = exports.ArgumentException = exports.Exception = void 0;
var Exception = /** @class */ (function (_super) {
    __extends(Exception, _super);
    function Exception(errorCode, message, innerEx) {
        var _this = this;
        if (message === undefined || message === null) {
            message = '';
        }
        message = "Typescript Error: ".concat(errorCode, ". ").concat(message);
        _this = _super.call(this, message) || this;
        _this._errorCode = errorCode;
        _this._innerEx = innerEx;
        return _this;
    }
    Object.defineProperty(Exception.prototype, "errorCode", {
        get: function () {
            return this._errorCode;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Exception.prototype, "innerEx", {
        get: function () {
            return this._innerEx;
        },
        enumerable: false,
        configurable: true
    });
    return Exception;
}(Error));
exports.Exception = Exception;
var ArgumentException = /** @class */ (function (_super) {
    __extends(ArgumentException, _super);
    function ArgumentException(message, name) {
        if (name) {
            message = name + ':' + message;
        }
        return _super.call(this, message) || this;
    }
    return ArgumentException;
}(Error));
exports.ArgumentException = ArgumentException;
var Validator = /** @class */ (function () {
    function Validator() {
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Validator.notEmpty = function (value, name) {
        if (value === null || value === undefined || value.length === 0) {
            throw new Error("".concat(name || 'Value', " must not be null or empty"));
        }
    };
    Validator.greaterThan = function (value, minValue, name) {
        if (value < minValue) {
            throw new ArgumentException("".concat(value, " is not greater than ").concat(minValue), name);
        }
    };
    return Validator;
}());
exports.Validator = Validator;
var strEqIOptions = { sensitivity: 'base' };
function strEqInsensitive(x, y) {
    return x.localeCompare(y, undefined, strEqIOptions) === 0;
}
exports.strEqInsensitive = strEqInsensitive;
