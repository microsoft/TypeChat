import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";
import { DataEntry, DataEntryError, Error, Field, View } from "./types_pb.js";
/**
 * Define which data we want
 *
 * @generated from message kuksa.val.v1.EntryRequest
 */
export declare class EntryRequest extends Message<EntryRequest> {
    /**
     * @generated from field: string path = 1;
     */
    path: string;
    /**
     * @generated from field: kuksa.val.v1.View view = 2;
     */
    view: View;
    /**
     * @generated from field: repeated kuksa.val.v1.Field fields = 3;
     */
    fields: Field[];
    constructor(data?: PartialMessage<EntryRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.EntryRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): EntryRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): EntryRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): EntryRequest;
    static equals(a: EntryRequest | PlainMessage<EntryRequest> | undefined, b: EntryRequest | PlainMessage<EntryRequest> | undefined): boolean;
}
/**
 * Request a set of entries.
 *
 * @generated from message kuksa.val.v1.GetRequest
 */
export declare class GetRequest extends Message<GetRequest> {
    /**
     * @generated from field: repeated kuksa.val.v1.EntryRequest entries = 1;
     */
    entries: EntryRequest[];
    constructor(data?: PartialMessage<GetRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.GetRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetRequest;
    static equals(a: GetRequest | PlainMessage<GetRequest> | undefined, b: GetRequest | PlainMessage<GetRequest> | undefined): boolean;
}
/**
 * Global errors are specified in `error`.
 * Errors for individual entries are specified in `errors`.
 *
 * @generated from message kuksa.val.v1.GetResponse
 */
export declare class GetResponse extends Message<GetResponse> {
    /**
     * @generated from field: repeated kuksa.val.v1.DataEntry entries = 1;
     */
    entries: DataEntry[];
    /**
     * @generated from field: repeated kuksa.val.v1.DataEntryError errors = 2;
     */
    errors: DataEntryError[];
    /**
     * @generated from field: kuksa.val.v1.Error error = 3;
     */
    error?: Error;
    constructor(data?: PartialMessage<GetResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.GetResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetResponse;
    static equals(a: GetResponse | PlainMessage<GetResponse> | undefined, b: GetResponse | PlainMessage<GetResponse> | undefined): boolean;
}
/**
 * Define the data we want to set
 *
 * @generated from message kuksa.val.v1.EntryUpdate
 */
export declare class EntryUpdate extends Message<EntryUpdate> {
    /**
     * @generated from field: kuksa.val.v1.DataEntry entry = 1;
     */
    entry?: DataEntry;
    /**
     * @generated from field: repeated kuksa.val.v1.Field fields = 2;
     */
    fields: Field[];
    constructor(data?: PartialMessage<EntryUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.EntryUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): EntryUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): EntryUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): EntryUpdate;
    static equals(a: EntryUpdate | PlainMessage<EntryUpdate> | undefined, b: EntryUpdate | PlainMessage<EntryUpdate> | undefined): boolean;
}
/**
 * A list of entries to be updated
 *
 * @generated from message kuksa.val.v1.SetRequest
 */
