import fs from "fs";
import path from "path";
import { Authzor } from "./authz";
import chalk from "chalk";
import dotenv from "dotenv";
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
import {
    AlbumTrackCollection,
    ITrackCollection,
    PlaylistTrackCollection,
    TrackCollection,
} from "./trackCollections";
import { applyFilterExpr } from "./trackFilter";
import {
    play,
    getUserProfile,
    getDevices,
    search,
    setVolume,
    limitMax,
    getTopK,
    createPlaylist,
    deletePlaylist,
    getPlaylists,
    getPlaybackState,
    getPlaylistTracks,
    pause,
    next,
    previous,
    shuffle,
    getAlbumTracks,
    getQueue,
} from "./endpoints";
import { listAvailableDevices, printStatus, selectDevice } from "./playback";
import { SpotifyService, User } from "./service";
import { localParser } from "./localParser";

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
    lastTrackOffset: number;
    lastTrackCount: number;
}

async function printTrackNames(
    tracks: SpotifyApi.TrackObjectFull[],
    context: IClientContext
) {
    let count = 1;
    for (const track of tracks) {
        let prefix = "";
        if (context && (tracks.length > 1)) {
            prefix = `T${count}: `;
        }
        console.log(chalk.cyanBright(`${prefix}${track.name}`));
        const artists =
            "   Artists: " +
            track.artists.map((artist) => chalk.green(artist.name)).join(", ");
        console.log(artists);
        console.log("   Album: " + chalk.rgb(181, 101, 29)(track.album.name));

        count++;
    }
    if (tracks.length > 1) {
        context.lastTrackList = tracks;
        context.lastTrackOffset = 0;
        context.lastTrackCount = count;
    }
}

async function printPlaylist(
    playlist: SpotifyApi.PlaylistObjectSimplified,
    fetchedTracks: SpotifyApi.TrackObjectFull[],
    context: IClientContext
) {
    console.log(chalk.cyanBright(`Starting playlist --> ${playlist.name}`));
    console.log(
        chalk.cyanBright(`--------------------------------------------`)
    );
    const playlistTotalTracks = playlist.tracks.total;
    console.log(
        chalk.cyan(
            `First ${fetchedTracks.length} out of ${playlistTotalTracks} songs in list`
        )
    );
    fetchedTracks.forEach((track, i) => {
        console.log(
            chalk.cyan(
                ` ${i < 99 ? (i < 9 ? "  " : " ") : ""}${i + 1} - ${track.name}`
            )
        );
    });
    console.log(
        chalk.cyanBright(`--------------------------------------------`)
    );
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
            devices.devices.find((device) => device.is_active) ??
            devices.devices[0];
        deviceId = activeDevice.id;
    }

    return {
        deviceId,
        service,
    } as IClientContext;
}

const translator = createProgramTranslator(model, schemaText);

