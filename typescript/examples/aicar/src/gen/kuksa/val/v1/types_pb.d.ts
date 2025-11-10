import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3, Timestamp } from "@bufbuild/protobuf";
/**
 * VSS Data type of a signal
 *
 * Protobuf doesn't support int8, int16, uint8 or uint16.
 * These are mapped to int32 and uint32 respectively.
 *
 *
 * @generated from enum kuksa.val.v1.DataType
 */
export declare enum DataType {
    /**
     * @generated from enum value: DATA_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: DATA_TYPE_STRING = 1;
     */
    STRING = 1,
    /**
     * @generated from enum value: DATA_TYPE_BOOLEAN = 2;
     */
    BOOLEAN = 2,
    /**
     * @generated from enum value: DATA_TYPE_INT8 = 3;
     */
    INT8 = 3,
    /**
     * @generated from enum value: DATA_TYPE_INT16 = 4;
     */
    INT16 = 4,
    /**
     * @generated from enum value: DATA_TYPE_INT32 = 5;
     */
    INT32 = 5,
    /**
     * @generated from enum value: DATA_TYPE_INT64 = 6;
     */
    INT64 = 6,
    /**
     * @generated from enum value: DATA_TYPE_UINT8 = 7;
     */
    UINT8 = 7,
    /**
     * @generated from enum value: DATA_TYPE_UINT16 = 8;
     */
    UINT16 = 8,
    /**
     * @generated from enum value: DATA_TYPE_UINT32 = 9;
     */
    UINT32 = 9,
    /**
     * @generated from enum value: DATA_TYPE_UINT64 = 10;
     */
    UINT64 = 10,
    /**
     * @generated from enum value: DATA_TYPE_FLOAT = 11;
     */
    FLOAT = 11,
    /**
     * @generated from enum value: DATA_TYPE_DOUBLE = 12;
     */
    DOUBLE = 12,
    /**
     * @generated from enum value: DATA_TYPE_TIMESTAMP = 13;
     */
    TIMESTAMP = 13,
    /**
     * @generated from enum value: DATA_TYPE_STRING_ARRAY = 20;
     */
    STRING_ARRAY = 20,
    /**
     * @generated from enum value: DATA_TYPE_BOOLEAN_ARRAY = 21;
     */
    BOOLEAN_ARRAY = 21,
    /**
     * @generated from enum value: DATA_TYPE_INT8_ARRAY = 22;
     */
    INT8_ARRAY = 22,
    /**
     * @generated from enum value: DATA_TYPE_INT16_ARRAY = 23;
     */
    INT16_ARRAY = 23,
    /**
     * @generated from enum value: DATA_TYPE_INT32_ARRAY = 24;
     */
    INT32_ARRAY = 24,
    /**
     * @generated from enum value: DATA_TYPE_INT64_ARRAY = 25;
     */
    INT64_ARRAY = 25,
    /**
     * @generated from enum value: DATA_TYPE_UINT8_ARRAY = 26;
     */
    UINT8_ARRAY = 26,
    /**
     * @generated from enum value: DATA_TYPE_UINT16_ARRAY = 27;
     */
    UINT16_ARRAY = 27,
    /**
     * @generated from enum value: DATA_TYPE_UINT32_ARRAY = 28;
     */
    UINT32_ARRAY = 28,
    /**
     * @generated from enum value: DATA_TYPE_UINT64_ARRAY = 29;
     */
    UINT64_ARRAY = 29,
    /**
     * @generated from enum value: DATA_TYPE_FLOAT_ARRAY = 30;
     */
    FLOAT_ARRAY = 30,
    /**
     * @generated from enum value: DATA_TYPE_DOUBLE_ARRAY = 31;
     */
    DOUBLE_ARRAY = 31,
    /**
     * @generated from enum value: DATA_TYPE_TIMESTAMP_ARRAY = 32;
     */
    TIMESTAMP_ARRAY = 32
}
/**
 * Entry type
 *
 * @generated from enum kuksa.val.v1.EntryType
 */
