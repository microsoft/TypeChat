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
exports.DoubleArray = exports.FloatArray = exports.Uint64Array = exports.Uint32Array = exports.Int64Array = exports.Int32Array = exports.BoolArray = exports.StringArray = exports.DataEntryError = exports.Error = exports.ValueRestrictionString = exports.ValueRestrictionFloat = exports.ValueRestrictionUint = exports.ValueRestrictionInt = exports.ValueRestriction = exports.Attribute = exports.Sensor = exports.Actuator = exports.Metadata = exports.Datapoint = exports.DataEntry = exports.Field = exports.View = exports.EntryType = exports.DataType = void 0;
const protobuf_1 = require("@bufbuild/protobuf");
/**
 * VSS Data type of a signal
 *
 * Protobuf doesn't support int8, int16, uint8 or uint16.
 * These are mapped to int32 and uint32 respectively.
 *
 *
 * @generated from enum kuksa.val.v1.DataType
 */
var DataType;
(function (DataType) {
    /**
     * @generated from enum value: DATA_TYPE_UNSPECIFIED = 0;
     */
    DataType[DataType["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    /**
     * @generated from enum value: DATA_TYPE_STRING = 1;
     */
    DataType[DataType["STRING"] = 1] = "STRING";
    /**
     * @generated from enum value: DATA_TYPE_BOOLEAN = 2;
     */
    DataType[DataType["BOOLEAN"] = 2] = "BOOLEAN";
    /**
     * @generated from enum value: DATA_TYPE_INT8 = 3;
     */
    DataType[DataType["INT8"] = 3] = "INT8";
    /**
     * @generated from enum value: DATA_TYPE_INT16 = 4;
     */
    DataType[DataType["INT16"] = 4] = "INT16";
    /**
     * @generated from enum value: DATA_TYPE_INT32 = 5;
     */
    DataType[DataType["INT32"] = 5] = "INT32";
    /**
     * @generated from enum value: DATA_TYPE_INT64 = 6;
     */
    DataType[DataType["INT64"] = 6] = "INT64";
    /**
     * @generated from enum value: DATA_TYPE_UINT8 = 7;
     */
    DataType[DataType["UINT8"] = 7] = "UINT8";
    /**
     * @generated from enum value: DATA_TYPE_UINT16 = 8;
     */
    DataType[DataType["UINT16"] = 8] = "UINT16";
    /**
     * @generated from enum value: DATA_TYPE_UINT32 = 9;
     */
    DataType[DataType["UINT32"] = 9] = "UINT32";
    /**
     * @generated from enum value: DATA_TYPE_UINT64 = 10;
     */
    DataType[DataType["UINT64"] = 10] = "UINT64";
    /**
     * @generated from enum value: DATA_TYPE_FLOAT = 11;
     */
    DataType[DataType["FLOAT"] = 11] = "FLOAT";
    /**
     * @generated from enum value: DATA_TYPE_DOUBLE = 12;
     */
    DataType[DataType["DOUBLE"] = 12] = "DOUBLE";
    /**
     * @generated from enum value: DATA_TYPE_TIMESTAMP = 13;
     */
    DataType[DataType["TIMESTAMP"] = 13] = "TIMESTAMP";
    /**
     * @generated from enum value: DATA_TYPE_STRING_ARRAY = 20;
     */
    DataType[DataType["STRING_ARRAY"] = 20] = "STRING_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_BOOLEAN_ARRAY = 21;
     */
    DataType[DataType["BOOLEAN_ARRAY"] = 21] = "BOOLEAN_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_INT8_ARRAY = 22;
     */
    DataType[DataType["INT8_ARRAY"] = 22] = "INT8_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_INT16_ARRAY = 23;
     */
    DataType[DataType["INT16_ARRAY"] = 23] = "INT16_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_INT32_ARRAY = 24;
     */
    DataType[DataType["INT32_ARRAY"] = 24] = "INT32_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_INT64_ARRAY = 25;
     */
    DataType[DataType["INT64_ARRAY"] = 25] = "INT64_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_UINT8_ARRAY = 26;
     */
    DataType[DataType["UINT8_ARRAY"] = 26] = "UINT8_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_UINT16_ARRAY = 27;
     */
    DataType[DataType["UINT16_ARRAY"] = 27] = "UINT16_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_UINT32_ARRAY = 28;
     */
    DataType[DataType["UINT32_ARRAY"] = 28] = "UINT32_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_UINT64_ARRAY = 29;
     */
    DataType[DataType["UINT64_ARRAY"] = 29] = "UINT64_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_FLOAT_ARRAY = 30;
     */
    DataType[DataType["FLOAT_ARRAY"] = 30] = "FLOAT_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_DOUBLE_ARRAY = 31;
     */
    DataType[DataType["DOUBLE_ARRAY"] = 31] = "DOUBLE_ARRAY";
    /**
     * @generated from enum value: DATA_TYPE_TIMESTAMP_ARRAY = 32;
     */
    DataType[DataType["TIMESTAMP_ARRAY"] = 32] = "TIMESTAMP_ARRAY";
})(DataType || (exports.DataType = DataType = {}));
// Retrieve enum metadata with: proto3.getEnumType(DataType)
protobuf_1.proto3.util.setEnumType(DataType, "kuksa.val.v1.DataType", [
    { no: 0, name: "DATA_TYPE_UNSPECIFIED" },
    { no: 1, name: "DATA_TYPE_STRING" },
    { no: 2, name: "DATA_TYPE_BOOLEAN" },
    { no: 3, name: "DATA_TYPE_INT8" },
    { no: 4, name: "DATA_TYPE_INT16" },
    { no: 5, name: "DATA_TYPE_INT32" },
    { no: 6, name: "DATA_TYPE_INT64" },
    { no: 7, name: "DATA_TYPE_UINT8" },
    { no: 8, name: "DATA_TYPE_UINT16" },
    { no: 9, name: "DATA_TYPE_UINT32" },
    { no: 10, name: "DATA_TYPE_UINT64" },
    { no: 11, name: "DATA_TYPE_FLOAT" },
    { no: 12, name: "DATA_TYPE_DOUBLE" },
    { no: 13, name: "DATA_TYPE_TIMESTAMP" },
    { no: 20, name: "DATA_TYPE_STRING_ARRAY" },
    { no: 21, name: "DATA_TYPE_BOOLEAN_ARRAY" },
    { no: 22, name: "DATA_TYPE_INT8_ARRAY" },
    { no: 23, name: "DATA_TYPE_INT16_ARRAY" },
    { no: 24, name: "DATA_TYPE_INT32_ARRAY" },
    { no: 25, name: "DATA_TYPE_INT64_ARRAY" },
    { no: 26, name: "DATA_TYPE_UINT8_ARRAY" },
    { no: 27, name: "DATA_TYPE_UINT16_ARRAY" },
    { no: 28, name: "DATA_TYPE_UINT32_ARRAY" },
    { no: 29, name: "DATA_TYPE_UINT64_ARRAY" },
    { no: 30, name: "DATA_TYPE_FLOAT_ARRAY" },
    { no: 31, name: "DATA_TYPE_DOUBLE_ARRAY" },
    { no: 32, name: "DATA_TYPE_TIMESTAMP_ARRAY" },
]);
/**
 * Entry type
 *
 * @generated from enum kuksa.val.v1.EntryType
 */
var EntryType;
(function (EntryType) {
    /**
     * @generated from enum value: ENTRY_TYPE_UNSPECIFIED = 0;
     */
    EntryType[EntryType["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    /**
     * @generated from enum value: ENTRY_TYPE_ATTRIBUTE = 1;
     */
    EntryType[EntryType["ATTRIBUTE"] = 1] = "ATTRIBUTE";
    /**
     * @generated from enum value: ENTRY_TYPE_SENSOR = 2;
     */
    EntryType[EntryType["SENSOR"] = 2] = "SENSOR";
    /**
     * @generated from enum value: ENTRY_TYPE_ACTUATOR = 3;
     */
    EntryType[EntryType["ACTUATOR"] = 3] = "ACTUATOR";
})(EntryType || (exports.EntryType = EntryType = {}));
// Retrieve enum metadata with: proto3.getEnumType(EntryType)
protobuf_1.proto3.util.setEnumType(EntryType, "kuksa.val.v1.EntryType", [
    { no: 0, name: "ENTRY_TYPE_UNSPECIFIED" },
    { no: 1, name: "ENTRY_TYPE_ATTRIBUTE" },
    { no: 2, name: "ENTRY_TYPE_SENSOR" },
    { no: 3, name: "ENTRY_TYPE_ACTUATOR" },
]);
/**
 * A `View` specifies a set of fields which should
 * be populated in a `DataEntry` (in a response message)
 *
 * @generated from enum kuksa.val.v1.View
 */
var View;
(function (View) {
    /**
     * Unspecified. Equivalent to VIEW_CURRENT_VALUE unless `fields` are explicitly set.
     *
     * @generated from enum value: VIEW_UNSPECIFIED = 0;
     */
    View[View["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    /**
     * Populate DataEntry with value.
     *
     * @generated from enum value: VIEW_CURRENT_VALUE = 1;
     */
    View[View["CURRENT_VALUE"] = 1] = "CURRENT_VALUE";
    /**
     * Populate DataEntry with actuator target.
     *
     * @generated from enum value: VIEW_TARGET_VALUE = 2;
     */
    View[View["TARGET_VALUE"] = 2] = "TARGET_VALUE";
    /**
     * Populate DataEntry with metadata.
     *
     * @generated from enum value: VIEW_METADATA = 3;
     */
    View[View["METADATA"] = 3] = "METADATA";
    /**
     * Populate DataEntry only with requested fields.
     *
     * @generated from enum value: VIEW_FIELDS = 10;
     */
    View[View["FIELDS"] = 10] = "FIELDS";
    /**
     * Populate DataEntry with everything.
     *
     * @generated from enum value: VIEW_ALL = 20;
     */
    View[View["ALL"] = 20] = "ALL";
})(View || (exports.View = View = {}));
// Retrieve enum metadata with: proto3.getEnumType(View)
protobuf_1.proto3.util.setEnumType(View, "kuksa.val.v1.View", [
    { no: 0, name: "VIEW_UNSPECIFIED" },
    { no: 1, name: "VIEW_CURRENT_VALUE" },
    { no: 2, name: "VIEW_TARGET_VALUE" },
    { no: 3, name: "VIEW_METADATA" },
    { no: 10, name: "VIEW_FIELDS" },
    { no: 20, name: "VIEW_ALL" },
]);
/**
 * A `Field` corresponds to a specific field of a `DataEntry`.
 *
 * It can be used to:
 *   * populate only specific fields of a `DataEntry` response.
 *   * specify which fields of a `DataEntry` should be set as
 *     part of a `Set` request.
 *   * subscribe to only specific fields of a data entry.
 *   * convey which fields of an updated `DataEntry` have changed.
 *
 * @generated from enum kuksa.val.v1.Field
 */
var Field;
(function (Field) {
    /**
     * "*" i.e. everything
     *
     * @generated from enum value: FIELD_UNSPECIFIED = 0;
     */
    Field[Field["UNSPECIFIED"] = 0] = "UNSPECIFIED";
    /**
     * path
     *
     * @generated from enum value: FIELD_PATH = 1;
     */
    Field[Field["PATH"] = 1] = "PATH";
    /**
     * value
     *
     * @generated from enum value: FIELD_VALUE = 2;
     */
    Field[Field["VALUE"] = 2] = "VALUE";
    /**
     * actuator_target
     *
     * @generated from enum value: FIELD_ACTUATOR_TARGET = 3;
     */
    Field[Field["ACTUATOR_TARGET"] = 3] = "ACTUATOR_TARGET";
    /**
     * metadata.*
     *
     * @generated from enum value: FIELD_METADATA = 10;
     */
    Field[Field["METADATA"] = 10] = "METADATA";
    /**
     * metadata.data_type
     *
     * @generated from enum value: FIELD_METADATA_DATA_TYPE = 11;
     */
    Field[Field["METADATA_DATA_TYPE"] = 11] = "METADATA_DATA_TYPE";
    /**
     * metadata.description
     *
     * @generated from enum value: FIELD_METADATA_DESCRIPTION = 12;
     */
    Field[Field["METADATA_DESCRIPTION"] = 12] = "METADATA_DESCRIPTION";
    /**
     * metadata.entry_type
     *
     * @generated from enum value: FIELD_METADATA_ENTRY_TYPE = 13;
     */
    Field[Field["METADATA_ENTRY_TYPE"] = 13] = "METADATA_ENTRY_TYPE";
    /**
     * metadata.comment
     *
     * @generated from enum value: FIELD_METADATA_COMMENT = 14;
     */
    Field[Field["METADATA_COMMENT"] = 14] = "METADATA_COMMENT";
    /**
     * metadata.deprecation
     *
     * @generated from enum value: FIELD_METADATA_DEPRECATION = 15;
     */
    Field[Field["METADATA_DEPRECATION"] = 15] = "METADATA_DEPRECATION";
    /**
     * metadata.unit
     *
     * @generated from enum value: FIELD_METADATA_UNIT = 16;
     */
    Field[Field["METADATA_UNIT"] = 16] = "METADATA_UNIT";
    /**
     * metadata.value_restriction.*
     *
     * @generated from enum value: FIELD_METADATA_VALUE_RESTRICTION = 17;
     */
    Field[Field["METADATA_VALUE_RESTRICTION"] = 17] = "METADATA_VALUE_RESTRICTION";
    /**
     * metadata.actuator.*
     *
     * @generated from enum value: FIELD_METADATA_ACTUATOR = 20;
     */
    Field[Field["METADATA_ACTUATOR"] = 20] = "METADATA_ACTUATOR";
    /**
     * metadata.sensor.*
     *
     * @generated from enum value: FIELD_METADATA_SENSOR = 30;
     */
    Field[Field["METADATA_SENSOR"] = 30] = "METADATA_SENSOR";
    /**
     * metadata.attribute.*
     *
     * @generated from enum value: FIELD_METADATA_ATTRIBUTE = 40;
     */
    Field[Field["METADATA_ATTRIBUTE"] = 40] = "METADATA_ATTRIBUTE";
})(Field || (exports.Field = Field = {}));
// Retrieve enum metadata with: proto3.getEnumType(Field)
protobuf_1.proto3.util.setEnumType(Field, "kuksa.val.v1.Field", [
    { no: 0, name: "FIELD_UNSPECIFIED" },
    { no: 1, name: "FIELD_PATH" },
    { no: 2, name: "FIELD_VALUE" },
    { no: 3, name: "FIELD_ACTUATOR_TARGET" },
    { no: 10, name: "FIELD_METADATA" },
    { no: 11, name: "FIELD_METADATA_DATA_TYPE" },
    { no: 12, name: "FIELD_METADATA_DESCRIPTION" },
    { no: 13, name: "FIELD_METADATA_ENTRY_TYPE" },
    { no: 14, name: "FIELD_METADATA_COMMENT" },
    { no: 15, name: "FIELD_METADATA_DEPRECATION" },
    { no: 16, name: "FIELD_METADATA_UNIT" },
    { no: 17, name: "FIELD_METADATA_VALUE_RESTRICTION" },
    { no: 20, name: "FIELD_METADATA_ACTUATOR" },
    { no: 30, name: "FIELD_METADATA_SENSOR" },
    { no: 40, name: "FIELD_METADATA_ATTRIBUTE" },
]);
/**
 * Describes a VSS entry
 * When requesting an entry, the amount of information returned can
 * be controlled by specifying either a `View` or a set of `Field`s.
 *
 * @generated from message kuksa.val.v1.DataEntry
 */
class DataEntry extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * Defines the full VSS path of the entry.
         *
         * [field: FIELD_PATH]
         *
         * @generated from field: string path = 1;
         */
        this.path = "";
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new DataEntry().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new DataEntry().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new DataEntry().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(DataEntry, a, b);
    }
}
exports.DataEntry = DataEntry;
DataEntry.runtime = protobuf_1.proto3;
DataEntry.typeName = "kuksa.val.v1.DataEntry";
DataEntry.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "path", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "value", kind: "message", T: Datapoint },
    { no: 3, name: "actuator_target", kind: "message", T: Datapoint },
    { no: 10, name: "metadata", kind: "message", T: Metadata },
]);
/**
 * @generated from message kuksa.val.v1.Datapoint
 */
class Datapoint extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from oneof kuksa.val.v1.Datapoint.value
         */
        this.value = { case: undefined };
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Datapoint().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Datapoint().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Datapoint().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Datapoint, a, b);
    }
}
exports.Datapoint = Datapoint;
Datapoint.runtime = protobuf_1.proto3;
Datapoint.typeName = "kuksa.val.v1.Datapoint";
Datapoint.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "timestamp", kind: "message", T: protobuf_1.Timestamp },
    { no: 11, name: "string", kind: "scalar", T: 9 /* ScalarType.STRING */, oneof: "value" },
    { no: 12, name: "bool", kind: "scalar", T: 8 /* ScalarType.BOOL */, oneof: "value" },
    { no: 13, name: "int32", kind: "scalar", T: 17 /* ScalarType.SINT32 */, oneof: "value" },
    { no: 14, name: "int64", kind: "scalar", T: 18 /* ScalarType.SINT64 */, oneof: "value" },
    { no: 15, name: "uint32", kind: "scalar", T: 13 /* ScalarType.UINT32 */, oneof: "value" },
    { no: 16, name: "uint64", kind: "scalar", T: 4 /* ScalarType.UINT64 */, oneof: "value" },
    { no: 17, name: "float", kind: "scalar", T: 2 /* ScalarType.FLOAT */, oneof: "value" },
    { no: 18, name: "double", kind: "scalar", T: 1 /* ScalarType.DOUBLE */, oneof: "value" },
    { no: 21, name: "string_array", kind: "message", T: StringArray, oneof: "value" },
    { no: 22, name: "bool_array", kind: "message", T: BoolArray, oneof: "value" },
    { no: 23, name: "int32_array", kind: "message", T: Int32Array, oneof: "value" },
    { no: 24, name: "int64_array", kind: "message", T: Int64Array, oneof: "value" },
    { no: 25, name: "uint32_array", kind: "message", T: Uint32Array, oneof: "value" },
    { no: 26, name: "uint64_array", kind: "message", T: Uint64Array, oneof: "value" },
    { no: 27, name: "float_array", kind: "message", T: FloatArray, oneof: "value" },
    { no: 28, name: "double_array", kind: "message", T: DoubleArray, oneof: "value" },
]);
/**
 * @generated from message kuksa.val.v1.Metadata
 */
