import process from 'process';

const keys = {
    clientId: process.env.SPOTIFY_APP_CLI,
    clientSecret: process.env.SPOTIFY_APP_CLISEC,
};

import { Authzor } from './authz';
import {
    getDevices,
    getTop,
    getUserProfile,
    getArtist,
    search,
    getKRecent,
    //    pause,
} from './endpoints';

import { SpotifyService } from './service';

const main = async () => {
    const clientData = {
        clientId: keys.clientId ? keys.clientId : '',
        clientSecret: keys.clientSecret ? keys.clientSecret : '',
    };

    const service = new SpotifyService(clientData);
    await service.init();
    const query: SpotifyApi.SearchForItemParameterObject = {
        q: 'bach eine feste netherlands',
        type: 'track',
        limit: 10,
        offset: 0,
    };

    const data = await search(query, service);
    if (data) {
        if (data.tracks) {
            const track = data.tracks.items[0];
            console.log(track);

            const authz = new Authzor();
            authz.authorize(async (token) => {
                console.log(token);
                service.storeUser({
                    username: 'musicLover',
                    token,
                });

                const userdata = await getUserProfile(service);
                console.log(userdata);
                const user = service.retrieveUser();
                user.id = userdata?.id;
                user.username = userdata?.display_name;
                const devices = await getDevices(service);
                console.log(devices);
                const hist = await getKRecent(service, 100);
                if (hist) {
                    for (const item of hist) {
                        const localTime = new Date(
                            item.played_at
                        ).toLocaleString();
                        console.log(`${localTime}: ${item.track.name}`);
                    }
                }
                const tops = await getTop(service);
                if (tops) {
                    console.log(tops.limit);
                    console.log(tops.next);
                    for (const item of tops.items) {
                        const track = item.track;
                        if (track) {
                            console.log(
                                `${track.name}: ${track.album.artists[0].id}`
                            );
                            const wrapper = await getArtist(
                                service,
                                track.album.artists[0].id
                            );
                            if (wrapper) {
                                console.log(wrapper.artists[0].genres);
                                console.log(
                                    wrapper.artists[0].genres.includes(
                                        'boogie-woogie'
                                    )
                                );
                            }
                        }
                    }
                }
                if (devices) {
                    if (devices.devices.length > 0 && devices.devices[0].id) {
                        console.log(`playing ${track.name}`);
                        // await play(service, devices.devices[0].id, track);
                    }
                }
            });
        }
    }
};

main();