export declare enum EntryType {
    /**
     * @generated from enum value: ENTRY_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: ENTRY_TYPE_ATTRIBUTE = 1;
     */
    ATTRIBUTE = 1,
    /**
     * @generated from enum value: ENTRY_TYPE_SENSOR = 2;
     */
    SENSOR = 2,
    /**
     * @generated from enum value: ENTRY_TYPE_ACTUATOR = 3;
     */
    ACTUATOR = 3
}
/**
 * A `View` specifies a set of fields which should
 * be populated in a `DataEntry` (in a response message)
 *
 * @generated from enum kuksa.val.v1.View
 */
export declare enum View {
    /**
     * Unspecified. Equivalent to VIEW_CURRENT_VALUE unless `fields` are explicitly set.
     *
     * @generated from enum value: VIEW_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * Populate DataEntry with value.
     *
     * @generated from enum value: VIEW_CURRENT_VALUE = 1;
     */
    CURRENT_VALUE = 1,
    /**
     * Populate DataEntry with actuator target.
     *
     * @generated from enum value: VIEW_TARGET_VALUE = 2;
     */
    TARGET_VALUE = 2,
    /**
     * Populate DataEntry with metadata.
     *
     * @generated from enum value: VIEW_METADATA = 3;
     */
    METADATA = 3,
    /**
     * Populate DataEntry only with requested fields.
     *
     * @generated from enum value: VIEW_FIELDS = 10;
     */
    FIELDS = 10,
    /**
     * Populate DataEntry with everything.
     *
     * @generated from enum value: VIEW_ALL = 20;
     */
    ALL = 20
}
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
export declare enum Field {
    /**
     * "*" i.e. everything
     *
     * @generated from enum value: FIELD_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * path
     *
     * @generated from enum value: FIELD_PATH = 1;
     */
    PATH = 1,
    /**
     * value
     *
     * @generated from enum value: FIELD_VALUE = 2;
     */
    VALUE = 2,
    /**
     * actuator_target
     *
     * @generated from enum value: FIELD_ACTUATOR_TARGET = 3;
     */
    ACTUATOR_TARGET = 3,
    /**
     * metadata.*
     *
     * @generated from enum value: FIELD_METADATA = 10;
     */
    METADATA = 10,
    /**
     * metadata.data_type
     *
     * @generated from enum value: FIELD_METADATA_DATA_TYPE = 11;
     */
    METADATA_DATA_TYPE = 11,
    /**
     * metadata.description
     *
     * @generated from enum value: FIELD_METADATA_DESCRIPTION = 12;
     */
    METADATA_DESCRIPTION = 12,
    /**
     * metadata.entry_type
     *
     * @generated from enum value: FIELD_METADATA_ENTRY_TYPE = 13;
     */
    METADATA_ENTRY_TYPE = 13,
    /**
     * metadata.comment
     *
     * @generated from enum value: FIELD_METADATA_COMMENT = 14;
     */
    METADATA_COMMENT = 14,
    /**
     * metadata.deprecation
     *
     * @generated from enum value: FIELD_METADATA_DEPRECATION = 15;
     */
    METADATA_DEPRECATION = 15,
    /**
     * metadata.unit
     *
     * @generated from enum value: FIELD_METADATA_UNIT = 16;
     */
    METADATA_UNIT = 16,
    /**
     * metadata.value_restriction.*
     *
     * @generated from enum value: FIELD_METADATA_VALUE_RESTRICTION = 17;
     */
    METADATA_VALUE_RESTRICTION = 17,
    /**
     * metadata.actuator.*
     *
     * @generated from enum value: FIELD_METADATA_ACTUATOR = 20;
     */
    METADATA_ACTUATOR = 20,
    /**
     * metadata.sensor.*
     *
     * @generated from enum value: FIELD_METADATA_SENSOR = 30;
     */
    METADATA_SENSOR = 30,
    /**
     * metadata.attribute.*
     *
     * @generated from enum value: FIELD_METADATA_ATTRIBUTE = 40;
     */
    METADATA_ATTRIBUTE = 40
}
/**
 * Describes a VSS entry
 * When requesting an entry, the amount of information returned can
 * be controlled by specifying either a `View` or a set of `Field`s.
 *
 * @generated from message kuksa.val.v1.DataEntry
 */