class Metadata extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * Data type
         * The VSS data type of the entry (i.e. the value, min, max etc).
         *
         * NOTE: protobuf doesn't have int8, int16, uint8 or uint16 which means
         * that these values must be serialized as int32 and uint32 respectively.
         *
         * [field: FIELD_METADATA_DATA_TYPE]
         *
         * @generated from field: kuksa.val.v1.DataType data_type = 11;
         */
        this.dataType = DataType.UNSPECIFIED;
        /**
         * Entry type
         *
         * [field: FIELD_METADATA_ENTRY_TYPE]
         *
         * @generated from field: kuksa.val.v1.EntryType entry_type = 12;
         */
        this.entryType = EntryType.UNSPECIFIED;
        /**
         * Entry type specific metadata
         *
         * @generated from oneof kuksa.val.v1.Metadata.entry_specific
         */
        this.entrySpecific = { case: undefined };
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Metadata().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Metadata().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Metadata().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Metadata, a, b);
    }
}
exports.Metadata = Metadata;
Metadata.runtime = protobuf_1.proto3;
Metadata.typeName = "kuksa.val.v1.Metadata";
Metadata.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 11, name: "data_type", kind: "enum", T: protobuf_1.proto3.getEnumType(DataType) },
    { no: 12, name: "entry_type", kind: "enum", T: protobuf_1.proto3.getEnumType(EntryType) },
    { no: 13, name: "description", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 14, name: "comment", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 15, name: "deprecation", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 16, name: "unit", kind: "scalar", T: 9 /* ScalarType.STRING */, opt: true },
    { no: 17, name: "value_restriction", kind: "message", T: ValueRestriction },
    { no: 20, name: "actuator", kind: "message", T: Actuator, oneof: "entry_specific" },
    { no: 30, name: "sensor", kind: "message", T: Sensor, oneof: "entry_specific" },
    { no: 40, name: "attribute", kind: "message", T: Attribute, oneof: "entry_specific" },
]);
/**
 * /////////////////////
 * Actuator specific fields
 *
 * Nothing for now
 *
 * @generated from message kuksa.val.v1.Actuator
 */
