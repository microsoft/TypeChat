export type Success<T> = { success: true, data: T };
export type Error = { success: false, message: string, diagnostics?: string[] };
export type Result<T> = Success<T> | Error;

export function success<T>(data: T): Success<T> {
    return { success: true, data };
}

export function error(message: string, diagnostics?: string[]): Error {
    return { success: false, message, diagnostics };
}
