// This is a schema for writing programs that control a Spotify music player

// A track list is simply an array of strings
export type TrackList = string[];

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
    // List of tracks to filter
    trackList: TrackList;
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

type API = {
    // Get the tracks played most recently
    getRecentlyPlayed(options?: GetRecentlyPlayedOptions): TrackList;
    // Pause playing
    pause(): void;
    // Start playing
    play(): void;
    // Set volume
    setVolume(args: SetVolumeArgs): void;
    // query argument is a Spotify search expression such as 'Rock Lobster' or 'te kanawa queen of night'
    // the structure of the search expression is keywords separated by spaces; all keywords must match
    searchTracks(query: string): TrackList;
    // play some or all items from the input list
    playTracks(trackList: TrackList, options?: PlayTracksOptions): void;
    // apply a filter to match tracks; result is the tracks that match the filter
    filterTracks(args: FilterTracksArgs): TrackList;
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

// A program consists of a sequence of expressions that are executed in order.
export type Program = {
    expressions: Expression[];
}

// An expression is a JSON value, a function call, or a reference to the result of a preceding expression.
// Function calls and result references may occur at any level of nesting.
export type Expression = JSONValue | FunctionCall | ResultReference;

// Represents a JSON value.
export type JSONValue = string | number | boolean | null | { [x: string]: Expression } | Expression[];

// Represents a call to one of the API functions. Function calls may be nested in JSON objects.
export type FunctionCall = {
    // Name of the API function called by this expression
    "@func": keyof API;
    // Arguments for the function
    "@args": Expression[];
};

// Represents a reference to the result of a preceding expression. Result references may be nested in JSON objects.
export type ResultReference = {
    // Index of the previous expression in the expressions array
    "@ref": number;
};