class Actuator extends protobuf_1.Message {
    constructor(data) {
        super();
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Actuator().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Actuator().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Actuator().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Actuator, a, b);
    }
}
exports.Actuator = Actuator;
Actuator.runtime = protobuf_1.proto3;
Actuator.typeName = "kuksa.val.v1.Actuator";
Actuator.fields = protobuf_1.proto3.util.newFieldList(() => []);
/**
 * //////////////////////
 * Sensor specific
 *
 * Nothing for now
 *
 * @generated from message kuksa.val.v1.Sensor
 */
class Sensor extends protobuf_1.Message {
    constructor(data) {
        super();
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Sensor().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Sensor().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Sensor().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Sensor, a, b);
    }
}
exports.Sensor = Sensor;
Sensor.runtime = protobuf_1.proto3;
Sensor.typeName = "kuksa.val.v1.Sensor";
Sensor.fields = protobuf_1.proto3.util.newFieldList(() => []);
/**
 * //////////////////////
 * Attribute specific
 *
 * Nothing for now.
 *
 * @generated from message kuksa.val.v1.Attribute
 */
class Attribute extends protobuf_1.Message {
    constructor(data) {
        super();
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Attribute().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Attribute().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Attribute().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Attribute, a, b);
    }
}
exports.Attribute = Attribute;
Attribute.runtime = protobuf_1.proto3;
Attribute.typeName = "kuksa.val.v1.Attribute";
Attribute.fields = protobuf_1.proto3.util.newFieldList(() => []);
/**
 * Value restriction
 *
 * One ValueRestriction{type} for each type, since
 * they don't make sense unless the types match
 *
 *
 * @generated from message kuksa.val.v1.ValueRestriction
 */
