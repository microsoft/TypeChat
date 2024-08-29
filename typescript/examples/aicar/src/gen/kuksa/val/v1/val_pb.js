"use strict";
//*******************************************************************************
// Copyright (c) 2022 Contributors to the Eclipse Foundation
//
// See the NOTICE file(s) distributed with this work for additional
// information regarding copyright ownership.
//
// This program and the accompanying materials are made available under the
// terms of the Apache License 2.0 which is available at
// http://www.apache.org/licenses/LICENSE-2.0
//
// SPDX-License-Identifier: Apache-2.0
//******************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetServerInfoResponse = exports.GetServerInfoRequest = exports.SubscribeResponse = exports.SubscribeRequest = exports.SubscribeEntry = exports.StreamedUpdateResponse = exports.StreamedUpdateRequest = exports.SetResponse = exports.SetRequest = exports.EntryUpdate = exports.GetResponse = exports.GetRequest = exports.EntryRequest = void 0;
const protobuf_1 = require("@bufbuild/protobuf");
const types_pb_js_1 = require("./types_pb.js");
/**
 * Define which data we want
 *
 * @generated from message kuksa.val.v1.EntryRequest
 */
class EntryRequest extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: string path = 1;
         */
        this.path = "";
        /**
         * @generated from field: kuksa.val.v1.View view = 2;
         */
        this.view = types_pb_js_1.View.UNSPECIFIED;
        /**
         * @generated from field: repeated kuksa.val.v1.Field fields = 3;
         */
        this.fields = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new EntryRequest().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new EntryRequest().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new EntryRequest().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(EntryRequest, a, b);
    }
}
exports.EntryRequest = EntryRequest;
EntryRequest.runtime = protobuf_1.proto3;
EntryRequest.typeName = "kuksa.val.v1.EntryRequest";
EntryRequest.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "path", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "view", kind: "enum", T: protobuf_1.proto3.getEnumType(types_pb_js_1.View) },
    { no: 3, name: "fields", kind: "enum", T: protobuf_1.proto3.getEnumType(types_pb_js_1.Field), repeated: true },
]);
/**
 * Request a set of entries.
 *
 * @generated from message kuksa.val.v1.GetRequest
 */
class GetRequest extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.EntryRequest entries = 1;
         */
        this.entries = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new GetRequest().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new GetRequest().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new GetRequest().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(GetRequest, a, b);
    }
}
exports.GetRequest = GetRequest;
GetRequest.runtime = protobuf_1.proto3;
GetRequest.typeName = "kuksa.val.v1.GetRequest";
GetRequest.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "entries", kind: "message", T: EntryRequest, repeated: true },
]);
/**
 * Global errors are specified in `error`.
 * Errors for individual entries are specified in `errors`.
 *
 * @generated from message kuksa.val.v1.GetResponse
 */
class GetResponse extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.DataEntry entries = 1;
         */
        this.entries = [];
        /**
         * @generated from field: repeated kuksa.val.v1.DataEntryError errors = 2;
         */
        this.errors = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new GetResponse().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new GetResponse().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new GetResponse().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(GetResponse, a, b);
    }
}
exports.GetResponse = GetResponse;
GetResponse.runtime = protobuf_1.proto3;
GetResponse.typeName = "kuksa.val.v1.GetResponse";
GetResponse.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "entries", kind: "message", T: types_pb_js_1.DataEntry, repeated: true },
    { no: 2, name: "errors", kind: "message", T: types_pb_js_1.DataEntryError, repeated: true },
    { no: 3, name: "error", kind: "message", T: types_pb_js_1.Error },
]);
/**
 * Define the data we want to set
 *
 * @generated from message kuksa.val.v1.EntryUpdate
 */
class EntryUpdate extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.Field fields = 2;
         */
        this.fields = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new EntryUpdate().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new EntryUpdate().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new EntryUpdate().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(EntryUpdate, a, b);
    }
}
exports.EntryUpdate = EntryUpdate;
EntryUpdate.runtime = protobuf_1.proto3;
EntryUpdate.typeName = "kuksa.val.v1.EntryUpdate";
EntryUpdate.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "entry", kind: "message", T: types_pb_js_1.DataEntry },
    { no: 2, name: "fields", kind: "enum", T: protobuf_1.proto3.getEnumType(types_pb_js_1.Field), repeated: true },
]);
/**
 * A list of entries to be updated
 *
 * @generated from message kuksa.val.v1.SetRequest
 */
