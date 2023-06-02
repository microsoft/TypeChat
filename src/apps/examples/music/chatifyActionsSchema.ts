export interface ActionWithInput {
    // use results from action indexed by inputFromAction; default use results from previous action
    inputFromAction?: number;
}

export type FavoritesTerm =
    | 'short_term' // last 4 weeks
    | 'medium_term' // last 6 months
    | 'long_term'; // several years

// output: Track List
// get the tracks played most recently
export interface GetRecentlyPlayedAction {
    type: 'getRecentlyPlayed';
    // if favoritesTerm is specified, get the user's top tracks over the specified time range
    favoritesTerm?: FavoritesTerm;
    // get count tracks; default is 50
    count?: number;
}

export interface PauseAction {
    type: 'pause';
}

export interface PlayAction {
    type: 'play';
}

export interface VolumeAction {
    type: 'setVolume';
    // 0 is silent 100 is the loudest
    newVolumeLevel?: number;
    // volumeChangeAmount can be positive or negative; example: -5 makes the volume 5% more quiet
    volumeChangeAmount?: number;
}

// output: Track List
export interface SearchTracksAction {
    type: 'searchTracks';
    // a Spotify search expression such as 'Rock Lobster' or 'te kanawa queen of night'
    // the structure of the search expression is keywords separated by spaces; all keywords must match
    query: string;
}

// input: Track List
// play some or all items from the input list
export interface PlayInputAction extends ActionWithInput {
    type: 'playInput';
    // number of tracks to play; default 1
    count?: number;
    // index of first track to play; default 0
    offset?: number;
}

// input: Track List
// print out some or all items from the input list
export interface ListInputAction extends ActionWithInput {
    type: 'listInput';
    // number of tracks to print out; default input.length
    count?: number;
    // index of first track to list; default 0
    offset?: number;
}
// input: Track List; output: Track List
// apply a filter to match tracks; result is the tracks that match the filter
export interface FilterTracksAction extends ActionWithInput {
    type: 'filterTracks';
    // a filter string, which has the following structure (written as a grammar)
    // filter -> (constraint combiner?)+
    // constraint -> artist:string | genre:string | year:year-range | description:string
    // combiner -> 'AND' | 'OR' (AND is the default and may be omitted)
    // the description constraint value describes any constraint not expressable as a combination of genre, artist and year constraints
    filter: string;
    // keep the tracks that do not match, instead of the tracks that match; default false
    negate?: boolean;
}

// input: Track List; output: Track List
// sort the tracks; default is sort by track name ascending
export interface SortTracksAction extends ActionWithInput {
    type: 'sortTracks';
    description?: string;
    // default: false
    descending?: boolean;
}

// input: Track List
// create a Spotify playlist from a list of tracks
export interface CreatePlaylistAction extends ActionWithInput {
    type: 'createPlaylist';
    name: string;
}

// if the user types text that is not understood, this action is used
export interface UnknownAction {
    type: 'unknown';
    // text typed by the user that the system did not understand
    text: string;
}

// if the user asks a non-music question, it is captured with this action; non-music, non-questions use UnknownAction
export interface NonMusicQuestionAction {
    type: 'nonMusicQuestion';
    // text of the question
    text: string;
}

export type SpotifyAction =
    | PlayAction
    | PlayInputAction
    | ListInputAction
    | SearchTracksAction
    | PauseAction
    | VolumeAction
    | GetRecentlyPlayedAction
    | FilterTracksAction
    | SortTracksAction
    | CreatePlaylistAction
    | NonMusicQuestionAction
    | UnknownAction;

export type SpotifyActions = {
    actions: SpotifyAction[];
};