class ValueRestriction extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from oneof kuksa.val.v1.ValueRestriction.type
         */
        this.type = { case: undefined };
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new ValueRestriction().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new ValueRestriction().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new ValueRestriction().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(ValueRestriction, a, b);
    }
}
exports.ValueRestriction = ValueRestriction;
ValueRestriction.runtime = protobuf_1.proto3;
ValueRestriction.typeName = "kuksa.val.v1.ValueRestriction";
ValueRestriction.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 21, name: "string", kind: "message", T: ValueRestrictionString, oneof: "type" },
    { no: 22, name: "signed", kind: "message", T: ValueRestrictionInt, oneof: "type" },
    { no: 23, name: "unsigned", kind: "message", T: ValueRestrictionUint, oneof: "type" },
    { no: 24, name: "floating_point", kind: "message", T: ValueRestrictionFloat, oneof: "type" },
]);
/**
 * @generated from message kuksa.val.v1.ValueRestrictionInt
 */
class ValueRestrictionInt extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated sint64 allowed_values = 3;
         */
        this.allowedValues = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new ValueRestrictionInt().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new ValueRestrictionInt().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new ValueRestrictionInt().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(ValueRestrictionInt, a, b);
    }
}
exports.ValueRestrictionInt = ValueRestrictionInt;
ValueRestrictionInt.runtime = protobuf_1.proto3;
ValueRestrictionInt.typeName = "kuksa.val.v1.ValueRestrictionInt";
ValueRestrictionInt.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "min", kind: "scalar", T: 18 /* ScalarType.SINT64 */, opt: true },
    { no: 2, name: "max", kind: "scalar", T: 18 /* ScalarType.SINT64 */, opt: true },
    { no: 3, name: "allowed_values", kind: "scalar", T: 18 /* ScalarType.SINT64 */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.ValueRestrictionUint
 */
class ValueRestrictionUint extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated uint64 allowed_values = 3;
         */
        this.allowedValues = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new ValueRestrictionUint().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new ValueRestrictionUint().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new ValueRestrictionUint().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(ValueRestrictionUint, a, b);
    }
}
exports.ValueRestrictionUint = ValueRestrictionUint;
ValueRestrictionUint.runtime = protobuf_1.proto3;
ValueRestrictionUint.typeName = "kuksa.val.v1.ValueRestrictionUint";
ValueRestrictionUint.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "min", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 2, name: "max", kind: "scalar", T: 4 /* ScalarType.UINT64 */, opt: true },
    { no: 3, name: "allowed_values", kind: "scalar", T: 4 /* ScalarType.UINT64 */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.ValueRestrictionFloat
 */
class ValueRestrictionFloat extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * allowed for doubles/floats not recommended
         *
         * @generated from field: repeated double allowed_values = 3;
         */
        this.allowedValues = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new ValueRestrictionFloat().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new ValueRestrictionFloat().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new ValueRestrictionFloat().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(ValueRestrictionFloat, a, b);
    }
}
exports.ValueRestrictionFloat = ValueRestrictionFloat;
ValueRestrictionFloat.runtime = protobuf_1.proto3;
ValueRestrictionFloat.typeName = "kuksa.val.v1.ValueRestrictionFloat";
ValueRestrictionFloat.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "min", kind: "scalar", T: 1 /* ScalarType.DOUBLE */, opt: true },
    { no: 2, name: "max", kind: "scalar", T: 1 /* ScalarType.DOUBLE */, opt: true },
    { no: 3, name: "allowed_values", kind: "scalar", T: 1 /* ScalarType.DOUBLE */, repeated: true },
]);
/**
 * min, max doesn't make much sense for a string
 *
 * @generated from message kuksa.val.v1.ValueRestrictionString
 */