async function handleCall(
    func: string,
    args: unknown[],
    clientContext: IClientContext
): Promise<unknown> {
    let result: ITrackCollection | undefined = undefined;
    switch (func) {
        case "play": {
            const input = args[0] as ITrackCollection;
            if (input && input.getTrackCount() > 0) {
                let startIndex = args[1] ? +args[1] : 0;
                const count = args[2] ? +args[2] : 1;
                if (startIndex < 0) {
                    startIndex = input.getTrackCount() + startIndex;
                }
                const fetchedTracks = await input.getTracks(
                    clientContext.service
                );
                const contextUri = input.getContext();
                const tracks = fetchedTracks!.slice(
                    startIndex,
                    startIndex + count
                );
                const uris = tracks.map((track) => track.uri);
                console.log(chalk.cyanBright("Playing..."));
                printTrackNames(tracks, clientContext);
                if (clientContext.deviceId) {
                    await play(
                        clientContext.service,
                        clientContext.deviceId,
                        uris,
                        contextUri
                    );
                }
            } else if (clientContext.deviceId) {
                await play(clientContext.service, clientContext.deviceId);
            }
            break;
        }
        case "printTracks": {
            const input = args[0] as ITrackCollection;
            if (input) {
                const fetchedTracks = await input.getTracks(
                    clientContext.service
                );
                const playlist = input.getPlaylist();
                if (playlist) {
                    printPlaylist(playlist, fetchedTracks, clientContext);
                } else {
                    printTrackNames(fetchedTracks, clientContext);
                }
            }
            break;
        }
        case "status": {
            await printStatus(clientContext);
            break;
        }
        case "getQueue": {
            const currentQueue = await getQueue(clientContext.service);
            if (currentQueue) {
                // not yet supporting episidoes
                const filtered = currentQueue.queue.filter((item) => item.type === "track") as SpotifyApi.TrackObjectFull[];
                console.log(chalk.magentaBright("Current Queue:"));
                console.log(
                    chalk.cyanBright(`--------------------------------------------`)
                );
                await printTrackNames(filtered, clientContext);
                console.log(
                    chalk.cyanBright(`--------------------------------------------`)
                );
                await printStatus(clientContext);
            }
            break;
        }
        case "pause": {
            if (clientContext.deviceId) {
                await pause(clientContext.service, clientContext.deviceId);
                await printStatus(clientContext);
            }
            break;
        }
        case "next": {
            if (clientContext.deviceId) {
                await next(clientContext.service, clientContext.deviceId);
                await printStatus(clientContext);
            }
            break;
        }
        case "previous": {
            if (clientContext.deviceId) {
                await previous(clientContext.service, clientContext.deviceId);
                await printStatus(clientContext);
            }
            break;
        }
        case "shuffleOn": {
            if (clientContext.deviceId) {
                await shuffle(
                    clientContext.service,
                    clientContext.deviceId,
                    true
                );
                await printStatus(clientContext);
            }
            break;
        }
        case "shuffleOff": {
            if (clientContext.deviceId) {
                await shuffle(
                    clientContext.service,
                    clientContext.deviceId,
                    false
                );
                await printStatus(clientContext);
            }
            break;
        }
        case "resume": {
            if (clientContext.deviceId) {
                await play(clientContext.service, clientContext.deviceId);
                await printStatus(clientContext);
            }
            break;
        }
        case "listDevices": {
            await listAvailableDevices(clientContext);
            break;
        }
        case "selectDevice": {
            if (clientContext.deviceId) {
                const keyword = args[0] as string;
                await selectDevice(keyword, clientContext);
            }
            break;
        }
        case "setVolume": {
            const newVolumeLevel = args[0] as number;
            console.log(
                chalk.yellowBright(`setting volume to ${newVolumeLevel} ...`)
            );
            await setVolume(clientContext.service, newVolumeLevel);
            break;
        }
        case "changeVolume": {
            const volumeChangeAmount = args[0] as number;
            const playback = await getPlaybackState(clientContext.service);
            if (playback && playback.device) {
                const volpct = playback.device.volume_percent || 50;
                let nv = Math.floor(
                    (1.0 + volumeChangeAmount / 100.0) * volpct
                );
                if (nv > 100) {
                    nv = 100;
                }
                console.log(chalk.yellowBright(`setting volume to ${nv} ...`));
                await setVolume(clientContext.service, nv);
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
                result = new TrackCollection(
                    data.tracks.items,
                    data.tracks.items.length
                );
                1;
            }
            break;
        }
        case "getLastTrackList": {
            if (clientContext && clientContext.lastTrackList) {
                result = new TrackCollection(
                    clientContext.lastTrackList,
                    clientContext.lastTrackCount
                );
            }
            break;
        }
        case "listPlaylists": {
            const playlists = await getPlaylists(clientContext.service);
            if (playlists) {
                for (const playlist of playlists.items) {
                    console.log(chalk.magentaBright(`${playlist.name}`));
                }
            }
            break;
        }
        case "getPlaylist": {
            const playlistName = args[0] as string;
            const playlists = await getPlaylists(clientContext.service);
            const playlist = playlists?.items.find((playlist) => {
                return playlist.name
                    .toLowerCase()
                    .includes(playlistName.toLowerCase());
            });
            if (playlist) {
                const playlistResponse = await getPlaylistTracks(
                    clientContext.service,
                    playlist.id
                );
                // TODO: add paging
                if (playlistResponse) {
                    result = new PlaylistTrackCollection(
                        playlist,
                        playlistResponse.items.map((item) => item.track!)
                    );
                }
            }
            break;
        }
        case "getAlbum": {
            const name = args[0] as string;
            if (name.length > 0) {
                // search for album by name and load it as track collection
            } else {
                // get album of current playing track and load it as track collection
                const status = await getPlaybackState(clientContext.service);
                if (status && status.item && status.item.type === "track") {
                    const track = status.item as SpotifyApi.TrackObjectFull;
                    const album = track.album;
                    // TODO: add paging
                    const getTracksResponse = await getAlbumTracks(
                        clientContext.service,
                        album.id
                    );
                    if (status.is_playing) {
                        await play(
                            clientContext.service,
                            clientContext.deviceId!,
                            [],
                            album.uri,
                            status.item.track_number - 1,
                            status.progress_ms ? status.progress_ms : 0
                        );
                    }
                    if (getTracksResponse) {
                        result = new AlbumTrackCollection(
                            album,
                            getTracksResponse.items
                        );
                    }
                }
            }
            break;
        }
        case "getFavorites": {
            const countOption = args[0] as number;
            let count = limitMax;
            if (countOption !== undefined) {
                count = countOption;
            }
            const tops = await getTopK(clientContext.service, count);
            if (tops) {
                const tracks = tops.map((pto) => pto.track!);
                result = new TrackCollection(tracks, tracks.length);
            }
            break;
        }
        case "filterTracks": {
            const trackCollection = args[0] as ITrackCollection;
            let filterType = args[1] as string;
            const filterText = args[2] as string;
            const negate = args[3] as boolean;
            // TODO: add filter validation to overall instance validation
            if (filterType === "name") {
                filterType = "description";
            }
            const filter = filterType + ":" + filterText;
            const parseResult = Filter.parseFilter(filter);
            if (parseResult.ast) {
                const trackList = await trackCollection.getTracks(
                    clientContext.service
                );
                if (trackList) {
                    const tracks = await applyFilterExpr(
                        clientContext,
                        model,
                        parseResult.ast,
                        trackList,
                        negate
                    );
                    result = new TrackCollection(tracks, tracks.length);
                }
            } else {
                console.log(parseResult.diagnostics);
            }
            break;
        }
        case "createPlaylist": {
            const input = args[0] as ITrackCollection;
            const name = args[1] as string;
            const trackList = await input.getTracks(clientContext.service);
            if (input && trackList.length > 0) {
                const uris = trackList.map((track) => (track ? track.uri : ""));
                await createPlaylist(
                    clientContext.service,
                    name,
                    clientContext.service.retrieveUser().id!,
                    uris,
                    name
                );
                console.log(`playlist ${name} created with tracks:`);
                printTrackNames(trackList, clientContext);
            } else {
                console.log(chalk.red("no input tracks for createPlaylist"));
            }
            break;
        }
        case "deletePlaylist": {
            const playlistCollection = args[0] as PlaylistTrackCollection;
            if (playlistCollection) {
                const playlist = playlistCollection.getPlaylist();
                await deletePlaylist(
                    clientContext.service,
                    playlist.id
                );
                console.log(
                    chalk.magentaBright(`playlist ${playlist.name} deleted`)
                );
                break;
            }

            break;
        }
        case "unknownAction": {
            const text = args[0] as string;
            console.log(`Text not understood in this context: ${text}`);
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
    }
    return result;
}

// set this to false to just look at llm generation without Spotify connection
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
                    "Spotify connection not active: showing plans only"
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
                        const collection = result as ITrackCollection;
                        const trackList = await collection.getTracks(
                            context.service
                        );
                        if (trackList) {
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
