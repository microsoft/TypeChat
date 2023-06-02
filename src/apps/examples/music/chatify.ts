import fs from 'fs';
import path from 'path';
import { Authzor } from './authz';
import chalk from 'chalk';
import * as Filter from './trackFilter';

import {
    runTests,
    runTestsInteractive,
    IPromptContext,
    llmComplete,
} from '../../../lib';
import { SpotifyActions } from './chatifyActionsSchema';
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
    getArtist,
    getPlaybackState,
} from './endpoints';
import { SpotifyService, User } from './service';
const schemaFilename = 'chatifyActionsSchema.ts';

function todaysDate() {
    const d = new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
}

// open schema file containing ts definitions
const schemaText = fs.readFileSync(
    path.join(__dirname, schemaFilename),
    'utf8'
);

const typeInterp = 'the sequence of Spotify actions that implement the request';
const frame = `a bot is helping a person work with Spotify. today is ${todaysDate()}`;

const testPrompts = [
    'play Taylor Swift Shake It Off',
    'make a playlist of my tracks from the past week that have animals in their names and name the playlist animalTracks',
    'get my top ten tracks since January',
    'get my favorite 50 tracks from last year and make the non-classical ones into a playlist',
    'get my favorite 100 tracks from the last two months and keep only the ones by Bach',
    'get my favorite 200 tracks from the last five years and sort them by play count',
    'make it loud',
    'get my favorite 80 tracks from the last 8 months and create one playlist named class8 containing the classical tracks and another playlist containing the blues tracks',
];

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
        'The following is a list of JSON track objects, one per line.  Each track object has a name and an index:\n';
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        prompt += JSON.stringify({ name: track.name, index: i });
        prompt += '\n';
    }
    prompt += `A JSON array containing the index property of each track whose name has a word in it that matches the description ${description}:\n`;
    const ret = await llmComplete(prompt);
    return ret;
}