class SetRequest extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.EntryUpdate updates = 1;
         */
        this.updates = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new SetRequest().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new SetRequest().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new SetRequest().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(SetRequest, a, b);
    }
}
exports.SetRequest = SetRequest;
SetRequest.runtime = protobuf_1.proto3;
SetRequest.typeName = "kuksa.val.v1.SetRequest";
SetRequest.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "updates", kind: "message", T: EntryUpdate, repeated: true },
]);
/**
 * Global errors are specified in `error`.
 * Errors for individual entries are specified in `errors`.
 *
 * @generated from message kuksa.val.v1.SetResponse
 */
class SetResponse extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.DataEntryError errors = 2;
         */
        this.errors = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new SetResponse().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new SetResponse().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new SetResponse().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(SetResponse, a, b);
    }
}
exports.SetResponse = SetResponse;
SetResponse.runtime = protobuf_1.proto3;
SetResponse.typeName = "kuksa.val.v1.SetResponse";
SetResponse.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "error", kind: "message", T: types_pb_js_1.Error },
    { no: 2, name: "errors", kind: "message", T: types_pb_js_1.DataEntryError, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.StreamedUpdateRequest
 */
class StreamedUpdateRequest extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.EntryUpdate updates = 1;
         */
        this.updates = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new StreamedUpdateRequest().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new StreamedUpdateRequest().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new StreamedUpdateRequest().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(StreamedUpdateRequest, a, b);
    }
}
exports.StreamedUpdateRequest = StreamedUpdateRequest;
StreamedUpdateRequest.runtime = protobuf_1.proto3;
StreamedUpdateRequest.typeName = "kuksa.val.v1.StreamedUpdateRequest";
StreamedUpdateRequest.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "updates", kind: "message", T: EntryUpdate, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.StreamedUpdateResponse
 */
class StreamedUpdateResponse extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.DataEntryError errors = 2;
         */
        this.errors = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new StreamedUpdateResponse().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new StreamedUpdateResponse().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new StreamedUpdateResponse().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(StreamedUpdateResponse, a, b);
    }
}
exports.StreamedUpdateResponse = StreamedUpdateResponse;
StreamedUpdateResponse.runtime = protobuf_1.proto3;
StreamedUpdateResponse.typeName = "kuksa.val.v1.StreamedUpdateResponse";
StreamedUpdateResponse.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "error", kind: "message", T: types_pb_js_1.Error },
    { no: 2, name: "errors", kind: "message", T: types_pb_js_1.DataEntryError, repeated: true },
]);
/**
 * Define what to subscribe to
 *
 * @generated from message kuksa.val.v1.SubscribeEntry
 */
class SubscribeEntry extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: string path = 1;
         */
        this.path = "";
        /**
         * @generated from field: kuksa.val.v1.View view = 2;
         */
        this.view = types_pb_js_1.View.UNSPECIFIED;
        /**
         * @generated from field: repeated kuksa.val.v1.Field fields = 3;
         */
        this.fields = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new SubscribeEntry().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new SubscribeEntry().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new SubscribeEntry().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(SubscribeEntry, a, b);
    }
}
exports.SubscribeEntry = SubscribeEntry;
SubscribeEntry.runtime = protobuf_1.proto3;
SubscribeEntry.typeName = "kuksa.val.v1.SubscribeEntry";
SubscribeEntry.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "path", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "view", kind: "enum", T: protobuf_1.proto3.getEnumType(types_pb_js_1.View) },
    { no: 3, name: "fields", kind: "enum", T: protobuf_1.proto3.getEnumType(types_pb_js_1.Field), repeated: true },
]);
/**
 * Subscribe to changes in datapoints.
 *
 * @generated from message kuksa.val.v1.SubscribeRequest
 */
