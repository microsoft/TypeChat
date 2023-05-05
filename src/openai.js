"use strict";
/* eslint-disable prettier/prettier */
// (c) Copyright Microsoft Corp
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.AzureModels = exports.AzureOAIClient = exports.AzureOAIException = exports.Models = exports.ModelType = void 0;
var oai = require("azure-openai");
var embeddings_1 = require("./embeddings");
var retry = require("./retry");
var core_1 = require("./core");
var typechatException_1 = require("./typechatException");
/**
 * Types of models we work with
 */
var ModelType;
(function (ModelType) {
    ModelType["Completion"] = "completion";
    ModelType["Embedding"] = "embedding";
    ModelType["Chat"] = "chat";
    ModelType["Image"] = "image";
})(ModelType = exports.ModelType || (exports.ModelType = {}));
/**
 * A table of model information
 * This is hard-codded for the short term.
 * Future: pull directly from the OAI service.
 */
exports.Models = [
    {
        name: 'text-davinci-002',
        maxTokenLength: 4096,
        type: ModelType.Completion
    },
    {
        name: 'text-davinci-003',
        maxTokenLength: 4096,
        type: ModelType.Completion
    },
    {
        name: 'text-embedding-ada-002',
        maxTokenLength: 8191,
        type: ModelType.Embedding,
        embeddingSize: 1536
    },
    {
        name: 'gpt-4',
        maxTokenLength: 8192,
        type: ModelType.Chat
    },
    {
        name: 'gpt-3.5-turbo',
        maxTokenLength: 4096,
        type: ModelType.Chat
    },
];
function findModel(name) {
    return exports.Models.find(function (m) { return (0, core_1.strEqInsensitive)(m.name, name); });
}
function validateAzureModelSettings(settings) {
    core_1.Validator.notEmpty(settings.modelName, 'modelName');
    core_1.Validator.notEmpty(settings.deployment, 'deployment');
}
function validateAzureAPISettings(settings) {
    core_1.Validator.notEmpty(settings.apiKey, 'apiKey');
    core_1.Validator.notEmpty(settings.endpoint, 'endpoint');
    core_1.Validator.notEmpty(settings.models, 'models');
    settings.models.forEach(function (m) { return validateAzureModelSettings(m); });
}
var AzureOAIException = /** @class */ (function (_super) {
    __extends(AzureOAIException, _super);
    function AzureOAIException(statusCode, message) {
        return _super.call(this, statusCode, message) || this;
    }
    return AzureOAIException;
}(core_1.Exception));
exports.AzureOAIException = AzureOAIException;
/**
 * OpenAIClient with:
 *   Built in retry around transient errors
 *   Wrapper APIs for common scenarios
 */