class ValueRestrictionString extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated string allowed_values = 3;
         */
        this.allowedValues = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new ValueRestrictionString().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new ValueRestrictionString().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new ValueRestrictionString().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(ValueRestrictionString, a, b);
    }
}
exports.ValueRestrictionString = ValueRestrictionString;
ValueRestrictionString.runtime = protobuf_1.proto3;
ValueRestrictionString.typeName = "kuksa.val.v1.ValueRestrictionString";
ValueRestrictionString.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 3, name: "allowed_values", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
]);
/**
 * Error response shall be an HTTP-like code.
 * Should follow https://www.w3.org/TR/viss2-transport/#status-codes.
 *
 * @generated from message kuksa.val.v1.Error
 */
class Error extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: uint32 code = 1;
         */
        this.code = 0;
        /**
         * @generated from field: string reason = 2;
         */
        this.reason = "";
        /**
         * @generated from field: string message = 3;
         */
        this.message = "";
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Error().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Error().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Error().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Error, a, b);
    }
}
exports.Error = Error;
Error.runtime = protobuf_1.proto3;
Error.typeName = "kuksa.val.v1.Error";
Error.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "code", kind: "scalar", T: 13 /* ScalarType.UINT32 */ },
    { no: 2, name: "reason", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "message", kind: "scalar", T: 9 /* ScalarType.STRING */ },
]);
/**
 * Used in get/set requests to report errors for specific entries
 *
 * @generated from message kuksa.val.v1.DataEntryError
 */
