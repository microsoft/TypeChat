// Copyright Microsoft Corporation
//
// Logic and settings for retrying Http Calls and other operations that may have transient failures 

export type RetrySettings = {
    maxAttempts : number;
    retryPauseMS : number;
}

export class MaxAttemptsExceededError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export async function executeWithRetry<T>(
    maxAttempts : number, 
    retryPauseMS : number = 1000, 
    fn : () => Promise<T>, 
    isTransient : (ex : Error) => boolean) : Promise<T>
{

    for (let i = 0; i < maxAttempts; ++i) {
        try {
            return await fn();
        }
        catch(e : any) {
            if (!isTransient(e)) {
                throw e;
            }
        }
        if (retryPauseMS > 0) {
            await sleep(retryPauseMS);
        }
    }
    throw new MaxAttemptsExceededError(`Max Attempts: ${maxAttempts} Exceeded`);
}

export function isTransientHttpError(code : number) : boolean {
    switch(code) {
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

function sleep(ms: number) : Promise<void>  {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
