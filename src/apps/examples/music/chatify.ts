import fs from 'fs';
import path from 'path';
import { Authzor } from './authz';
import chalk from 'chalk';

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

/*
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
*/

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

const planOnly = true;
async function handleResult(
    plan: SpotifyActions,
    clientContext: IClientContext
) {
    chalkPlan(plan);
    // only track list results for now
    const results = [] as SpotifyApi.TrackObjectFull[][];
    if (planOnly) {
        return;
    }
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
                const uris = input.slice(0, count).map((track) => track.uri);
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
                printTrackNames(input);
                break;
            }
            case 'searchTracks': {
                const query: SpotifyApi.SearchForItemParameterObject = {
                    q: action.query,
                    type: 'track',
                    limit: 10,
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
                /* let input = results[i - 1];
                if (
                    action.inputFromAction !== undefined &&
                    action.inputFromAction !== i - 1
                ) {
                    input = results[action.inputFromAction];
                }
                if (action.genre) {
                    process.stdout.write(
                        `fetching genre for ${input.length} tracks`
                    );
                    for (const track of input) {
                        process.stdout.write('.');
                        const wrapper = await getArtist(
                            clientContext.service,
                            track.album.artists[0].id
                        );
                        if (wrapper) {
                            let hit = wrapper.artists[0].genres.includes(
                                action.genre
                            );
                            if (action.negate) {
                                hit = !hit;
                            }
                            if (hit) {
                                results[i].push(track);
                            }
                        }
                    }
                    process.stdout.write('\n');
                } else if (action.description) {
                    const indicesStr = await llmFilter(
                        action.description,
                        input
                    );
                    if (indicesStr) {
                        const indices = JSON.parse(indicesStr) as number[];
                        for (const j of indices) {
                            results[i].push(input[j]);
                        }
                    }
                } */
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
                    // console.log(`new volume level ${action.newVolumeLevel}`);
                    if (action.newVolumeLevel > 50) {
                        action.newVolumeLevel = 50;
                    }
                    await setVolume(
                        clientContext.service,
                        action.newVolumeLevel
                    );
                } else if (action.volumeChangeAmount) {
                    // get current volume and change it
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
