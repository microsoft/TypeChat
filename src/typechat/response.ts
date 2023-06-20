export type Success<T> = { success: true, data: T };
export type Error = { success: false, message: string, info?: unknown };
export type Response<T> = Success<T> | Error;

export function success<T>(data: T): Success<T> {
    return { success: true, data };
}

export function error(message: string, info?: unknown): Error {
    return { success: false, message, info };
}
