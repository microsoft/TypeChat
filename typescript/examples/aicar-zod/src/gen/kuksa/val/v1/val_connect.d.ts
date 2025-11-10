import { GetRequest, GetResponse, GetServerInfoRequest, GetServerInfoResponse, SetRequest, SetResponse, StreamedUpdateRequest, StreamedUpdateResponse, SubscribeRequest, SubscribeResponse } from "./val_pb.js";
import { MethodKind } from "@bufbuild/protobuf";
/**
 * @generated from service kuksa.val.v1.VAL
 */
export declare const VAL: {
    readonly typeName: "kuksa.val.v1.VAL";
    readonly methods: {
        /**
         * Get entries
         *
         * @generated from rpc kuksa.val.v1.VAL.Get
         */
        readonly get: {
            readonly name: "Get";
            readonly I: typeof GetRequest;
            readonly O: typeof GetResponse;
            readonly kind: MethodKind.Unary;
        };
        /**
         * Set entries
         *
         * @generated from rpc kuksa.val.v1.VAL.Set
         */
        readonly set: {
            readonly name: "Set";
            readonly I: typeof SetRequest;
            readonly O: typeof SetResponse;
            readonly kind: MethodKind.Unary;
        };
        /**
         * @generated from rpc kuksa.val.v1.VAL.StreamedUpdate
         */
        readonly streamedUpdate: {
            readonly name: "StreamedUpdate";
            readonly I: typeof StreamedUpdateRequest;
            readonly O: typeof StreamedUpdateResponse;
            readonly kind: MethodKind.BiDiStreaming;
        };
        /**
         * Subscribe to a set of entries
         *
         * Returns a stream of notifications.
         *
         * InvalidArgument is returned if the request is malformed.
         *
         * @generated from rpc kuksa.val.v1.VAL.Subscribe
         */
        readonly subscribe: {
            readonly name: "Subscribe";
            readonly I: typeof SubscribeRequest;
            readonly O: typeof SubscribeResponse;
            readonly kind: MethodKind.ServerStreaming;
        };
        /**
         * Shall return information that allows the client to determine
         * what server/server implementation/version it is talking to
         * eg. kuksa-databroker 0.5.1
         *
         * @generated from rpc kuksa.val.v1.VAL.GetServerInfo
         */
        readonly getServerInfo: {
            readonly name: "GetServerInfo";
            readonly I: typeof GetServerInfoRequest;
            readonly O: typeof GetServerInfoResponse;
            readonly kind: MethodKind.Unary;
        };
    };
};
