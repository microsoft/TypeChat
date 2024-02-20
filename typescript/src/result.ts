/**
 * An object representing a successful operation with a result of type `T`.
 */
export type Success<T> = { success: true, data: T };

/**
 * An object representing an operation that failed for the reason given in `message`.
 */
export type Error = { success: false, message: string };

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
 * @returns An `Error` object.
 */
export function error(message: string): Error {
    return { success: false, message };
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