class DataEntryError extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * vss path
         *
         * @generated from field: string path = 1;
         */
        this.path = "";
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new DataEntryError().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new DataEntryError().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new DataEntryError().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(DataEntryError, a, b);
    }
}
exports.DataEntryError = DataEntryError;
DataEntryError.runtime = protobuf_1.proto3;
DataEntryError.typeName = "kuksa.val.v1.DataEntryError";
DataEntryError.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "path", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "error", kind: "message", T: Error },
]);
/**
 * @generated from message kuksa.val.v1.StringArray
 */
class StringArray extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated string values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new StringArray().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new StringArray().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new StringArray().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(StringArray, a, b);
    }
}
exports.StringArray = StringArray;
StringArray.runtime = protobuf_1.proto3;
StringArray.typeName = "kuksa.val.v1.StringArray";
StringArray.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 9 /* ScalarType.STRING */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.BoolArray
 */
class BoolArray extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated bool values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new BoolArray().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new BoolArray().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new BoolArray().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(BoolArray, a, b);
    }
}
exports.BoolArray = BoolArray;
BoolArray.runtime = protobuf_1.proto3;
BoolArray.typeName = "kuksa.val.v1.BoolArray";
BoolArray.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 8 /* ScalarType.BOOL */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.Int32Array
 */
