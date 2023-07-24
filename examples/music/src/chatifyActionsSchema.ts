// This is a schema for writing programs that control a Spotify music player

type Track = { name: string };
type TrackList = Track[];
type Playlist = TrackList; 

export type API = {
    // play track list
    play(
        // track list to play
        trackList: TrackList,
        // start playing at this track index
        startIndex?: number,
        // play this many tracks
        count?: number
    ): void;
    // print a list of tracks
    printTracks(trackList: TrackList): void;
    // show now playing
    status(): void;
    // control playback
    // pause playback
    pause(): void;
    // next track
    next(): void;
    // previous track
    previous(): void;
    // turn shuffle on
    shuffleOn(): void;
    // turn shuffle off
    shuffleOff(): void;
    // resume playing
    resume(): void;
    // list availabe playback devices
    listDevices(): void;
    // select playback device by keyword
    selectDevice(keyword: string): void;
    // set volume
    setVolume(newVolumeLevel: number): void;
    // change volume
    changeVolume(volumeChangeAmount: number): void;
    // query is a Spotify search expression such as 'Rock Lobster' or 'te kanawa queen of night'
    searchTracks(query: string): TrackList;
    // return the last track list shown to the user
    // for example, if the user types "play the third one" the player plays the third track
    // from the last track list shown
    getLastTrackList(): TrackList;
    // list all playlists
    listPlaylists(): void;
    // get playlist by name
    getPlaylist(name: string): Playlist;
    // get album by name; if name is "", use the currently playing track
    getAlbum(name: string): TrackList;
    // Return a list of the user's favorite tracks
    getFavorites(count?: number): TrackList;
    // apply a filter to match tracks
    filterTracks(
        // track list to filter
        trackList: TrackList,
        // filter type is one of "genre", "artist", "name"; name does a fuzzy match on the track name
        // for example, filterType: "name", filter: "color" matches "Red Red Wine"
        filterType: "genre" | "artist" | "name",
        filter: string,
        negate?: boolean
    ): TrackList;
    // create a Spotify playlist from a list of tracks
    createPlaylist(trackList: TrackList, name: string): void;
    // Delete playlist given by playlist
    deletePlaylist(playlist: Playlist): void;
    // call this function for requests that weren't understood
    unknownAction(text: string): void;
    // call this function if the user asks a non-music question; non-music non-questions use UnknownAction
    nonMusicQuestion(text: string): void;
};
