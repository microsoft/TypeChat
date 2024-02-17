import { getDevices, getPlaybackState, transferPlayback } from "./endpoints";
import { IClientContext } from "./main";
import chalk from "chalk";

// convert milliseconds to elapsed minutes and seconds as a string
function msToElapsedMinSec(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  // add leading zero if needed
  if (remainingSeconds < 10) {
      return `${minutes}:0${remainingSeconds}`;
  } else {
      return `${minutes}:${remainingSeconds}`;
  }
}

const pauseSymbol = "⏸️";
const playSymbol = "▶️";

export function chalkStatus(status: SpotifyApi.CurrentPlaybackResponse) {
  if (status.item) {
      let timePart = msToElapsedMinSec(status.item.duration_ms);
      if (status.progress_ms) {
          timePart = `${msToElapsedMinSec(status.progress_ms)}/${timePart}`;
      }
      let symbol = status.is_playing ? playSymbol : pauseSymbol;
      console.log(
          `${symbol}  ${timePart}  ${chalk.cyanBright(status.item.name)}`
      );
      if (status.item.type === "track") {
          const artists =
              "   Artists: " +
              status.item.artists
                  .map((artist) => chalk.green(artist.name))
                  .join(", ");
          console.log(artists);
      }
  }
}

export async function printStatus(context: IClientContext) {
  const status = await getPlaybackState(context.service);
  if (status) {
    chalkStatus(status);
  } else {
    console.log("Nothing playing according to Spotify.");
  }
  const devices = await getDevices(context.service);
  if (devices && devices.devices.length > 0) {
    const activeDevice =
      devices.devices.find((device) => device.is_active) ?? devices.devices[0];
    if (activeDevice) {
      console.log(
        "   Active device: " +
          chalk.magenta(`${activeDevice.name} of type ${activeDevice.type}`)
      );
    } else {
      for (const device of devices.devices) {
        console.log(
          chalk.magenta(
            `   Device ${device.name} of type ${device.type} is available`
          )
        );
      }
    }
  }
}

export async function selectDevice(keyword: string, context: IClientContext) {
  const devices = await getDevices(context.service);
  if (devices && devices.devices.length > 0) {
    for (const device of devices.devices) {
      if (
        device.name.toLowerCase().includes(keyword.toLowerCase()) ||
        device.type.toLowerCase().includes(keyword.toLowerCase())
      ) {
        const status = await getPlaybackState(context.service);
        if (status) {
          if (status.device.id === device.id) {
            console.log(
              chalk.green(`Device ${device.name} is already selected`)
            );
            return;
          }
          await transferPlayback(
            context.service,
            device.id!,
            status.is_playing
          );
        }
        context.deviceId = device.id!;
        console.log(
          chalk.green(`Selected device ${device.name} of type ${device.type}`)
        );
      }
    }
  } else {
    console.log(chalk.red("No devices matched keyword"));
  }
}

export async function listAvailableDevices(context: IClientContext) {
  const devices = await getDevices(context.service);
  if (devices && devices.devices.length > 0) {
    let count = 0;
    for (const device of devices.devices) {
      console.log(
        chalk.magenta(
          `Device ${device.name} of type ${device.type} is available`
        )
      );
      count++;
    }
  }
}

