import { SpotifyService } from "./service";

// for now, no paging of track lists; later add offset and count
export interface ITrackCollection {
    getTrackCount(): number;
    getTracks(service: SpotifyService): Promise<SpotifyApi.TrackObjectFull[]>;
    getContext(): string | undefined;
    getPlaylist(): SpotifyApi.PlaylistObjectSimplified | undefined;
}

export class TrackCollection implements ITrackCollection {
    contextUri: string | undefined = undefined;

    constructor(public tracks: SpotifyApi.TrackObjectFull[], public trackCount:number) {

    }
    getContext() {
        return this.contextUri;
    }

    async getTracks(
        service: SpotifyService
    ) {
        return this.tracks;
    }

    getTrackCount(): number {
        return this.trackCount;
    }

    getPlaylist(): SpotifyApi.PlaylistObjectSimplified | undefined {
        return undefined;
    }
}

export class PlaylistTrackCollection extends TrackCollection {
    constructor(public playlist: SpotifyApi.PlaylistObjectSimplified, 
        tracks: SpotifyApi.TrackObjectFull[]) {
        super(tracks,0);
        this.contextUri = playlist.uri;
        this.trackCount = tracks.length;
    }

    getPlaylist() {
        return this.playlist;
    }
}

export class AlbumTrackCollection extends TrackCollection  {
    constructor(public album: SpotifyApi.AlbumObjectSimplified,
        tracks: SpotifyApi.TrackObjectSimplified[] 
    ) {
        super([], 0);
        this.contextUri = album.uri;
        this.trackCount = tracks.length;
        this.tracks = tracks.map((albumItem) => {
            const fullTrack = albumItem as SpotifyApi.TrackObjectFull;
            fullTrack.album = album;
            return fullTrack;
        });
    }
}