export declare class SetRequest extends Message<SetRequest> {
    /**
     * @generated from field: repeated kuksa.val.v1.EntryUpdate updates = 1;
     */
    updates: EntryUpdate[];
    constructor(data?: PartialMessage<SetRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.SetRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SetRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SetRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SetRequest;
    static equals(a: SetRequest | PlainMessage<SetRequest> | undefined, b: SetRequest | PlainMessage<SetRequest> | undefined): boolean;
}
/**
 * Global errors are specified in `error`.
 * Errors for individual entries are specified in `errors`.
 *
 * @generated from message kuksa.val.v1.SetResponse
 */
export declare class SetResponse extends Message<SetResponse> {
    /**
     * @generated from field: kuksa.val.v1.Error error = 1;
     */
    error?: Error;
    /**
     * @generated from field: repeated kuksa.val.v1.DataEntryError errors = 2;
     */
    errors: DataEntryError[];
    constructor(data?: PartialMessage<SetResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.SetResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SetResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SetResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SetResponse;
    static equals(a: SetResponse | PlainMessage<SetResponse> | undefined, b: SetResponse | PlainMessage<SetResponse> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.StreamedUpdateRequest
 */
export declare class StreamedUpdateRequest extends Message<StreamedUpdateRequest> {
    /**
     * @generated from field: repeated kuksa.val.v1.EntryUpdate updates = 1;
     */
    updates: EntryUpdate[];
    constructor(data?: PartialMessage<StreamedUpdateRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.StreamedUpdateRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StreamedUpdateRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StreamedUpdateRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StreamedUpdateRequest;
    static equals(a: StreamedUpdateRequest | PlainMessage<StreamedUpdateRequest> | undefined, b: StreamedUpdateRequest | PlainMessage<StreamedUpdateRequest> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.StreamedUpdateResponse
 */
export declare class StreamedUpdateResponse extends Message<StreamedUpdateResponse> {
    /**
     * @generated from field: kuksa.val.v1.Error error = 1;
     */
    error?: Error;
    /**
     * @generated from field: repeated kuksa.val.v1.DataEntryError errors = 2;
     */
    errors: DataEntryError[];
    constructor(data?: PartialMessage<StreamedUpdateResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.StreamedUpdateResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StreamedUpdateResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StreamedUpdateResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StreamedUpdateResponse;
    static equals(a: StreamedUpdateResponse | PlainMessage<StreamedUpdateResponse> | undefined, b: StreamedUpdateResponse | PlainMessage<StreamedUpdateResponse> | undefined): boolean;
}
/**
 * Define what to subscribe to
 *
 * @generated from message kuksa.val.v1.SubscribeEntry
 */
export declare class SubscribeEntry extends Message<SubscribeEntry> {
    /**
     * @generated from field: string path = 1;
     */
    path: string;
    /**
     * @generated from field: kuksa.val.v1.View view = 2;
     */
    view: View;
    /**
     * @generated from field: repeated kuksa.val.v1.Field fields = 3;
     */
    fields: Field[];
    constructor(data?: PartialMessage<SubscribeEntry>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.SubscribeEntry";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscribeEntry;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscribeEntry;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscribeEntry;
    static equals(a: SubscribeEntry | PlainMessage<SubscribeEntry> | undefined, b: SubscribeEntry | PlainMessage<SubscribeEntry> | undefined): boolean;
}
/**
 * Subscribe to changes in datapoints.
 *
 * @generated from message kuksa.val.v1.SubscribeRequest
 */
export declare class SubscribeRequest extends Message<SubscribeRequest> {
    /**
     * @generated from field: repeated kuksa.val.v1.SubscribeEntry entries = 1;
     */
    entries: SubscribeEntry[];
    constructor(data?: PartialMessage<SubscribeRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.SubscribeRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscribeRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscribeRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscribeRequest;
    static equals(a: SubscribeRequest | PlainMessage<SubscribeRequest> | undefined, b: SubscribeRequest | PlainMessage<SubscribeRequest> | undefined): boolean;
}
/**
 * A subscription response
 *
 * @generated from message kuksa.val.v1.SubscribeResponse
 */
export declare class SubscribeResponse extends Message<SubscribeResponse> {
    /**
     * @generated from field: repeated kuksa.val.v1.EntryUpdate updates = 1;
     */
    updates: EntryUpdate[];
    constructor(data?: PartialMessage<SubscribeResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.SubscribeResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscribeResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscribeResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscribeResponse;
    static equals(a: SubscribeResponse | PlainMessage<SubscribeResponse> | undefined, b: SubscribeResponse | PlainMessage<SubscribeResponse> | undefined): boolean;
}
/**
 * Nothing yet
 *
 * @generated from message kuksa.val.v1.GetServerInfoRequest
 */
export declare class GetServerInfoRequest extends Message<GetServerInfoRequest> {
    constructor(data?: PartialMessage<GetServerInfoRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.GetServerInfoRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetServerInfoRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetServerInfoRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetServerInfoRequest;
    static equals(a: GetServerInfoRequest | PlainMessage<GetServerInfoRequest> | undefined, b: GetServerInfoRequest | PlainMessage<GetServerInfoRequest> | undefined): boolean;
}
/**
 * @generated from message kuksa.val.v1.GetServerInfoResponse
 */
export declare class GetServerInfoResponse extends Message<GetServerInfoResponse> {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string version = 2;
     */
    version: string;
    constructor(data?: PartialMessage<GetServerInfoResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "kuksa.val.v1.GetServerInfoResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetServerInfoResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetServerInfoResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetServerInfoResponse;
    static equals(a: GetServerInfoResponse | PlainMessage<GetServerInfoResponse> | undefined, b: GetServerInfoResponse | PlainMessage<GetServerInfoResponse> | undefined): boolean;
}
