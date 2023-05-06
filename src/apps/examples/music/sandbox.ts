// TODO: REIVEW: we should use another mechanism for accessing config data and secrets.
// Commenting out the following import for now to allow build to proceed.
// import keys from '../keys.json';
// Fake keys follow to fix build break.
const keys = { clientId: 'foobar', clientSecret: 'IWontTell' };

import {
    Query,
    getDevices,
    getUserProfile,
    play,
    search,
    //    pause,
    //    TrackInfo,
} from './endpoints';

import { SpotifyService } from './service';
import { SearchContent } from 'spotify-types';

const main = async () => {
    const clientData = {
        clientId: keys.clientId,
        clientSecret: keys.clientSecret,
    };

    const service = new SpotifyService(clientData);
    await service.init();
    const query: Query = {
        q: 'Taylor Swift shake',
        type: ['track'],
        limit: 10,
        offset: 0,
    };

    const data: SearchContent = await search(query, service);
    if (!data.tracks) {
        throw new Error(`Query for "${query.q}" found no tracks`);
    }
    const track = data.tracks.items[0];
    console.log(track);

    service.storeUser({
        username: '',
        token: '',
    });

    const userdata = await getUserProfile(service);
    console.log(userdata);

    const devices = await getDevices(service);
    console.log(devices);
    const trackInfo = {
        uris: [track.uri],
    };
    await play(service, devices.devices[0].id, trackInfo);
};

main();