var AzureOAIClient = /** @class */ (function () {
    function AzureOAIClient(apiSettings, retrySettings) {
        validateAzureAPISettings(apiSettings);
        this._apiSettings = apiSettings;
        this._models = new AzureModels(apiSettings.models);
        this._client = createClient(apiSettings.apiKey, apiSettings.endpoint);
        if (retrySettings) {
            this._retrySettings = retrySettings;
        }
        else {
            this._retrySettings = {
                maxAttempts: 5,
                retryPauseMS: 1000
            };
        }
    }
    Object.defineProperty(AzureOAIClient.prototype, "models", {
        get: function () {
            return this._models;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Get a single completion for the given prompt
     * @param prompt The prompt to complete
     * @param maxTokens Max tokens to generate
     * @param temperature Temperature to use.
     * @param stop Stop sequences
     * @returns The completion from the AI
     */
    AzureOAIClient.prototype.getCompletion = function (prompt, modelName, maxTokens, temperature, stop) {
        return __awaiter(this, void 0, void 0, function () {
            var azureModel, request, _a, request, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        core_1.Validator.notEmpty(modelName, 'modelName');
                        azureModel = this.resolveModel(modelName);
                        if (!(azureModel.type === ModelType.Completion)) return [3 /*break*/, 2];
                        request = {
                            model: azureModel.deployment,
                            prompt: prompt,
                            max_tokens: maxTokens,
                            temperature: temperature,
                            stop: stop
                        };
                        _a = this.firstCompletion;
                        return [4 /*yield*/, this.createCompletion(request)];
                    case 1: return [2 /*return*/, _a.apply(this, [_c.sent()])];
                    case 2:
                        if (!(azureModel.type === ModelType.Chat)) return [3 /*break*/, 4];
                        request = {
                            model: azureModel.deployment,
                            messages: [
                                {
                                    role: oai.ChatCompletionRequestMessageRoleEnum.User,
                                    content: prompt
                                }
                            ],
                            max_tokens: maxTokens,
                            temperature: temperature
                        };
                        _b = this.firstChatCompletion;
                        return [4 /*yield*/, this.createChatCompletion(request)];
                    case 3: return [2 /*return*/, _b.apply(this, [_c.sent()])];
                    case 4: throw new typechatException_1.TypechatException(typechatException_1.TypechatErrorCode.ModelDoesNotSupportCompletion, modelName);
                }
            });
        });
    };
    /**
     * Get a completion from the AI - with automatic retries
     * @param request CreateCompletionRequest
     * @returns List of completions generated by the AI
     */
    AzureOAIClient.prototype.createCompletion = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, retry.executeWithRetry(this._retrySettings, function () { return _this.createCompletionAttempt(request); }, this.isTransientError)];
            });
        });
    };
    /**
     * Get a chat completion from the AI - with automatic retries
     * @param request CreateChatCompletionRequest
     * @returns
     */
    AzureOAIClient.prototype.createChatCompletion = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, retry.executeWithRetry(this._retrySettings, function () { return _this.createChatCompletionAttempt(request); }, this.isTransientError)];
            });
        });
    };
    /**
     * Create an embedding
     * @param text Create an embedding for this text
     * @param modelName Using this model
     * @returns Embedding object
     */
    AzureOAIClient.prototype.createEmbedding = function (text, modelName) {
        return __awaiter(this, void 0, void 0, function () {
            var model, request, embeddings;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        core_1.Validator.notEmpty(text, 'text');
                        model = this.resolveModel(modelName);
                        if (model.type !== ModelType.Embedding) {
                            throw new typechatException_1.TypechatException(typechatException_1.TypechatErrorCode.ModelDoesNotSupportEmbeddings, modelName);
                        }
                        request = {
                            model: modelName,
                            input: [text]
                        };
                        return [4 /*yield*/, retry.executeWithRetry(this._retrySettings, function () { return _this.createEmbeddingsAttempt(request); }, this.isTransientError)];
                    case 1:
                        embeddings = _a.sent();
                        return [2 /*return*/, embeddings[0]];
                }
            });
        });
    };
    /**
     * Create embeddings
     * @param texts Create embeddings for these texts
     * @param modelName Using this model
     * @returns A collection of embeddings
     */
    AzureOAIClient.prototype.createEmbeddings = function (texts, modelName) {
        return __awaiter(this, void 0, void 0, function () {
            var embeddings, i, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        embeddings = new Array(texts.length);
                        i = 0;
                        _c.label = 1;
                    case 1:
                        if (!(i < texts.length)) return [3 /*break*/, 4];
                        _a = embeddings;
                        _b = i;
                        return [4 /*yield*/, this.createEmbedding(texts[i], modelName)];
                    case 2:
                        _a[_b] = _c.sent();
                        _c.label = 3;
                    case 3:
                        ++i;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, embeddings];
                }
            });
        });
    };
    AzureOAIClient.prototype.createCompletionAttempt = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._client.createCompletion(request)];
                    case 1:
                        response = _a.sent();
                        this.ensureSuccess(response);
                        return [2 /*return*/, response.data.choices];
                }
            });
        });
    };
    AzureOAIClient.prototype.createChatCompletionAttempt = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._client.createChatCompletion(request)];
                    case 1:
                        response = _a.sent();
                        this.ensureSuccess(response);
                        return [2 /*return*/, response.data.choices];
                }
            });
        });
    };
    AzureOAIClient.prototype.createEmbeddingsAttempt = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._client.createEmbedding(request)];
                    case 1:
                        response = _a.sent();
                        this.ensureSuccess(response);
                        return [2 /*return*/, this.toEmbeddings(response.data)];
                }
            });
        });
    };
    AzureOAIClient.prototype.firstCompletion = function (choices) {
        var text = choices[0].text;
        if (!text) {
            text = '';
        }
        return text;
    };
    AzureOAIClient.prototype.firstChatCompletion = function (choices) {
        var _a;
        var text = (_a = choices[0].message) === null || _a === void 0 ? void 0 : _a.content;
        if (!text) {
            text = '';
        }
        return text;
    };
    AzureOAIClient.prototype.toEmbeddings = function (response) {
        var data = response.data;
        var embeddings = new Array(data.length);
        for (var i = 0; i < data.length; ++i) {
            embeddings[i] = new embeddings_1.Embedding(data[i].embedding);
        }
        return embeddings;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AzureOAIClient.prototype.ensureSuccess = function (response) {
        if (response.status !== 200) {
            throw new AzureOAIException(response.status, response.statusText);
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    AzureOAIClient.prototype.isTransientError = function (e) {
        if (e.response) {
            return retry.isTransientHttpError(e.response.status);
        }
        if (e.status) {
            return retry.isTransientHttpError(e.status);
        }
        if (e instanceof AzureOAIException) {
            return retry.isTransientHttpError(e.errorCode);
        }
        return false;
    };
    AzureOAIClient.prototype.resolveModel = function (modelName) {
        var azureModel = this._models.modelByName(modelName);
        if (azureModel === undefined) {
            throw new typechatException_1.TypechatException(typechatException_1.TypechatErrorCode.ModelNotFound, modelName);
        }
        return azureModel;
    };
    return AzureOAIClient;
}());
exports.AzureOAIClient = AzureOAIClient;
var AzureModels = /** @class */ (function () {
    function AzureModels(models) {
        this._models = models;
        this.updateModelTypes();
    }
    AzureModels.prototype.modelByName = function (name) {
        return this._models.find(function (m) { return m.modelName === name; });
    };
    AzureModels.prototype.modelByType = function (type) {
        return this._models.find(function (m) { return m.type === type; });
    };
    AzureModels.prototype.updateModelTypes = function () {
        for (var i = 0; i < this._models.length; ++i) {
            if (!this._models[i].type) {
                var knownModel = findModel(this._models[i].modelName);
                if (knownModel !== undefined) {
                    this._models[i].type = knownModel.type;
                }
            }
        }
    };
    return AzureModels;
}());
exports.AzureModels = AzureModels;
function createClient(apiKey, endpoint) {
    var config = new oai.Configuration({
        apiKey: apiKey,
        azure: {
            apiKey: apiKey,
            endpoint: endpoint
        }
    });
    var client = new oai.OpenAIApi(config);
    return client;
}
