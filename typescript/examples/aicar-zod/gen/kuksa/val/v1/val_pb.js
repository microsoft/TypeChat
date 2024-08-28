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
