import axios from 'axios';
import { SpotifyService } from './service';
import { serializeQuery } from './util';

export const limitMax = 50;

export async function search(
    query: SpotifyApi.SearchForItemParameterObject,
    service: SpotifyService
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveToken()}`,
        },
    };

    try {
        const spotifyResult = await axios.get(
            `https://api.spotify.com/v1/search${serializeQuery(query)}`,
            config
        );
        return spotifyResult.data as SpotifyApi.SearchResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function getTop(
    service: SpotifyService,
    limit = limitMax,
    offset = 0
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    let params = `limit=${limit}`;
    if (offset !== 0) {
        params += `&offset=${offset}`;
    }
    try {
        const spotifyResult = await axios.get(
            `https://api.spotify.com/v1/me/tracks?${params}`,
            config
        );

        return spotifyResult.data as SpotifyApi.PagingObject<SpotifyApi.PlaylistTrackObject>;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function getTopK(service: SpotifyService, k = limitMax) {
    if (k > limitMax) {
        const topTracks = [] as SpotifyApi.PlaylistTrackObject[];
        let offset = 0;
        while (k > 0) {
            let count = limitMax;
            if (k < count) {
                count = k;
            }
            const hist = await getTop(service, count, offset);
            if (hist && hist.items) {
                topTracks.push(...hist.items);
            }
            k -= limitMax;
            offset += limitMax;
        }
        return topTracks;
    } else {
        const hist = await getTop(service, k);
        if (hist && hist.items) {
            return hist.items;
        }
    }
    return undefined;
}

export async function getArtist(service: SpotifyService, id: string) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    const url = `https://api.spotify.com/v1/artists?ids=${encodeURIComponent(
        id
    )}`;

    try {
        const spotifyResult = await axios.get(url, config);

        return spotifyResult.data as SpotifyApi.MultipleArtistsResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function getHistory(
    service: SpotifyService,
    limit = limitMax,
    offset = 0
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    let params = `limit=${limit}`;
    if (offset > 0) {
        params += `&offset=${offset}`;
    }
    const url = `https://api.spotify.com/v1/me/player/recently-played?${params}`;
    console.log(url);
    // params += `&after=${Date.parse('2023-01-01T00:00:00.000Z')}`;
    // params += `&before=${Date.now()}`;
    try {
        const spotifyResult = await axios.get(url, config);

        return spotifyResult.data as SpotifyApi.UsersRecentlyPlayedTracksResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function getKRecent(service: SpotifyService, k = 100) {
    if (k > limitMax) {
        const playHistory = [] as SpotifyApi.PlayHistoryObject[];
        let offset = 0;
        while (k > 0) {
            let count = limitMax;
            if (k < count) {
                count = k;
            }
            const hist = await getHistory(service, count, offset);
            if (hist && hist.items) {
                playHistory.push(...hist.items);
            }
            k -= limitMax;
            offset += limitMax;
        }
        return playHistory;
    } else {
        const hist = await getHistory(service, k);
        if (hist && hist.items) {
            return hist.items;
        }
    }
    return undefined;
}

export async function getUserProfile(service: SpotifyService) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    try {
        const spotifyResult = await axios.get(
            'https://api.spotify.com/v1/me',
            config
        );

        return spotifyResult.data as SpotifyApi.UserProfileResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function getPlaybackState(service: SpotifyService) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const spotifyResult = await axios.get(
            'https://api.spotify.com/v1/me/player',
            config
        );

        return spotifyResult.data as SpotifyApi.CurrentPlaybackResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function play(
    service: SpotifyService,
    deviceId: string,
    uris?: string[]
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    const smallTrack: SpotifyApi.PlayParameterObject = {};
    if (uris) {
        smallTrack.uris = uris;
    }
    try {
        const spotifyResult = await axios.put(
            `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
            smallTrack,
            config
        );

        return spotifyResult.data;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function getDevices(service: SpotifyService) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    try {
        const spotifyResult = await axios.get(
            'https://api.spotify.com/v1/me/player/devices',
            config
        );

        return spotifyResult.data as SpotifyApi.UserDevicesResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function pause(service: SpotifyService, deviceId: string) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    try {
        const spotifyResult = await axios.put(
            `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
            {},
            config
        );

        return spotifyResult.data;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
}

export async function getPlaylists(service: SpotifyService) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const getUri = 'https://api.spotify.com/v1/me/playlists';
        const spotifyResult = await axios.get(getUri, config);

        return spotifyResult.data as SpotifyApi.ListOfCurrentUsersPlaylistsResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function deletePlaylist(
    service: SpotifyService,
    playlistId: string
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const deleteUri = `https://api.spotify.com/v1/playlists/${encodeURIComponent(
            playlistId
        )}/followers`;
        const spotifyResult = await axios.delete(deleteUri, config);

        return spotifyResult.data as SpotifyApi.UnfollowPlaylistResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function createPlaylist(
    service: SpotifyService,
    name: string,
    userId: string,
    uris: string[],
    description = ''
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const createUri = `https://api.spotify.com/v1/users/${userId}/playlists`;
        const spotifyResult = await axios.post(
            createUri,
            { name, public: false, description },
            config
        );

        const playlistResponse =
            spotifyResult.data as SpotifyApi.CreatePlaylistResponse;
        const addTracksResult = await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistResponse.id}/tracks`,
            { uris },
            config
        );
        return addTracksResult.data as SpotifyApi.AddTracksToPlaylistResponse;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
    return undefined;
}

export async function setVolume(service: SpotifyService, amt = limitMax) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };

    try {
        const spotifyResult = await axios.put(
            `https://api.spotify.com/v1/me/player/volume?volume_percent=${amt}`,
            {},
            config
        );

        return spotifyResult.data;
    } catch (e) {
        if (e instanceof axios.AxiosError) {
            console.log(e.message);
        } else {
            throw e;
        }
    }
}