function chalkPlan(plan: SpotifyActions) {
    console.log(chalk.green('Plan Validated:'));
    const lines = JSON.stringify(plan, null, 4).split('\n');
    for (let i = 0; i < lines.length; i++) {
        lines[i] = lines[i].replace(
            /"([^"]+)"(:?)|([0-9]+)/g,
            (match, word, colon, integer) => {
                if (integer) {
                    return chalk.hex('#B5CEA8')(integer);
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
    if (userPrompt === 'play' || userPrompt === 'pause') {
        console.log(chalk.green('Instance parsed locally:'));
        return JSON.stringify({
            actions: [
                {
                    type: userPrompt,
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
        case 'constraint':
            switch (filterExpr.constraintType) {
                case Filter.FilterConstraintType.Genre: {
                    process.stdout.write(
                        `fetching genre for ${tracks.length} tracks`
                    );
                    const genre = filterExpr.constraintValue;
                    const results = [] as SpotifyApi.TrackObjectFull[];
                    for (const track of tracks) {
                        process.stdout.write('.');
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
                    process.stdout.write('\n');
                    tracks = results;
                    break;
                }
                case Filter.FilterConstraintType.Artist: {
                    process.stdout.write(
                        `fetching artist for ${tracks.length} tracks`
                    );
                    const results = [] as SpotifyApi.TrackObjectFull[];
                    for (const track of tracks) {
                        process.stdout.write('.');
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
                                        .includes(
                                            filterExpr.constraintValue.toLowerCase()
                                        )
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
                    process.stdout.write('\n');
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
                        if (
                            track.album.release_date.includes(
                                filterExpr.constraintValue
                            )
                        ) {
                            results.push(track);
                        }
                    }
                    tracks = results;
                    break;
                }
                case Filter.FilterConstraintType.Description: {
                    const results = [] as SpotifyApi.TrackObjectFull[];

                    const indicesStr = await llmFilter(
                        filterExpr.constraintValue,
                        tracks
                    );
                    if (indicesStr) {
                        const indices = JSON.parse(indicesStr) as number[];
                        for (const j of indices) {
                            results.push(tracks[j]);
                        }
                    }
                    tracks = results;
                    break;
                }
            }
            break;
        case 'combiner':
            if (filterExpr.combinerType === Filter.FilterCombinerType.AND) {
                for (const childExpr of filterExpr.operands) {
                    tracks = await applyFilterExpr(
                        clientContext,
                        childExpr,
                        tracks,
                        negate
                    );
                }
            } else if (
                filterExpr.combinerType === Filter.FilterCombinerType.OR
            ) {
                let subTracks = [] as SpotifyApi.TrackObjectFull[];
                for (const childExpr of filterExpr.operands) {
                    subTracks = subTracks.concat(
                        await applyFilterExpr(
                            clientContext,
                            childExpr,
                            tracks,
                            negate
                        )
                    );
                }
                tracks = uniqueTracks(subTracks);
            }
            break;
    }
    return tracks;
}

async function handleResult(
    plan: SpotifyActions,
    clientContext: IClientContext
) {
    chalkPlan(plan);
    const results = [] as SpotifyApi.TrackObjectFull[][];
    for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i];
        results[i] = [];
        switch (action.type) {
            case 'play': {
                if (clientContext.deviceId) {
                    await play(clientContext.service, clientContext.deviceId);
                }
                break;
            }
            case 'playInput': {
                let input = results[i - 1];
                if (
                    action.inputFromAction !== undefined &&
                    action.inputFromAction !== i - 1
                ) {
                    input = results[action.inputFromAction];
                }
                const count = action.count ? action.count : 1;
                const offset = action.offset ? action.offset : 0;
                const uris = input
                    .slice(offset, offset + count)
                    .map((track) => track.uri);
                if (clientContext.deviceId) {
                    await play(
                        clientContext.service,
                        clientContext.deviceId,
                        uris
                    );
                }
                break;
            }
            case 'listInput': {
                let input = results[i - 1];
                if (
                    action.inputFromAction !== undefined &&
                    action.inputFromAction !== i - 1
                ) {
                    input = results[action.inputFromAction];
                }
                const count = action.count ? action.count : input.length;
                const offset = action.offset ? action.offset : 0;
                printTrackNames(input.slice(offset, offset + count));
                break;
            }
            case 'searchTracks': {
                const query: SpotifyApi.SearchForItemParameterObject = {
                    q: action.query,
                    type: 'track',
                    limit: 50,
                    offset: 0,
                };
                const data = await search(query, clientContext.service);
                if (data && data.tracks) {
                    results[i] = data.tracks.items;
                }
                if (i === plan.actions.length - 1) {
                    printTrackNames(results[i]);
                }
                break;
            }
            case 'pause': {
                if (clientContext.deviceId) {
                    await pause(clientContext.service, clientContext.deviceId);
                }
                break;
            }
            case 'getRecentlyPlayed': {
                const count = action.count ? action.count : limitMax;
                if (action.favoritesTerm) {
                    const tops = await getTopK(clientContext.service, count);
                    if (tops) {
                        results[i] = tops.map((pto) => pto.track!);
                    }
                } else {
                    const wrappedTracks = await getKRecent(
                        clientContext.service,
                        count
                    );
                    if (wrappedTracks) {
                        results[i] = wrappedTracks.map((obj) => obj.track);
                    }
                }
                if (i === plan.actions.length - 1) {
                    printTrackNames(results[i]);
                }
                break;
            }
            case 'filterTracks': {
                // TODO: add filter validation to overall instance validation
                const result = Filter.parseFilter(action.filter);
                if (result.ast) {
                    let input = results[i - 1];
                    if (
                        action.inputFromAction !== undefined &&
                        action.inputFromAction !== i - 1
                    ) {
                        input = results[action.inputFromAction];
                    }
                    results[i] = await applyFilterExpr(
                        clientContext,
                        result.ast,
                        input,
                        action.negate
                    );
                } else {
                    console.log(result.diagnostics);
                }
                break;
            }
            case 'sortTracks':
                break;
            case 'createPlaylist': {
                let input = results[i - 1];
                if (
                    action.inputFromAction !== undefined &&
                    action.inputFromAction !== i - 1
                ) {
                    input = results[action.inputFromAction];
                }
                const uris = input.map((track) => track.uri);
                await createPlaylist(
                    clientContext.service,
                    action.name,
                    clientContext.service.retrieveUser().id!,
                    uris,
                    action.name
                );
                console.log(`playlist ${action.name} created with tracks:`);
                printTrackNames(input);
                break;
            }
            case 'setVolume': {
                if (action.newVolumeLevel) {
                    if (action.newVolumeLevel > 50) {
                        action.newVolumeLevel = 50;
                    }
                    console.log(
                        chalk.yellowBright(
                            `setting volume to ${action.newVolumeLevel} ...`
                        )
                    );
                    await setVolume(
                        clientContext.service,
                        action.newVolumeLevel
                    );
                } else if (action.volumeChangeAmount) {
                    const playback = await getPlaybackState(
                        clientContext.service
                    );
                    if (playback && playback.device) {
                        const volpct = playback.device.volume_percent || 50;
                        let nv = Math.floor(
                            (1.0 + action.volumeChangeAmount / 100.0) * volpct
                        );
                        if (nv > 80) {
                            nv = 80;
                        }
                        console.log(
                            chalk.yellowBright(`setting volume to ${nv} ...`)
                        );
                        await setVolume(clientContext.service, nv);
                    }
                }
                break;
            }
            case 'nonMusicQuestion': {
                const ret = await llmComplete(action.text);
                if (ret) {
                    console.log(ret);
                }
                break;
            }
            case 'unknown': {
                console.log(
                    `Text not understood in this context: ${action.text}`
                );
                break;
            }
        }
    }
}

async function getClientContext(token: string) {
    const clientData = {
        clientId: keys.clientId ? keys.clientId : '',
        clientSecret: keys.clientSecret ? keys.clientSecret : '',
    };

    const service = new SpotifyService(clientData);
    service.storeUser({
        username: 'musicLover',
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

// run the prompt list with no spotify interaction
export async function chatifyTests() {
    const promptContext: IPromptContext<SpotifyActions> = {
        typeInterp,
        frame,
        schemaText,
        typeName: 'SpotifyActions',
    };
    return await runTests(testPrompts, promptContext, 1);
}

async function interact() {
    const authz = new Authzor();
    authz.authorize(async (token) => {
        const clientContext = await getClientContext(token);
        const promptContext: IPromptContext<SpotifyActions> = {
            typeInterp,
            frame,
            schemaText,
            typeName: 'SpotifyActions',
            localParser,
            asyncHandleResult: (result: SpotifyActions) =>
                handleResult(result, clientContext),
        };
        const musicalNote = '\u{1F3B5} >';

        runTestsInteractive(promptContext, musicalNote);
    });
}
// read arguments from command line
const args = process.argv.slice(2);
// if there are no arguments, run the tests
if (args.length === 0) {
    chatifyTests();
} else {
    if (args.length === 1) {
        if (args[0] === '-i') {
            interact();
        }
    }
}