class SubscribeRequest extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.SubscribeEntry entries = 1;
         */
        this.entries = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new SubscribeRequest().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new SubscribeRequest().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new SubscribeRequest().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(SubscribeRequest, a, b);
    }
}
exports.SubscribeRequest = SubscribeRequest;
SubscribeRequest.runtime = protobuf_1.proto3;
SubscribeRequest.typeName = "kuksa.val.v1.SubscribeRequest";
SubscribeRequest.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "entries", kind: "message", T: SubscribeEntry, repeated: true },
]);
/**
 * A subscription response
 *
 * @generated from message kuksa.val.v1.SubscribeResponse
 */
class SubscribeResponse extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated kuksa.val.v1.EntryUpdate updates = 1;
         */
        this.updates = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new SubscribeResponse().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new SubscribeResponse().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new SubscribeResponse().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(SubscribeResponse, a, b);
    }
}
exports.SubscribeResponse = SubscribeResponse;
SubscribeResponse.runtime = protobuf_1.proto3;
SubscribeResponse.typeName = "kuksa.val.v1.SubscribeResponse";
SubscribeResponse.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "updates", kind: "message", T: EntryUpdate, repeated: true },
]);
/**
 * Nothing yet
 *
 * @generated from message kuksa.val.v1.GetServerInfoRequest
 */
class GetServerInfoRequest extends protobuf_1.Message {
    constructor(data) {
        super();
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new GetServerInfoRequest().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new GetServerInfoRequest().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new GetServerInfoRequest().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(GetServerInfoRequest, a, b);
    }
}
exports.GetServerInfoRequest = GetServerInfoRequest;
GetServerInfoRequest.runtime = protobuf_1.proto3;
GetServerInfoRequest.typeName = "kuksa.val.v1.GetServerInfoRequest";
GetServerInfoRequest.fields = protobuf_1.proto3.util.newFieldList(() => []);
/**
 * @generated from message kuksa.val.v1.GetServerInfoResponse
 */
class GetServerInfoResponse extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: string name = 1;
         */
        this.name = "";
        /**
         * @generated from field: string version = 2;
         */
        this.version = "";
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new GetServerInfoResponse().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new GetServerInfoResponse().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new GetServerInfoResponse().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(GetServerInfoResponse, a, b);
    }
}
exports.GetServerInfoResponse = GetServerInfoResponse;
GetServerInfoResponse.runtime = protobuf_1.proto3;
GetServerInfoResponse.typeName = "kuksa.val.v1.GetServerInfoResponse";
GetServerInfoResponse.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "name", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "version", kind: "scalar", T: 9 /* ScalarType.STRING */ },
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsX3BiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsX3BiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxpRkFBaUY7QUFDakYsNERBQTREO0FBQzVELEVBQUU7QUFDRixtRUFBbUU7QUFDbkUsNkNBQTZDO0FBQzdDLEVBQUU7QUFDRiwyRUFBMkU7QUFDM0Usd0RBQXdEO0FBQ3hELDZDQUE2QztBQUM3QyxFQUFFO0FBQ0Ysc0NBQXNDO0FBQ3RDLGdGQUFnRjs7O0FBUWhGLGlEQUFxRDtBQUNyRCwrQ0FBOEU7QUFFOUU7Ozs7R0FJRztBQUNILE1BQWEsWUFBYSxTQUFRLGtCQUFxQjtJQWdCckQsWUFBWSxJQUFtQztRQUM3QyxLQUFLLEVBQUUsQ0FBQztRQWhCVjs7V0FFRztRQUNILFNBQUksR0FBRyxFQUFFLENBQUM7UUFFVjs7V0FFRztRQUNILFNBQUksR0FBRyxrQkFBSSxDQUFDLFdBQVcsQ0FBQztRQUV4Qjs7V0FFRztRQUNILFdBQU0sR0FBWSxFQUFFLENBQUM7UUFJbkIsaUJBQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBVUQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFpQixFQUFFLE9BQW9DO1FBQ3ZFLE9BQU8sSUFBSSxZQUFZLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQW9CLEVBQUUsT0FBa0M7UUFDdEUsT0FBTyxJQUFJLFlBQVksRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDekQsQ0FBQztJQUVELE1BQU0sQ0FBQyxjQUFjLENBQUMsVUFBa0IsRUFBRSxPQUFrQztRQUMxRSxPQUFPLElBQUksWUFBWSxFQUFFLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRSxDQUFD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