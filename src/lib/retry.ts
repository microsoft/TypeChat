// Copyright Microsoft Corporation
//
// Logic and settings for retrying Http Calls and other operations that may have transient failures

/**
 * Retry settings. These can come from config
 */
export type RetrySettings = {
    maxAttempts: number;
    retryPauseMS: number;
    useBackOff?: boolean;
};

export async function executeWithRetry<T>(
    retrySettings: RetrySettings,
    fn: () => Promise<T>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isTransient: (e: any) => boolean
): Promise<T> {
    let maxAttempts: number = retrySettings.maxAttempts;
    if (maxAttempts <= 0) {
        maxAttempts = 3;
    }
    let retryPauseMS: number = retrySettings.retryPauseMS;
    const max_i: number = maxAttempts - 1;
    for (let i = 0; i < maxAttempts; ++i) {
        try {
            return await fn();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            if (!isTransient(e) || i === max_i) {
                throw e;
            }
        }
        if (retryPauseMS > 0 && i < max_i) {
            await sleep(retryPauseMS);
            if (retrySettings.useBackOff) {
                retryPauseMS *= 2;
            }
        }
    }
    // We'll never actually get here because after the last attempt, we will throw the last exception
    throw new Error(`Max Attempts: ${maxAttempts} Exceeded`);
}

export function executeHttpWithRetry<T>(
    retrySettings: RetrySettings,
    fn: () => Promise<T>
): Promise<T> {
    return executeWithRetry(retrySettings, fn, isTransientHttpError);
}

export function isTransientHttpError(code: number): boolean {
    switch (code) {
        default:
            break;
        case 429: // TooManyRequests
            return true;
        case 500: //InternalServerError
        case 502: // BadGateway
        case 503: // ServiceUnavailable
        case 504: // GatewayTimeout
            return true;
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