class Int32Array extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated sint32 values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Int32Array().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Int32Array().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Int32Array().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Int32Array, a, b);
    }
}
exports.Int32Array = Int32Array;
Int32Array.runtime = protobuf_1.proto3;
Int32Array.typeName = "kuksa.val.v1.Int32Array";
Int32Array.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 17 /* ScalarType.SINT32 */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.Int64Array
 */
class Int64Array extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated sint64 values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Int64Array().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Int64Array().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Int64Array().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Int64Array, a, b);
    }
}
exports.Int64Array = Int64Array;
Int64Array.runtime = protobuf_1.proto3;
Int64Array.typeName = "kuksa.val.v1.Int64Array";
Int64Array.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 18 /* ScalarType.SINT64 */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.Uint32Array
 */
class Uint32Array extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated uint32 values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Uint32Array().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Uint32Array().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Uint32Array().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Uint32Array, a, b);
    }
}
exports.Uint32Array = Uint32Array;
Uint32Array.runtime = protobuf_1.proto3;
Uint32Array.typeName = "kuksa.val.v1.Uint32Array";
Uint32Array.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 13 /* ScalarType.UINT32 */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.Uint64Array
 */
class Uint64Array extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated uint64 values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new Uint64Array().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new Uint64Array().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new Uint64Array().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(Uint64Array, a, b);
    }
}
exports.Uint64Array = Uint64Array;
Uint64Array.runtime = protobuf_1.proto3;
Uint64Array.typeName = "kuksa.val.v1.Uint64Array";
Uint64Array.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 4 /* ScalarType.UINT64 */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.FloatArray
 */
