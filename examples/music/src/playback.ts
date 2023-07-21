import { IClientContext } from "./main";
import chalk from "chalk";
import { pause, next, previous, shuffle, getPlaybackState} from "./endpoints";

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

export async function shuffleHandler(clientContext: IClientContext) {
    const playbackState = await getPlaybackState(clientContext.service);

    if (playbackState) {
      const oldShuffleState = playbackState.shuffle_state;

      if (clientContext.deviceId) {
        console.log(chalk.cyanBright(`Toggling shuffle ${oldShuffleState ? chalk.redBright("off") : chalk.greenBright("on") }`));
        await shuffle(clientContext.service, clientContext.deviceId, !oldShuffleState);
      }
    }
}
