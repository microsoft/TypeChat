/** Service-reported counts. Missing counts are unknown, not zero. */
export interface TypeChatTokenUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
}

/** Metadata for one response, excluding generated text and raw response bodies. */
export interface TypeChatResponseMetadata {
    usage?: TypeChatTokenUsage;
    /** Error class when an HTTP error body's metadata could not be read. */
    error?: string;
    filtering?: {
        blocked?: boolean;
        reason?: string;
        refusals?: string[];
        /** Provider-returned filtering details, not application data. */
        input?: unknown;
        output?: unknown;
    };
}

/**
 * Ordered response records and reported-only totals, including repair responses.
 * @see https://github.com/microsoft/TypeChat/blob/main/typescript/metadata.md
 */
export interface TypeChatMetadata {
    responses: TypeChatResponseMetadata[];
    usage?: TypeChatTokenUsage;
    /** Coverage of each total; overflow marks an unrepresentable total omitted from usage. */
    usageReporting?: { [K in keyof TypeChatTokenUsage]?: "complete" | "partial" | "overflow" };
}

/**
 * An object representing a successful operation with a result of type `T`.
 */
export type Success<T> = { success: true, data: T, metadata?: TypeChatMetadata };

/**
 * An object representing an operation that failed for the reason given in `message`.
 */
export type Error = {
    success: false;
    message: string;
    /**
     * An unvalidated value associated with the failure, when available. A translation retains the
     * latest rejected candidate, which may precede a repair response that couldn't be parsed.
     */
    data?: unknown;
    /**
     * The latest model response text, when available. This may come from a different attempt than
     * `data` if a repair response couldn't be parsed.
     */
    responseText?: string;
    metadata?: TypeChatMetadata;
};

/**
 * An object representing a successful or failed operation of type `T`.
 */
export type Result<T> = Success<T> | Error;

/**
 * Returns a `Success<T>` object.
 * @param data The value for the `data` property of the result.
 * @returns A `Success<T>` object.
 */
export function success<T>(data: T): Success<T> {
    return { success: true, data };
}

/**
 * Returns an `Error` object.
 * @param message The value for the `message` property of the result.
 * @param details Optional unvalidated data, original model response text, and metadata.
 * @returns An `Error` object.
 */
export function error(message: string, details?: Pick<Error, "data" | "responseText" | "metadata">): Error {
    const result: Error = { success: false, message };
    if (details) {
        if ("data" in details) {
            result.data = details.data;
        }
        const responseText = details.responseText;
        if (responseText !== undefined) {
            result.responseText = responseText;
        }
        const metadata = details.metadata;
        if (metadata !== undefined) {
            result.metadata = metadata;
        }
    }
    return result;
}

/** Attaches response records and sums only explicitly reported counts without mutating the result. */
export function withResponseMetadata<T>(result: Result<T>, responses: TypeChatResponseMetadata[]): Result<T> {
    if (!responses.some(response => response.usage !== undefined || response.filtering !== undefined || response.error !== undefined)) {
        return result;
    }
    const metadata: TypeChatMetadata = { responses: [...responses] };
    const usage: TypeChatTokenUsage = {};
    const reporting: NonNullable<TypeChatMetadata["usageReporting"]> = {};
    for (const key of ["inputTokens", "outputTokens", "totalTokens"] as const) {
        let total = 0;
        let reported = 0;
        let overflow = false;
        for (const response of responses) {
            const count = response.usage?.[key];
            if (count !== undefined) {
                reported++;
                if (!overflow) {
                    if (count > Number.MAX_SAFE_INTEGER - total) {
                        overflow = true;
                    } else {
                        total += count;
                    }
                }
            }
        }
        if (reported) {
            if (overflow) {
                reporting[key] = "overflow";
            } else {
                usage[key] = total;
                reporting[key] = reported === responses.length ? "complete" : "partial";
            }
        }
    }
    if (Object.keys(usage).length) {
        metadata.usage = usage;
    }
    if (Object.keys(reporting).length) {
        metadata.usageReporting = reporting;
    }
    if (result.success) {
        return { ...result, success: true, data: result.data, metadata };
    }
    return {
        ...result,
        success: false,
        message: result.message,
        ...("data" in result ? { data: result.data } : {}),
        ...(result.responseText !== undefined ? { responseText: result.responseText } : {}),
        metadata
    };
}

/**
 * Obtains the value associated with a successful `Result<T>` or throws an exception if
 * the result is an error.
 * @param result The `Result<T>` from which to obtain the `data` property.
 * @returns The value of the `data` property.
 */
export function getData<T>(result: Result<T>) {
    if (result.success) {
        return result.data;
    }
    throw new Error(result.message);
}
