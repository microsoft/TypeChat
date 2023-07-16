// This is a schema for writing programs that control a Spotify music player

export type Track = { name: string }
export type TrackList = Track[];

export type FavoritesTerm =
    | 'short_term' // last 4 weeks
    | 'medium_term' // last 6 months
    | 'long_term'; // several years

export type GetRecentlyPlayedOptions = {
    // if favoritesTerm is specified, get the user's top tracks over the specified time range
    favoritesTerm?: FavoritesTerm;
    // get count tracks; default is 50
    count?: number;
};

export type SetVolumeArgs = {
    // 0 is silent 100 is the loudest
    newVolumeLevel?: number;
    // volumeChangeAmount can be positive or negative; example: -5 makes the volume 5% more quiet
    volumeChangeAmount?: number;
};

export type PlayTracksOptions = {
    // number of tracks to play; default 1
    count?: number;
    // index of first track to play; default 0
    offset?: number;
}

export type PrintTracksOptions = {
    // number of tracks to print out; default input.length
    count?: number;
    // index of first track to list; default 0
    offset?: number;
}

export type FilterTracksArgs = {
    // a filter string, which has the following structure (written as a grammar)
    // filter -> (constraint combiner?)+
    // constraint -> artist:string | genre:string | year:year-range | description:string
    // combiner -> 'AND' | 'OR' (AND is the default and may be omitted)
    // the description constraint value describes any constraint not expressable as a combination of genre, artist and year constraints
    filter: string;
    // keep the tracks that do not match, instead of the tracks that match; default false
    negate?: boolean;
}

export type SortTracksArgs = {
    // List of tracks to sort
    trackList: TrackList;
    // sort criteria
    description?: string;
    // default: false
    descending?: boolean;
}

export type API = {
    // Get the tracks played most recently
    getRecentlyPlayed(options?: GetRecentlyPlayedOptions): TrackList;
    // Pause playing
    pause(): void;
    // Start playing
    play(): void;
    // List all playlists
    listPlaylists(): void;
    // Delete playlist 'name'
    deletePlaylist(name: string): void;
    // Set volume
    setVolume(args: SetVolumeArgs): void;
    // query argument is a Spotify search expression such as 'Rock Lobster' or 'te kanawa queen of night'
    // the structure of the search expression is keywords separated by spaces; all keywords must match
    searchTracks(query: string): TrackList;
    // play some or all items from the input list
    playTracks(trackList: TrackList, options?: PlayTracksOptions): void;
    // apply a filter to match tracks; result is the tracks that match the filter
    filterTracks(trackList: TrackList, args: FilterTracksArgs): TrackList;
    // sort tracks; default is sort by track name ascending
    sortTracks(args: SortTracksArgs): TrackList;
    // create a Spotify playlist from a list of tracks
    createPlaylist(trackList: TrackList, name: string): void;
    // merge multiple track lists
    mergeTrackLists(...lists: TrackList[]): TrackList;
    // Call this function for requests that weren't understood
    unknownAction(text: string): void;
    // Call this function if the user asks a non-music question, it is captured with this action; non-music, non-questions use UnknownAction
    nonMusicQuestion(text: string): void;
    // Call this function with the final result of the user request, if any
    finalResult(result: any): void;
}
