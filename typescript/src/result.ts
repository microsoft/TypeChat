/**
 * An object representing a successful operation with a result of type `T`.
 */
export type Success<T> = { success: true, data: T };

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
 * @param details Optional unvalidated data and original model response text.
 * @returns An `Error` object.
 */
export function error(message: string, details?: Pick<Error, "data" | "responseText">): Error {
    const result: Error = { success: false, message };
    if (details) {
        if ("data" in details) {
            result.data = details.data;
        }
        const responseText = details.responseText;
        if (responseText !== undefined) {
            result.responseText = responseText;
        }
    }
    return result;
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
