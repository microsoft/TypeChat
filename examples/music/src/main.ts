import fs from "fs";
import path from "path";
import { Authzor } from "./authz";
import chalk from "chalk";
import * as Filter from "./trackFilter";
import {
  createLanguageModel,
  createProgramTranslator,
  processRequests,
  Program,
  createModuleTextFromProgram,
  evaluateJsonProgram,
  getData,
} from "typechat";
import dotenv from "dotenv";

import {
  FilterTracksArgs,
  GetFavoritesOptions,
  PlayTracksOptions,
  SetVolumeArgs,
} from "./chatifyActionsSchema";
import {
  play,
  getUserProfile,
  getDevices,
  search,
  setVolume,
  getKRecent,
  limitMax,
  getTopK,
  // getArtist,
  createPlaylist,
  deletePlaylist,
  getPlaylists,
  getArtist,
  getPlaybackState,
  getPlaylistTracks,
} from "./endpoints";
import {
  pauseHandler,
  nextHandler,
  previousHandler,
  shuffleHandler
} from "./playback";
import { SpotifyService, User } from "./service";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
const schemaFilename = "chatifyActionsSchema.ts";
const model = createLanguageModel(process.env);

// open schema file containing ts definitions
const schemaText = fs.readFileSync(
  path.join(__dirname, schemaFilename),
  "utf8"
);

const keys = {
  clientId: process.env.SPOTIFY_APP_CLI,
  clientSecret: process.env.SPOTIFY_APP_CLISEC,
};

export interface IClientContext {
  service: SpotifyService;
  deviceId?: string;
  user: User;
  lastTrackList?: SpotifyApi.TrackObjectFull[];
}

function printTrackNames(
  tracks: SpotifyApi.TrackObjectFull[],
  context?: IClientContext
) {
  let count = 0;
  for (const track of tracks) {
    let prefix = "";
    if (context) {
      prefix = `T${count}: `;
    }
    console.log(chalk.cyanBright(`${prefix}${track.name}`));
    count++;
  }
  if (context) {
    context.lastTrackList = tracks.slice();
  }
}

function uniqueTracks(tracks: SpotifyApi.TrackObjectFull[]) {
  const map = new Map<string, SpotifyApi.TrackObjectFull>();
  for (const track of tracks) {
    map.set(track.id, track);
  }
  return [...map.values()];
}

async function llmFilter(
  description: string,
  tracks: SpotifyApi.TrackObjectFull[]
) {
  let prompt =
    "The following is a numbered list of music tracks, one track per line\n";
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    prompt += `${i}: ${track.name}\n`;
  }
  prompt += `Use the following TypeScript type to output the track names that match the description ${description}:
    type Matches = {
        trackNumbers: number[];
    };`;
  prompt += `Here is a JSON object of type Matches containing the track numbers of the tracks that match ${description}:`;
  const ret = await model.complete(prompt);
  return ret;
}

function chalkPlan(plan: Program) {
  console.log(chalk.green("Plan Validated:"));
  const lines = JSON.stringify(plan, null, 4).split("\n");
  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i].replace(
      /"([^"]+)"(:?)|([0-9]+)/g,
      (match, word, colon, integer) => {
        if (integer) {
          return chalk.hex("#B5CEA8")(integer);
        } else if (colon) {
          return `"${chalk.cyan(word)}":`;
        } else {
          return `"${chalk.rgb(181, 101, 29)(word)}"`;
        }
      }
    );
    console.log(lines[i]);
  }
}

