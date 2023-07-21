import axios from 'axios';
import { SpotifyService } from './service';

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

    const searchUrl = getUrlWithParams("https://api.spotify.com/v1/search", query);
    try {
        const spotifyResult = await axios.get(searchUrl, config);
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

    const tracksUrl = getUrlWithParams("https://api.spotify.com/v1/me/tracks", { limit, offset });
    try {
        const spotifyResult = await axios.get(tracksUrl, config);

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

    const artistsUrl = getUrlWithParams("https://api.spotify.com/v1/artists", { ids: id });
    try {
        const spotifyResult = await axios.get(artistsUrl, config);

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

    const recentlyPlayedUrl = getUrlWithParams("https://api.spotify.com/v1/me/player/recently-played", {
        limit,
        offset
    });
    console.log(recentlyPlayedUrl);
    // params += `&after=${Date.parse('2023-01-01T00:00:00.000Z')}`;
    // params += `&before=${Date.now()}`;
    try {
        const spotifyResult = await axios.get(recentlyPlayedUrl, config);

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
    const playUrl = getUrlWithParams("https://api.spotify.com/v1/me/player/play", { device_id: deviceId });
    try {
        const spotifyResult = await axios.put(
            playUrl,
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

    const pauseUrl = getUrlWithParams("https://api.spotify.com/v1/me/player/pause", { device_id: deviceId });
    try {
        const spotifyResult = await axios.put(
            pauseUrl,
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

export async function next(
    service: SpotifyService,
    deviceId: string,
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const spotifyResult = await axios.post(
            `https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`,
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
    return undefined;
}

export async function previous(
    service: SpotifyService,
    deviceId: string,
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const spotifyResult = await axios.post(
            `https://api.spotify.com/v1/me/player/previous?device_id=${deviceId}`,
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
    return undefined;
}

export async function shuffle(
    service: SpotifyService,
    deviceId: string,
    newShuffleState: boolean
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const spotifyResult = await axios.put(
            `https://api.spotify.com/v1/me/player/shuffle?state=${newShuffleState}&device_id=${deviceId}`,
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
    return undefined;
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

export async function getPlaylistTracks(
    service: SpotifyService,
    playlistId: string
) {
    const config = {
        headers: {
            Authorization: `Bearer ${service.retrieveUser().token}`,
        },
    };
    try {
        const getUri = `https://api.spotify.com/v1/playlists/${encodeURIComponent(
            playlistId
        )}/tracks`;
        const spotifyResult = await axios.get(getUri, config);

        return spotifyResult.data as SpotifyApi.PlaylistTrackResponse;
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

    const volumeUrl = getUrlWithParams("https://api.spotify.com/v1/me/player/volume?volume_percent", {
        volume_percent: amt
    });
    try {
        const spotifyResult = await axios.put(
            volumeUrl,
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

function getUrlWithParams(urlString: string, queryParams: Record<string, any>) {
    const params = new URLSearchParams(queryParams);
    const url = new URL(urlString);
    url.search = params.toString();
    return url.toString();
}