class FloatArray extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated float values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new FloatArray().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new FloatArray().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new FloatArray().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(FloatArray, a, b);
    }
}
exports.FloatArray = FloatArray;
FloatArray.runtime = protobuf_1.proto3;
FloatArray.typeName = "kuksa.val.v1.FloatArray";
FloatArray.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 2 /* ScalarType.FLOAT */, repeated: true },
]);
/**
 * @generated from message kuksa.val.v1.DoubleArray
 */
class DoubleArray extends protobuf_1.Message {
    constructor(data) {
        super();
        /**
         * @generated from field: repeated double values = 1;
         */
        this.values = [];
        protobuf_1.proto3.util.initPartial(data, this);
    }
    static fromBinary(bytes, options) {
        return new DoubleArray().fromBinary(bytes, options);
    }
    static fromJson(jsonValue, options) {
        return new DoubleArray().fromJson(jsonValue, options);
    }
    static fromJsonString(jsonString, options) {
        return new DoubleArray().fromJsonString(jsonString, options);
    }
    static equals(a, b) {
        return protobuf_1.proto3.util.equals(DoubleArray, a, b);
    }
}
exports.DoubleArray = DoubleArray;
DoubleArray.runtime = protobuf_1.proto3;
DoubleArray.typeName = "kuksa.val.v1.DoubleArray";
DoubleArray.fields = protobuf_1.proto3.util.newFieldList(() => [
    { no: 1, name: "values", kind: "scalar", T: 1 /* ScalarType.DOUBLE */, repeated: true },
]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXNfcGIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0eXBlc19wYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsaUZBQWlGO0FBQ2pGLDREQUE0RDtBQUM1RCxFQUFFO0FBQ0YsbUVBQW1FO0FBQ25FLDZDQUE2QztBQUM3QyxFQUFFO0FBQ0YsMkVBQTJFO0FBQzNFLHdEQUF3RDtBQUN4RCw2Q0FBNkM7QUFDN0MsRUFBRTtBQUNGLHNDQUFzQztBQUN0QyxnRkFBZ0Y7OztBQVVoRixpREFBZ0U7QUFFaEU7Ozs7Ozs7O0dBUUc7QUFDSCxJQUFZLFFBdUlYO0FBdklELFdBQVksUUFBUTtJQUNsQjs7T0FFRztJQUNILHFEQUFlLENBQUE7SUFFZjs7T0FFRztJQUNILDJDQUFVLENBQUE7SUFFVjs7T0FFRztJQUNILDZDQUFXLENBQUE7SUFFWDs7T0FFRztJQUNILHVDQUFRLENBQUE7SUFFUjs7T0FFRztJQUNILHlDQUFTLENBQUE7SUFFVDs7T0FFRztJQUNILHlDQUFTLENBQUE7SUFFVDs7T0FFRztJQUNILHlDQUFTLENBQUE7SUFFVDs7T0FFRztJQUNILHlDQUFTLENBQUE7SUFFVDs7T0FFRztJQUNILDJDQUFVLENBQUE7SUFFVjs7T0FFRztJQUNILDJDQUFVLENBQUE7SUFFVjs7T0FFRztJQUNILDRDQUFXLENBQUE7SUFFWDs7T0FFRztJQUNILDBDQUFVLENBQUE7SUFFVjs7T0FFRztJQUNILDRDQUFXLENBQUE7SUFFWDs7T0FFRztJQUNILGtEQUFjLENBQUE7SUFFZDs7T0FFRztJQUNILHdEQUFpQixDQUFBO0lBRWpCOztPQUVHO0lBQ0gsMERBQWtCLENBQUE7SUFFbEI7O09BRUc7SUFDSCxvREFBZSxDQUFBO0lBRWY7O09BRUc7SUFDSCxzREFBZ0IsQ0FBQTtJQUVoQjs7T0FFRztJQUNILHNEQUFnQixDQUFBO0lBRWhCOztPQUVHO0lBQ0gsc0RBQWdCLENBQUE7SUFFaEI7O09BRUc7SUFDSCxzREFBZ0IsQ0FBQTtJQUVoQjs7T0FF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RSxPQUFPLEVBQUU7SUFDeEYsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDdEYsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QixFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDeEYsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDakYsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDN0UsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDL0UsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDL0UsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUU7SUFDakYsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsV0FBVyxF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