function localParser(userPrompt: string) {
  userPrompt = userPrompt.trim();
  if (userPrompt === "play" || userPrompt === "pause" || userPrompt === "next" || userPrompt === "previous" || userPrompt === "shuffle") {
    console.log(chalk.green("Instance parsed locally:"));
    let localParseResult = userPrompt;
    if (userPrompt !== "play") {
      localParseResult = "controlPlayback";
    }
    return JSON.stringify({
      "@steps": [
        {
          "@func": localParseResult,
          "@args": [userPrompt !== "play" ? userPrompt : ""],
        },
      ],
    });
  } else if (userPrompt.startsWith("play")) {
    const matchedPlaySelect = userPrompt.match(
      /play (T|t|track|Track|#|number|Number|no.|No.)?\s?([0-9]+)/
    );
    if (matchedPlaySelect) {
      const trackOffset = +matchedPlaySelect[2];
      console.log(chalk.green("Instance parsed locally:"));
      return JSON.stringify({
        "@steps": [
          {
            "@func": "getLastTrackList",
            "@args": [],
          },
          {
            "@func": "play",
            "@args": [{ "@ref": 0 }, { offset: trackOffset }],
          },
        ],
      });
    }
  }
  return undefined;
}

const filterDiag = false;

async function applyFilterExpr(
  clientContext: IClientContext,
  filterExpr: Filter.FilterNode,
  tracks: SpotifyApi.TrackObjectFull[],
  negate = false
): Promise<SpotifyApi.TrackObjectFull[]> {
  if (tracks.length === 0) {
    return tracks;
  }
  switch (filterExpr.type) {
    case "constraint":
      switch (filterExpr.constraintType) {
        case Filter.FilterConstraintType.Genre: {
          process.stdout.write(`fetching genre for ${tracks.length} tracks`);
          const genre = filterExpr.constraintValue;
          const results = [] as SpotifyApi.TrackObjectFull[];
          for (const track of tracks) {
            process.stdout.write(".");
            const wrapper = await getArtist(
              clientContext.service,
              track.album.artists[0].id
            );
            if (wrapper) {
              let hit = wrapper.artists[0].genres.includes(genre);
              if (negate) {
                hit = !hit;
              }
              if (hit) {
                results.push(track);
              }
            }
          }
          process.stdout.write("\n");
          tracks = results;
          break;
        }
        case Filter.FilterConstraintType.Artist: {
          const results = [] as SpotifyApi.TrackObjectFull[];
          for (const track of tracks) {
            let hit = false;
            for (const artist of track.artists) {
              if (filterDiag) {
                console.log(
                  `${artist.name.toLowerCase()} vs ${filterExpr.constraintValue.toLowerCase()}`
                );
              }
              if (
                artist.name
                  .toLowerCase()
                  .includes(filterExpr.constraintValue.toLowerCase())
              ) {
                hit = true;
              }
              if (negate) {
                hit = !hit;
              }
              if (hit) {
                results.push(track);
              }
              if (hit) {
                break;
              }
            }
          }
          process.stdout.write("\n");
          tracks = results;
          break;
        }
        case Filter.FilterConstraintType.Year: {
          const results = [] as SpotifyApi.TrackObjectFull[];
          for (const track of tracks) {
            // TODO year ranges
            if (filterDiag) {
              console.log(
                `${track.album.release_date} vs ${filterExpr.constraintValue}`
              );
            }
            if (track.album.release_date.includes(filterExpr.constraintValue)) {
              results.push(track);
            }
          }
          tracks = results;
          break;
        }
        case Filter.FilterConstraintType.Description: {
          const results = [] as SpotifyApi.TrackObjectFull[];

          const indicesResult = await llmFilter(
            filterExpr.constraintValue,
            tracks
          );
          if (indicesResult.success) {
            if (indicesResult.data) {
              const indices = JSON.parse(indicesResult.data) as {
                trackNumbers: number[];
              };
              for (const j of indices.trackNumbers) {
                results.push(tracks[j]);
              }
            }
          }
          tracks = results;
          break;
        }
      }
      break;
    case "combiner":
      if (filterExpr.combinerType === Filter.FilterCombinerType.AND) {
        for (const childExpr of filterExpr.operands) {
          tracks = await applyFilterExpr(
            clientContext,
            childExpr,
            tracks,
            negate
          );
        }
      } else if (filterExpr.combinerType === Filter.FilterCombinerType.OR) {
        let subTracks = [] as SpotifyApi.TrackObjectFull[];
        for (const childExpr of filterExpr.operands) {
          subTracks = subTracks.concat(
            await applyFilterExpr(clientContext, childExpr, tracks, negate)
          );
        }
        tracks = uniqueTracks(subTracks);
      }
      break;
  }
  return tracks;
}

async function getClientContext(token: string) {
  const clientData = {
    clientId: keys.clientId ? keys.clientId : "",
    clientSecret: keys.clientSecret ? keys.clientSecret : "",
  };

  const service = new SpotifyService(clientData);
  service.storeUser({
    username: "musicLover",
    token,
  });
  await service.init();
  const userdata = await getUserProfile(service);
  const user = service.retrieveUser();
  user.id = userdata?.id;
  user.username = userdata?.display_name;
  const devices = await getDevices(service);
  let deviceId;
  if (devices && devices.devices.length > 0) {
    const activeDevice =
      devices.devices.find((device) => device.is_active) ?? devices.devices[0];
    deviceId = activeDevice.id;
  }

  return {
    deviceId,
    service,
  } as IClientContext;
}

type SortTracksArgs = {
  // List of tracks to sort
  trackList: SpotifyApi.TrackObjectFull[];
  // sort criteria
  description?: string;
  // default: false
  descending?: boolean;
};

const translator = createProgramTranslator(model, schemaText);

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

function chalkStatus(status: SpotifyApi.CurrentPlaybackResponse) {
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

async function handleCall(
  func: string,
  args: unknown[],
  clientContext: IClientContext
): Promise<unknown> {
  let result: SpotifyApi.TrackObjectFull[] | undefined = undefined;
  switch (func) {
    case "getLastTrackList": {
      if (clientContext) {
        result = clientContext.lastTrackList;
      }
      break;
    }
    case "controlPlayback" : {
      const action = args[0] as string;

      const actionHandlers: { [key:string] : (clientContext: IClientContext) => Promise<void> } = {
        pause : pauseHandler,
        next : nextHandler,
        previous : previousHandler,
        shuffle: shuffleHandler
      };

      await actionHandlers[action](clientContext);
      break;
    }
    case "play": {
      const input = args[0] as SpotifyApi.TrackObjectFull[];

      if (input && input.length > 0) {
        let count = 1;
        let offset = 0;
        let options = args[1] as PlayTracksOptions;
        if (options) {
          if (options.count !== undefined) {
            count = options.count;
          }
          if (options.offset !== undefined) {
            offset = options.offset;
          }
        }
        if (offset < 0) {
          offset = input.length + offset;
        }
        const tracks = input.slice(offset, offset + count);
        const uris = tracks.map((track) => track.uri);
        console.log(chalk.cyanBright("Playing..."));
        if (tracks.length > 1) {
          printTrackNames(tracks, clientContext);
        } else {
          printTrackNames(tracks);
        }
        if (clientContext.deviceId) {
          await play(clientContext.service, clientContext.deviceId, uris);
        }
      } else if (clientContext.deviceId) {
        await play(clientContext.service, clientContext.deviceId);
      }
      break;
    }
    case "printTracks": {
      const input = args[0] as SpotifyApi.TrackObjectFull[];
      if (input) {
        printTrackNames(input, clientContext);
      }
      break;
    }
    case "searchTracks": {
      const queryString = args[0] as string;
      const query: SpotifyApi.SearchForItemParameterObject = {
        q: queryString,
        type: "track",
        limit: 50,
        offset: 0,
      };
      const data = await search(query, clientContext.service);
      if (data && data.tracks) {
        result = data.tracks.items;
        1;
      }
      break;
    }
    case "getFavorites": {
      const options = args[0] as GetFavoritesOptions;
      let count = limitMax;
      if (options && options.count !== undefined) {
        count = options.count;
      }
      // TODO: use favorites term
      if (options && options.favoritesTerm !== undefined) {
        const tops = await getTopK(clientContext.service, count);
        if (tops) {
          result = tops.map((pto) => pto.track!);
        }
      } else {
        const wrappedTracks = await getKRecent(clientContext.service, count);
        if (wrappedTracks) {
          result = wrappedTracks.map((obj) => obj.track);
        }
      }
      break;
    }
    case "mergeTrackLists": {
      const trackLists = args as SpotifyApi.TrackObjectFull[][];
      result = trackLists.flat();
      break;
    }
    case "filterTracks": {
      const trackList = args[0] as SpotifyApi.TrackObjectFull[];
      const filterArgs = args[1] as FilterTracksArgs;
      // TODO: add filter validation to overall instance validation
      const parseResult = Filter.parseFilter(filterArgs.filter);
      if (parseResult.ast) {
        if (trackList) {
          result = await applyFilterExpr(
            clientContext,
            parseResult.ast,
            trackList as SpotifyApi.TrackObjectFull[],
            filterArgs.negate
          );
        }
      } else {
        console.log(parseResult.diagnostics);
      }
      break;
    }
    case "status": {
      const status = await getPlaybackState(clientContext.service);
      if (status) {
        chalkStatus(status);
      } else {
        console.log("could not get status");
      }
      break;
    }
    case "sortTracks": {
      const sortArgs = args[0] as SortTracksArgs;
      if (sortArgs.trackList) {
        const input = sortArgs.trackList as SpotifyApi.TrackObjectFull[];
        if (sortArgs.descending) {
          result = input.slice().sort((a, b) => b.name.localeCompare(a.name));
        } else {
          result = input.slice().sort((a, b) => a.name.localeCompare(b.name));
        }
      }
      break;
    }
    case "mergeTrackLists":
    case "listPlaylists": {
      const playlists = await getPlaylists(clientContext.service);
      if (playlists) {
        for (const playlist of playlists.items) {
          console.log(chalk.magentaBright(`${playlist.name}`));
        }
      }
      break;
    }
    case "getPlaylistTracks": {
      const playlistName = args[0] as string;
      const playlists = await getPlaylists(clientContext.service);
      const playlist = playlists?.items.find(
        (playlist) => playlist.name === playlistName
      );
      const playlistResponse =
        playlist &&
        (await getPlaylistTracks(clientContext.service, playlist.id));
      result = playlistResponse?.items.map((item) => item.track!);
      break;
    }
    case "deletePlaylist": {
      const playlistName = args[0] as string;
      const playlists = await getPlaylists(clientContext.service);
      if (playlists) {
        for (const playlist of playlists.items) {
          if (playlist.name === playlistName) {
            await deletePlaylist(clientContext.service, playlist.id);
            console.log(
              chalk.magentaBright(`playlist ${playlistName} deleted`)
            );
            break;
          }
        }
      }
      break;
    }
    case "createPlaylist": {
      const input = args[0] as SpotifyApi.TrackObjectFull[];
      const name = args[1] as string;
      if (input && input.length > 0) {
        const uris = input.map((track) => (track ? track.uri : ""));
        await createPlaylist(
          clientContext.service,
          name,
          clientContext.service.retrieveUser().id!,
          uris,
          name
        );
        console.log(`playlist ${name} created with tracks:`);
        printTrackNames(input, clientContext);
      } else {
        console.log(chalk.red("filter did not find any tracks"));
      }
      break;
    }
    case "setVolume": {
      const setVolArgs = args[0] as SetVolumeArgs;
      if (setVolArgs.newVolumeLevel) {
        if (setVolArgs.newVolumeLevel > 50) {
          setVolArgs.newVolumeLevel = 50;
        }
        console.log(
          chalk.yellowBright(
            `setting volume to ${setVolArgs.newVolumeLevel} ...`
          )
        );
        await setVolume(clientContext.service, setVolArgs.newVolumeLevel);
      } else if (setVolArgs.volumeChangeAmount) {
        const playback = await getPlaybackState(clientContext.service);
        if (playback && playback.device) {
          const volpct = playback.device.volume_percent || 50;
          let nv = Math.floor(
            (1.0 + setVolArgs.volumeChangeAmount / 100.0) * volpct
          );
          if (nv > 80) {
            nv = 80;
          }
          console.log(chalk.yellowBright(`setting volume to ${nv} ...`));
          await setVolume(clientContext.service, nv);
        }
      }
      break;
    }
    case "nonMusicQuestion": {
      const text = args[0] as string;
      const ret = await model.complete(text);
      if (ret.success) {
        console.log(ret.data);
      }
      break;
    }
    case "unknownAction": {
      const text = args[0] as string;
      console.log(`Text not understood in this context: ${text}`);
      break;
    }
  }
  return result;
}

const spotifyConnect = true;

// Process requests interactively or from the input file specified on the command line
async function musicApp() {
  const authz = new Authzor();
  authz.authorize(spotifyConnect, async (token) => {
    let context: IClientContext | undefined = undefined;
    if (token) {
      context = await getClientContext(token);
    } else {
      console.log(
        chalk.yellow(
          "SPOTIFY_APP_CLI not set, no Spotify connection: showing plans only"
        )
      );
    }
    processRequests("🎵> ", process.argv[2], async (request) => {
      const localResult = localParser(request);
      let program: Program | undefined = undefined;
      if (localResult) {
        program = JSON.parse(localResult) as Program;
      } else {
        const response = await translator.translate(request);
        if (!response.success) {
          console.log(response.message);
          return;
        }
        program = response.data;
      }
      if (program !== undefined) {
        chalkPlan(program);
        console.log(getData(createModuleTextFromProgram(program)));
        if (context !== undefined) {
          const result = await evaluateJsonProgram(
            program,
            async (func, args) => {
              return await handleCall(func, args, context!);
            }
          );
          if (result !== undefined) {
            if (Array.isArray(result)) {
              const trackList = result as SpotifyApi.TrackObjectFull[];
              printTrackNames(trackList, context);
              context.lastTrackList = trackList;
            }
          }
        }
      }
    });
  });
}

musicApp();
