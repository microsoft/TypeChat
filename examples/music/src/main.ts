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
  getData
} from "typechat";
import dotenv from "dotenv";

import {
  FilterTracksArgs,
  GetRecentlyPlayedOptions,
  PlayTracksOptions,
  SetVolumeArgs,
  SortTracksArgs,
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
  pause,
  // getArtist,
  createPlaylist,
  deletePlaylist,
  getPlaylists,
  getArtist,
  getPlaybackState,
} from "./endpoints";
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

interface IClientContext {
  service: SpotifyService;
  deviceId?: string;
  user: User;
}

function printTrackNames(tracks: SpotifyApi.TrackObjectFull[]) {
  const map = new Map<string, string>();
  for (const track of tracks) {
    map.set(track.name, track.name);
  }
  for (const name of map.keys()) {
    console.log(chalk.cyanBright(name));
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
  if (userPrompt === "play" || userPrompt === "pause") {
    console.log(chalk.green("Instance parsed locally:"));
    return JSON.stringify({
      expressions: [
        {
          "@func": userPrompt,
          "@args": [],
        },
      ],
    });
  } else {
    // console.log(userPrompt);
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
          process.stdout.write(`fetching artist for ${tracks.length} tracks`);
          const results = [] as SpotifyApi.TrackObjectFull[];
          for (const track of tracks) {
            process.stdout.write(".");
            const wrapper = await getArtist(
              clientContext.service,
              track.album.artists[0].id
            );
            if (wrapper) {
              let hit = false;
              for (const artist of wrapper.artists) {
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
    for (const device of devices.devices) {
      if (device.is_active) {
        if (device.id) {
          deviceId = device.id;
        }
      }
    }
  }
  return {
    deviceId,
    service,
  } as IClientContext;
}

const musicalNote = "\u{1F3B5}";
const translator = createProgramTranslator(model, schemaText);

async function handleCall(
  func: string,
  args: unknown[],
  clientContext: IClientContext
): Promise<unknown> {
  let result: SpotifyApi.TrackObjectFull[] | undefined = undefined;
  switch (func) {
    case "play": {
      if (clientContext.deviceId) {
        await play(clientContext.service, clientContext.deviceId);
      }
      break;
    }
    case "pause": {
      if (clientContext.deviceId) {
        await pause(clientContext.service, clientContext.deviceId);
      }
      break;
    }
    case "playTracks": {
      const input = args[0] as SpotifyApi.TrackObjectFull[];
      if (input) {
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
        const tracks = input.slice(offset, offset + count);
        const uris = tracks.map((track) => track.uri);
        const names = tracks.map((track) => track.name);
        console.log(chalk.cyanBright("Playing..."));
        for (const name of names) {
          console.log(chalk.cyanBright(name));
        }
        if (clientContext.deviceId) {
          await play(clientContext.service, clientContext.deviceId, uris);
        }
      }
      break;
    }
    case "printTracks": {
      const input = args[0] as SpotifyApi.TrackObjectFull[];
      if (input) {
        printTrackNames(input);
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
1      }
      break;
    }
    case "getRecentlyPlayed": {
      const options = args[0] as GetRecentlyPlayedOptions;
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
        printTrackNames(input);
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

// Process requests interactively or from the input file specified on the command line
async function musicApp() {
  const authz = new Authzor();
  authz.authorize(async (token) => {
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
    processRequests(`${musicalNote}> `, process.argv[2], async (request) => {
      const localResult = localParser(request);
      let program: Program | undefined = undefined;
      if (localResult) {
         program = JSON.parse(localResult) as Program;
      } 
      else {
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
          await evaluateJsonProgram(program, async (func, args) => {
            return await handleCall(func, args, context!);
          });
        }
      }
    });
  });
}

musicApp();
