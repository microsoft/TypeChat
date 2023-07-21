import { IClientContext } from "./main";
import { pause, next, previous } from "./endpoints";

export async function pauseHandler(clientContext: IClientContext) {
    if (clientContext.deviceId) {
      await pause(clientContext.service, clientContext.deviceId);
    }
}

export async function nextHandler(clientContext: IClientContext) {
    if (clientContext.deviceId) {
      await next(clientContext.service, clientContext.deviceId);
    }
}

export async function previousHandler(clientContext: IClientContext) {
    if (clientContext.deviceId) {
      await previous(clientContext.service, clientContext.deviceId);
    }
}
