import keys from '../keys.json';
import {
    Query,
    getDevices,
    getUserProfile,
    play,
    search,
    //    pause,
    //    TrackInfo,
} from './endpoints';
import {SpotifyService} from './service';
import {SearchContent} from 'spotify-types';

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
    const track = data.tracks.items[0];
    console.log(track);

    service.storeUser({
        username: 'steveluc',
        token: 'BQD6mhgbXbsYhppUQpQJ9DlLGaxVg0IyWrsd2yx1bfrd6gjjvP8whZmKiwLstgBgvbpR3pmpyShgRVyk9Vxmq0GchGFKeG4Uk56ZTF9fvPuQr46OY_4ofuWIL9kc0DGCwaAUpq-P7fnVxIoZhMW9tcnSezkgfa5yD-VKfY8p5nmuUzpNeASCLu5ckpDXIj7bPBI3TfVr_riz_tmkplutYUniWGGp_3zkT1yWJ6AlN44XL77_vwPxzGipoOCg_YwHWXZO7X8_Eta9PuMyh7Gy_1KLl49hv62QFhv5AfIyjwSmXr8',
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
