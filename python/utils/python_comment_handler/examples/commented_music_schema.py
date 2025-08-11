from typing_extensions import Literal, Required, NotRequired, TypedDict


class unknownActionParameters(TypedDict):
    text: str # text typed by the user that the system did not understand


class UnknownAction(TypedDict):
    """
    Use this action for requests that weren't understood
    """

    actionName: Literal["Unknown"]
    text: unknownActionParameters


class EmptyParameters(TypedDict):
    pass


class PlayParameters(TypedDict, total=False):
    artist: str # artist (performer, composer) to search for to play
    album: str # album to search for to play
    trackName: str # track to search for to play
    query: str # other description to search for to play
    itemType: Literal["track", "album"] # this property is only used when the user specifies the item type
    quantity: Required[int] # number of items to play, examples: three, a/an (=1), a few (=3), a couple of (=2), some (=5). Use -1 for all, 0 if unspecified.
    trackNumber: int # play the track at this index in the current track list
    trackRange: list[int] # play this range of tracks example 1-3


class PlayAction(TypedDict):
    """
    play a track, album, or artist; this action is chosen over search if both could apply
    with no parameters, play means resume playback
    """

    actionName: Literal["play"]
    parameters: PlayParameters


class StatusAction(TypedDict):
    """
    show now playing including track information, and playback status including playback device
    """

    actionName: Literal["status"]
    parameters: EmptyParameters


class PauseAction(TypedDict):
    """
    pause playback
    """

    actionName: Literal["pause"]
    parameters: EmptyParameters


class ResumeAction(TypedDict):
    """
    resume playback
    """

    actionName: Literal["resume"]
    parameters: EmptyParameters


class NextAction(TypedDict):
    """
    next track
    """

    actionName: Literal["next"]
    parameters: EmptyParameters


class PreviousAction(TypedDict):
    """
    previous track
    """

    actionName: Literal["previous"]
    parameters: EmptyParameters


class ShuffleActionParameters(TypedDict):
    on: bool


class ShuffleAction(TypedDict):
    """
    turn shuffle on or off
    """

    actionName: Literal["shuffle"]
    parameters: ShuffleActionParameters


class ListDevicesAction(TypedDict):
    """
    list available playback devices
    """

    actionName: Literal["listDevices"]
    parameters: EmptyParameters


class SelectDeviceActionParameters(TypedDict):
    keyword: str # keyword to match against device name


class SelectDeviceAction(TypedDict):
    """
    select playback device by keyword
    """

    actionName: Literal["selectDevice"]
    parameters: SelectDeviceActionParameters


class SelectVolumeActionParameters(TypedDict):
    newVolumeLevel: int # new volume level


class SetVolumeAction(TypedDict):
    """
    set volume
    """

    actionName: Literal["setVolume"]
    parameters: SelectVolumeActionParameters


class ChangeVolumeActionParameters(TypedDict):
    volumeChangePercentage: int # volume change percentage


class ChangeVolumeAction(TypedDict):
    """
    change volume plus or minus a specified percentage
    """

    actionName: Literal["changeVolume"]
    parameters: ChangeVolumeActionParameters


class SearchTracksActionParameters(TypedDict):
    query: str # the part of the request specifying the the search keywords examples: song name, album name, artist name


class SearchTracksAction(TypedDict):
    """
    this action is only used when the user asks for a search as in 'search', 'find', 'look for'
    query is a Spotify search expression such as 'Rock Lobster' or 'te kanawa queen of night'
    set the current track list to the result of the search
    """

    actionName: Literal["searchTracks"]
    parameters: SearchTracksActionParameters


class ListPlaylistsAction(TypedDict):
    """
    list all playlists
    """

    actionName: Literal["listPlaylists"]
    parameters: EmptyParameters


class GetPlaylistActionParameters(TypedDict):
    name: str # name of playlist to get


class GetPlaylistAction(TypedDict):
    """
    get playlist by name
    """

    actionName: Literal["getPlaylist"]
    parameters: GetPlaylistActionParameters


class GetAlbumActionParameters(TypedDict):
    name: str # name of album to get


class GetAlbumAction(TypedDict):
    """
    get album by name; if name is "", use the currently playing track
    set the current track list the tracks in the album
    """

    actionName: Literal["getAlbum"]
    parameters: GetPlaylistActionParameters


class GetFavoritesActionParameters(TypedDict):
    count: NotRequired[int] # number of favorites to get


class GetFavoritesAction(TypedDict):
    """
    Set the current track list to the user's favorite tracks
    """

    actionName: Literal["getFavorites"]
    parameters: GetFavoritesActionParameters


class FilterTracksActionParameters(TypedDict):
    filterType: Literal["genre", "artist", "name"] # filter type is one of 'genre', 'artist', 'name'; name does a fuzzy match on the track name
    filterValue: str # filter value is the value to match against
    negate: NotRequired[bool] # if negate is true, keep the tracks that do not match the filter


class FilterTracksAction(TypedDict):
    """
    apply a filter to match tracks in the current track list
    set the current track list to the tracks that match the filter
    """

    actionName: Literal["filterTracks"]
    parameters: FilterTracksActionParameters


class CreatePlaylistActionParameters(TypedDict):
    name: str # name of playlist to create


class CreatePlaylistAction(TypedDict):
    """
    create a new playlist from the current track list
    """

    actionName: Literal["createPlaylist"]
    parameters: CreatePlaylistActionParameters


class DeletePlaylistActionParameters(TypedDict):
    name: str # name of playlist to delete


class DeletePlaylistAction(TypedDict):
    """
    delete a playlist
    """

    actionName: Literal["deletePlaylist"]
    parameters: DeletePlaylistActionParameters


class GetQueueAction(TypedDict):
    """
    set the current track list to the queue of upcoming tracks
    """

    actionName: Literal["getQueue"]
    parameters: EmptyParameters


PlayerAction = (
    PlayAction
    | StatusAction
    | PauseAction
    | ResumeAction
    | NextAction
    | PreviousAction
    | ShuffleAction
    | ListDevicesAction
    | SelectDeviceAction
    | SetVolumeAction
    | ChangeVolumeAction
    | SearchTracksAction
    | ListPlaylistsAction
    | GetPlaylistAction
    | GetAlbumAction
    | GetFavoritesAction
    | FilterTracksAction
    | CreatePlaylistAction
    | DeletePlaylistAction
    | GetQueueAction
    | UnknownAction
)


class PlayerActions(TypedDict):
    actions: list[PlayerAction]