export declare class DataEntry extends Message<DataEntry> {
    /**
     * Defines the full VSS path of the entry.
     *
     * [field: FIELD_PATH]
     *
     * @generated from field: string path = 1;
     */
    path: string;
    /**
     * The value (datapoint)
     *
     * [field: FIELD_VALUE]
     *
     * @generated from field: kuksa.val.v1.Datapoint value = 2;
     */
    value?: Datapoint;
    /**
     * Actuator target (only used if the entry is an actuator)
     *
     * [field: FIELD_ACTUATOR_TARGET]
     *
     * @generated from field: kuksa.val.v1.Datapoint actuator_target = 3;
     */
    actuatorTarget?: Datapoint;
    /**
     * Metadata for this entry
     *
     * [field: FIELD_METADATA]
     *
     * @generated from field: kuksa.val.v1.Metadata metadata = 10;
     */
    metadata?: Metadata;
    constructor(data?: PartialMessage<DataEntry>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.DataEntry";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DataEntry;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DataEntry;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DataEntry;
    static equals(a: DataEntry | PlainMessage<DataEntry> | undefined, b: DataEntry | PlainMessage<DataEntry> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.Datapoint
 */
export declare class Datapoint extends Message<Datapoint> {
    /**
     * @generated from field: google.protobuf.Timestamp timestamp = 1;
     */
    timestamp?: Timestamp;
    /**
     * @generated from oneof kuksa.val.v1.Datapoint.value
     */
    value: {
        /**
         * @generated from field: string string = 11;
         */
        value: string;
        case: "string";
    } | {
        /**
         * @generated from field: bool bool = 12;
         */
        value: boolean;
        case: "bool";
    } | {
        /**
         * @generated from field: sint32 int32 = 13;
         */
        value: number;
        case: "int32";
    } | {
        /**
         * @generated from field: sint64 int64 = 14;
         */
        value: bigint;
        case: "int64";
    } | {
        /**
         * @generated from field: uint32 uint32 = 15;
         */
        value: number;
        case: "uint32";
    } | {
        /**
         * @generated from field: uint64 uint64 = 16;
         */
        value: bigint;
        case: "uint64";
    } | {
        /**
         * @generated from field: float float = 17;
         */
        value: number;
        case: "float";
    } | {
        /**
         * @generated from field: double double = 18;
         */
        value: number;
        case: "double";
    } | {
        /**
         * @generated from field: kuksa.val.v1.StringArray string_array = 21;
         */
        value: StringArray;
        case: "stringArray";
    } | {
        /**
         * @generated from field: kuksa.val.v1.BoolArray bool_array = 22;
         */
        value: BoolArray;
        case: "boolArray";
    } | {
        /**
         * @generated from field: kuksa.val.v1.Int32Array int32_array = 23;
         */
        value: Int32Array;
        case: "int32Array";
    } | {
        /**
         * @generated from field: kuksa.val.v1.Int64Array int64_array = 24;
         */
        value: Int64Array;
        case: "int64Array";
    } | {
        /**
         * @generated from field: kuksa.val.v1.Uint32Array uint32_array = 25;
         */
        value: Uint32Array;
        case: "uint32Array";
    } | {
        /**
         * @generated from field: kuksa.val.v1.Uint64Array uint64_array = 26;
         */
        value: Uint64Array;
        case: "uint64Array";
    } | {
        /**
         * @generated from field: kuksa.val.v1.FloatArray float_array = 27;
         */
        value: FloatArray;
        case: "floatArray";
    } | {
        /**
         * @generated from field: kuksa.val.v1.DoubleArray double_array = 28;
         */
        value: DoubleArray;
        case: "doubleArray";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<Datapoint>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Datapoint";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Datapoint;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Datapoint;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Datapoint;
    static equals(a: Datapoint | PlainMessage<Datapoint> | undefined, b: Datapoint | PlainMessage<Datapoint> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.Metadata
 */
export declare class Metadata extends Message<Metadata> {
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
    dataType: DataType;
    /**
     * Entry type
     *
     * [field: FIELD_METADATA_ENTRY_TYPE]
     *
     * @generated from field: kuksa.val.v1.EntryType entry_type = 12;
     */
    entryType: EntryType;
    /**
     * Description
     * Describes the meaning and content of the entry.
     *
     * [field: FIELD_METADATA_DESCRIPTION]
     *
     * @generated from field: optional string description = 13;
     */
    description?: string;
    /**
     * Comment [optional]
     * A comment can be used to provide additional informal information
     * on a entry.
     *
     * [field: FIELD_METADATA_COMMENT]
     *
     * @generated from field: optional string comment = 14;
     */
    comment?: string;
    /**
     * Deprecation [optional]
     * Whether this entry is deprecated. Can contain recommendations of what
     * to use instead.
     *
     * [field: FIELD_METADATA_DEPRECATION]
     *
     * @generated from field: optional string deprecation = 15;
     */
    deprecation?: string;
    /**
     * Unit [optional]
     * The unit of measurement
     *
     * [field: FIELD_METADATA_UNIT]
     *
     * @generated from field: optional string unit = 16;
     */
    unit?: string;
    /**
     * Value restrictions [optional]
     * Restrict which values are allowed.
     * Only restrictions matching the DataType {datatype} above are valid.
     *
     * [field: FIELD_METADATA_VALUE_RESTRICTION]
     *
     * @generated from field: kuksa.val.v1.ValueRestriction value_restriction = 17;
     */
    valueRestriction?: ValueRestriction;
    /**
     * Entry type specific metadata
     *
     * @generated from oneof kuksa.val.v1.Metadata.entry_specific
     */
    entrySpecific: {
        /**
         * [field: FIELD_METADATA_ACTUATOR]
         *
         * @generated from field: kuksa.val.v1.Actuator actuator = 20;
         */
        value: Actuator;
        case: "actuator";
    } | {
        /**
         * [field: FIELD_METADATA_SENSOR]
         *
         * @generated from field: kuksa.val.v1.Sensor sensor = 30;
         */
        value: Sensor;
        case: "sensor";
    } | {
        /**
         * [field: FIELD_METADATA_ATTRIBUTE]
         *
         * @generated from field: kuksa.val.v1.Attribute attribute = 40;
         */
        value: Attribute;
        case: "attribute";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<Metadata>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Metadata";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Metadata;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Metadata;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Metadata;
    static equals(a: Metadata | PlainMessage<Metadata> | undefined, b: Metadata | PlainMessage<Metadata> | undefined): boolean;
}
/**
 * /////////////////////
 * Actuator specific fields
 *
 * Nothing for now
 *
 * @generated from message kuksa.val.v1.Actuator
 */
export declare class Actuator extends Message<Actuator> {
    constructor(data?: PartialMessage<Actuator>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Actuator";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Actuator;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Actuator;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Actuator;
    static equals(a: Actuator | PlainMessage<Actuator> | undefined, b: Actuator | PlainMessage<Actuator> | undefined): boolean;
}
/**
 * //////////////////////
 * Sensor specific
 *
 * Nothing for now
 *
 * @generated from message kuksa.val.v1.Sensor
 */
export declare class Sensor extends Message<Sensor> {
    constructor(data?: PartialMessage<Sensor>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Sensor";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Sensor;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Sensor;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Sensor;
    static equals(a: Sensor | PlainMessage<Sensor> | undefined, b: Sensor | PlainMessage<Sensor> | undefined): boolean;
}
/**
 * //////////////////////
 * Attribute specific
 *
 * Nothing for now.
 *
 * @generated from message kuksa.val.v1.Attribute
 */
export declare class Attribute extends Message<Attribute> {
    constructor(data?: PartialMessage<Attribute>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Attribute";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Attribute;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Attribute;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Attribute;
    static equals(a: Attribute | PlainMessage<Attribute> | undefined, b: Attribute | PlainMessage<Attribute> | undefined): boolean;
}
/**
 * Value restriction
 *
 * One ValueRestriction{type} for each type, since
 * they don't make sense unless the types match
 *
 *
 * @generated from message kuksa.val.v1.ValueRestriction
 */
export declare class ValueRestriction extends Message<ValueRestriction> {
    /**
     * @generated from oneof kuksa.val.v1.ValueRestriction.type
     */
    type: {
        /**
         * @generated from field: kuksa.val.v1.ValueRestrictionString string = 21;
         */
        value: ValueRestrictionString;
        case: "string";
    } | {
        /**
         * For signed VSS integers
         *
         * @generated from field: kuksa.val.v1.ValueRestrictionInt signed = 22;
         */
        value: ValueRestrictionInt;
        case: "signed";
    } | {
        /**
         * For unsigned VSS integers
         *
         * @generated from field: kuksa.val.v1.ValueRestrictionUint unsigned = 23;
         */
        value: ValueRestrictionUint;
        case: "unsigned";
    } | {
        /**
         * For floating point VSS values (float and double)
         *
         * @generated from field: kuksa.val.v1.ValueRestrictionFloat floating_point = 24;
         */
        value: ValueRestrictionFloat;
        case: "floatingPoint";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<ValueRestriction>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.ValueRestriction";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ValueRestriction;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ValueRestriction;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ValueRestriction;
    static equals(a: ValueRestriction | PlainMessage<ValueRestriction> | undefined, b: ValueRestriction | PlainMessage<ValueRestriction> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.ValueRestrictionInt
 */
export declare class ValueRestrictionInt extends Message<ValueRestrictionInt> {
    /**
     * @generated from field: optional sint64 min = 1;
     */
    min?: bigint;
    /**
     * @generated from field: optional sint64 max = 2;
     */
    max?: bigint;
    /**
     * @generated from field: repeated sint64 allowed_values = 3;
     */
    allowedValues: bigint[];
    constructor(data?: PartialMessage<ValueRestrictionInt>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.ValueRestrictionInt";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ValueRestrictionInt;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ValueRestrictionInt;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ValueRestrictionInt;
    static equals(a: ValueRestrictionInt | PlainMessage<ValueRestrictionInt> | undefined, b: ValueRestrictionInt | PlainMessage<ValueRestrictionInt> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.ValueRestrictionUint
 */
export declare class ValueRestrictionUint extends Message<ValueRestrictionUint> {
    /**
     * @generated from field: optional uint64 min = 1;
     */
    min?: bigint;
    /**
     * @generated from field: optional uint64 max = 2;
     */
    max?: bigint;
    /**
     * @generated from field: repeated uint64 allowed_values = 3;
     */
    allowedValues: bigint[];
    constructor(data?: PartialMessage<ValueRestrictionUint>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.ValueRestrictionUint";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ValueRestrictionUint;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ValueRestrictionUint;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ValueRestrictionUint;
    static equals(a: ValueRestrictionUint | PlainMessage<ValueRestrictionUint> | undefined, b: ValueRestrictionUint | PlainMessage<ValueRestrictionUint> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.ValueRestrictionFloat
 */
export declare class ValueRestrictionFloat extends Message<ValueRestrictionFloat> {
    /**
     * @generated from field: optional double min = 1;
     */
    min?: number;
    /**
     * @generated from field: optional double max = 2;
     */
    max?: number;
    /**
     * allowed for doubles/floats not recommended
     *
     * @generated from field: repeated double allowed_values = 3;
     */
    allowedValues: number[];
    constructor(data?: PartialMessage<ValueRestrictionFloat>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.ValueRestrictionFloat";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ValueRestrictionFloat;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ValueRestrictionFloat;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ValueRestrictionFloat;
    static equals(a: ValueRestrictionFloat | PlainMessage<ValueRestrictionFloat> | undefined, b: ValueRestrictionFloat | PlainMessage<ValueRestrictionFloat> | undefined): boolean;
}
/**
 * min, max doesn't make much sense for a string
 *
 * @generated from message kuksa.val.v1.ValueRestrictionString
 */
export declare class ValueRestrictionString extends Message<ValueRestrictionString> {
    /**
     * @generated from field: repeated string allowed_values = 3;
     */
    allowedValues: string[];
    constructor(data?: PartialMessage<ValueRestrictionString>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.ValueRestrictionString";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ValueRestrictionString;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ValueRestrictionString;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ValueRestrictionString;
    static equals(a: ValueRestrictionString | PlainMessage<ValueRestrictionString> | undefined, b: ValueRestrictionString | PlainMessage<ValueRestrictionString> | undefined): boolean;
}
/**
 * Error response shall be an HTTP-like code.
 * Should follow https://www.w3.org/TR/viss2-transport/#status-codes.
 *
 * @generated from message kuksa.val.v1.Error
 */
export declare class Error extends Message<Error> {
    /**
     * @generated from field: uint32 code = 1;
     */
    code: number;
    /**
     * @generated from field: string reason = 2;
     */
    reason: string;
    /**
     * @generated from field: string message = 3;
     */
    message: string;
    constructor(data?: PartialMessage<Error>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Error";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Error;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Error;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Error;
    static equals(a: Error | PlainMessage<Error> | undefined, b: Error | PlainMessage<Error> | undefined): boolean;
}
/**
 * Used in get/set requests to report errors for specific entries
 *
 * @generated from message kuksa.val.v1.DataEntryError
 */
export declare class DataEntryError extends Message<DataEntryError> {
    /**
     * vss path
     *
     * @generated from field: string path = 1;
     */
    path: string;
    /**
     * @generated from field: kuksa.val.v1.Error error = 2;
     */
    error?: Error;
    constructor(data?: PartialMessage<DataEntryError>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.DataEntryError";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DataEntryError;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DataEntryError;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DataEntryError;
    static equals(a: DataEntryError | PlainMessage<DataEntryError> | undefined, b: DataEntryError | PlainMessage<DataEntryError> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.StringArray
 */
export declare class StringArray extends Message<StringArray> {
    /**
     * @generated from field: repeated string values = 1;
     */
    values: string[];
    constructor(data?: PartialMessage<StringArray>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.StringArray";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StringArray;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StringArray;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StringArray;
    static equals(a: StringArray | PlainMessage<StringArray> | undefined, b: StringArray | PlainMessage<StringArray> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.BoolArray
 */
export declare class BoolArray extends Message<BoolArray> {
    /**
     * @generated from field: repeated bool values = 1;
     */
    values: boolean[];
    constructor(data?: PartialMessage<BoolArray>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.BoolArray";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): BoolArray;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): BoolArray;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): BoolArray;
    static equals(a: BoolArray | PlainMessage<BoolArray> | undefined, b: BoolArray | PlainMessage<BoolArray> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.Int32Array
 */
export declare class Int32Array extends Message<Int32Array> {
    /**
     * @generated from field: repeated sint32 values = 1;
     */
    values: number[];
    constructor(data?: PartialMessage<Int32Array>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Int32Array";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Int32Array;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Int32Array;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Int32Array;
    static equals(a: Int32Array | PlainMessage<Int32Array> | undefined, b: Int32Array | PlainMessage<Int32Array> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.Int64Array
 */
export declare class Int64Array extends Message<Int64Array> {
    /**
     * @generated from field: repeated sint64 values = 1;
     */
    values: bigint[];
    constructor(data?: PartialMessage<Int64Array>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Int64Array";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Int64Array;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Int64Array;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Int64Array;
    static equals(a: Int64Array | PlainMessage<Int64Array> | undefined, b: Int64Array | PlainMessage<Int64Array> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.Uint32Array
 */
export declare class Uint32Array extends Message<Uint32Array> {
    /**
     * @generated from field: repeated uint32 values = 1;
     */
    values: number[];
    constructor(data?: PartialMessage<Uint32Array>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Uint32Array";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Uint32Array;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Uint32Array;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Uint32Array;
    static equals(a: Uint32Array | PlainMessage<Uint32Array> | undefined, b: Uint32Array | PlainMessage<Uint32Array> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.Uint64Array
 */
export declare class Uint64Array extends Message<Uint64Array> {
    /**
     * @generated from field: repeated uint64 values = 1;
     */
    values: bigint[];
    constructor(data?: PartialMessage<Uint64Array>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.Uint64Array";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Uint64Array;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Uint64Array;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Uint64Array;
    static equals(a: Uint64Array | PlainMessage<Uint64Array> | undefined, b: Uint64Array | PlainMessage<Uint64Array> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.FloatArray
 */
export declare class FloatArray extends Message<FloatArray> {
    /**
     * @generated from field: repeated float values = 1;
     */
    values: number[];
    constructor(data?: PartialMessage<FloatArray>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.FloatArray";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): FloatArray;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): FloatArray;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): FloatArray;
    static equals(a: FloatArray | PlainMessage<FloatArray> | undefined, b: FloatArray | PlainMessage<FloatArray> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.DoubleArray
 */
export declare class DoubleArray extends Message<DoubleArray> {
    /**
     * @generated from field: repeated double values = 1;
     */
    values: number[];
    constructor(data?: PartialMessage<DoubleArray>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.DoubleArray";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DoubleArray;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DoubleArray;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DoubleArray;
    static equals(a: DoubleArray | PlainMessage<DoubleArray> | undefined, b: DoubleArray | PlainMessage<DoubleArray> | undefined): boolean;
}
