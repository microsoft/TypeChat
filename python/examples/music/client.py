import os
import sys
current_path = os.path.abspath(os.path.dirname(__file__))
if current_path not in sys.path:
    sys.path.append(current_path)

import math
from typing import Any, Optional

from pydantic.dataclasses import dataclass
from schema import PlayerAction
import spotipy


@dataclass
class SimplifiedTrackInfo:
    name: str
    uri: str
    artistNames: list[str]
    artistUris: list[str]
    albumName: str
    genres: Optional[list[str]] = None


@dataclass
class SimplifiedPlaylistInfo:
    name: str
    id: str


# The spotipy library does not provide type hints or async methods.
# This wrapper class allows the rest of the code to use type hints and async pattern
class AsyncSpotipy:
    _service: spotipy.Spotify

    def __init__(self, service: spotipy.Spotify):
        super().__init__()
        self._service = service

    async def devices(self) -> dict[str, Any]:
        return self._service.devices()  # type: ignore

    async def start_playback(
        self,
        device_id: str | None = None,
        context_uri: str | None = None,
        uris: list[str] | None = None,
        offset: dict[str, int] | None = None,
        position_ms: int | None = None,
    ) -> None:
        return self._service.start_playback(device_id=device_id, context_uri=context_uri, uris=uris, offset=offset, position_ms=position_ms)  # type: ignore

    async def search(
        self, q: str, limit: int = 10, offset: int = 0, type: str = "track", market: str | None = None
    ) -> dict[str, Any]:
        return self._service.search(q=q, limit=limit, offset=offset, type=type, market=market)  # type: ignore

    async def artist(self, artist_id: str) -> dict[str, Any]:
        return self._service.artist(artist_id=artist_id)  # type: ignore

    async def current_user_playlists(self, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        return self._service.current_user_playlists(limit=limit, offset=offset)  # type: ignore

    async def current_playback(self, market: str | None = None, additional_types: str | None = None) -> dict[str, Any]:
        return self._service.current_playback(market=market, additional_types=additional_types)  # type: ignore

    async def queue(self) -> dict[str, Any]:
        return self._service.queue()  # type: ignore

    async def pause_playback(self, device_id: str | None = None) -> None:
        return self._service.pause_playback(device_id=device_id)  # type: ignore

    async def next_track(self, device_id: str | None = None) -> None:
        return self._service.next_track(device_id=device_id)  # type: ignore

    async def previous_track(self, device_id: str | None = None) -> None:
        return self._service.previous_track(device_id=device_id)  # type: ignore

    async def volume(self, volume_percent: int, device_id: str | None = None) -> None:
        return self._service.volume(volume_percent=volume_percent, device_id=device_id)  # type: ignore

    async def shuffle(self, state: bool, device_id: str | None = None) -> None:
        return self._service.shuffle(state=state, device_id=device_id)  # type: ignore

    async def transfer_playback(self, device_id: str, force_play: bool = True) -> None:
        return self._service.transfer_playback(device_id=device_id, force_play=force_play)  # type: ignore

    async def playlist_items(
        self,
        playlist_id: str,
        fields: str | None = None,
        limit: int = 100,
        offset: int = 0,
        market: str | None = None,
        additional_types: list[str] | None = None,
    ) -> dict[str, Any]:
        return self._service.playlist_items(playlist_id=playlist_id, fields=fields, limit=limit, offset=offset, market=market, additional_types=additional_types)  # type: ignore

    async def album(self, album_id: str, market: str | None = None) -> dict[str, Any]:
        return self._service.album(album_id=album_id, market=market)  # type: ignore

    async def current_user_top_tracks(
        self, limit: int = 20, offset: int = 0, time_range: str = "medium_term"
    ) -> dict[str, Any]:
        return self._service.current_user_top_tracks(limit=limit, offset=offset, time_range=time_range)  # type: ignore

    async def user_playlist_create(
        self, user: str, name: str, public: bool = True, collaborative: bool = False, description: str = ""
    ) -> dict[str, Any]:
        return self._service.user_playlist_create(user=user, name=name, public=public, collaborative=collaborative, description=description)  # type: ignore

    async def playlist_add_items(self, playlist_id: str, items: list[str], position: int | None = None) -> None:
        return self._service.playlist_add_items(playlist_id=playlist_id, items=items, position=position)  # type: ignore

    async def current_user_unfollow_playlist(self, playlist_id: str) -> None:
        return self._service.current_user_unfollow_playlist(playlist_id=playlist_id)  # type: ignore

    async def next(self, result: dict[str, Any]) -> dict[str, Any]:
        return self._service.next(result=result)  # type: ignore


class Config:
    arbitrary_types_allowed = True


@dataclass(config=Config)
class ClientContext:
    service: AsyncSpotipy
    userId: str
    deviceId: Optional[str] = None
    currentTrackList: Optional[list[SimplifiedTrackInfo]] = None
    lastTrackStartIndex: Optional[int] = 0
    lastTrackEndIndex: Optional[int] = -1


async def get_client_context(vals: dict[str, str | None]) -> ClientContext:
    scopes = [
        "user-read-private",
        "playlist-read-collaborative",
        "playlist-modify-private",
        "playlist-read-private",
        "playlist-modify-public",
        "streaming",
        "user-library-read",
        "user-top-read",
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-recently-played",
        "user-read-currently-playing",
        "user-library-modify",
        "ugc-image-upload",
    ]

    scopes_str = " ".join(scopes)

    auth_manager = spotipy.SpotifyOAuth(
        client_id=vals.get("SPOTIPY_CLIENT_ID", None),
        client_secret=vals.get("SPOTIPY_CLIENT_SECRET", None),
        redirect_uri=vals.get("SPOTIPY_REDIRECT_URI", None),
        scope=scopes_str,
    )

    spotify = spotipy.Spotify(auth_manager=auth_manager)
    devices = spotify.devices()
    device_id: str = ""
    if devices:
        device_list = devices.get("devices", [])
        if device_list:
            device_id = device_list[0].get("id", "")
    user: dict[str, Any] = spotify.current_user()  # type: ignore
    result = ClientContext(deviceId=device_id, service=AsyncSpotipy(spotify), userId=user.get("id", None))
    return result


async def play_album(album_uri: str, context: ClientContext):
    await context.service.start_playback(context_uri=album_uri, device_id=context.deviceId)


async def play_tracks_with_query(query: str, quantity: int, context: ClientContext):
    # To do: paginate until we get to the requested number of items
    results = await context.service.search(q=query, type='track', limit=quantity, offset=0)
    item_uris = [t["uri"] for t in results['tracks']['items']]
    await context.service.start_playback(device_id=context.deviceId, uris=item_uris)


async def play_albums_with_query(query: str, quantity: int, context: ClientContext):
    results = await context.service.search(q=query, type='album', limit=quantity, offset=0)
    item_uris = [t["uri"] for t in results['albums']['items']]
    await context.service.start_playback(device_id=context.deviceId, uris=item_uris)


async def play_artist_with_query(query: str, context: ClientContext):
    results = await context.service.search(q=query, type='artist')
    items = results['artists']['items']
    if len(items) > 0:
        artist = items[0]
        await context.service.start_playback(context_uri=artist["uri"], device_id=context.deviceId)


def get_tracks_from_result_list(resultItems: list[Any]) -> list[SimplifiedTrackInfo]:
    tracks = [
        SimplifiedTrackInfo(
            name=track["name"],
            artistNames=[a["name"] for a in track["artists"]],
            artistUris=[a["uri"] for a in track["artists"]],
            albumName=track["album"]["name"],
            uri=track["uri"],
        )
        for track in resultItems
    ]

    return tracks


async def get_tracks_from_search(query: str, context: ClientContext) -> list[SimplifiedTrackInfo]:
    results = await context.service.search(q=query, type='track', limit=50, offset=0)
    tracks: list[SimplifiedTrackInfo] = []
    while results:
        tracks.extend(get_tracks_from_result_list(resultItems=results['tracks']['items']))

        if results['next']:
            results = await context.service.next(results)
        else:
            results = None

    return tracks


async def get_tracks_with_genres(
    tracks: list[SimplifiedTrackInfo], context: ClientContext
) -> list[SimplifiedTrackInfo]:
    unique_artist_ids: list[str] = list(set([a for a in track.artistUris]))  # type: ignore
    genre_lookup: dict[str, list[str]] = {}
    for artist_id in unique_artist_ids:
        artist = await context.service.artist(artist_id)
        genre_lookup[artist_id] = [g.casefold() for g in artist["genres"]]
    for track in tracks:
        track_genres = set()
        for artist_id in track.artistUris:
            track_genres += set(genre_lookup[artist_id])  # type: ignore
        track.genres = list(track_genres)

    return tracks


def print_tracks(tracks: list[SimplifiedTrackInfo]):
    for track in tracks:
        print(f" {track.name}")
        print(f"   Artists: {", ".join(track.artistNames)}")
        print(f"   Album: {track.albumName}")


def update_track_list_and_print(tracks: list[SimplifiedTrackInfo], context: ClientContext):
    print_tracks(tracks)
    context.currentTrackList = tracks


async def get_current_users_playlists(context: ClientContext) -> list[SimplifiedPlaylistInfo]:
    results = await context.service.current_user_playlists(limit=50)
    playlists: list[SimplifiedPlaylistInfo] = []
    while results:
        playlists.extend(
            [SimplifiedPlaylistInfo(name=curr_list["name"], id=curr_list["id"]) for curr_list in results['items']]
        )

        if results['next']:
            results = await context.service.next(results)
        else:
            results = None

    return playlists


async def print_status(context: ClientContext):
    state = await context.service.current_playback()
    if not state:
        print("Nothing playing according to Spotify")
    devices = await context.service.devices()
    for device in devices["devices"]:
        if device["is_active"]:
            print(F"Active Device {device['name']} of type {device['type']}")
        else:
            print(f"Device {device['name']} of type {device['type']} is available")


async def list_available_devices(context: ClientContext):
    devices = await context.service.devices()
    for device in devices["devices"]:
        print(f"Device {device['name']} of type {device['type']} is available")


async def handle_call(action: PlayerAction, context: ClientContext):
    match action["actionName"]:
        case "play":
            start_index = action["parameters"].get("trackNumber", None)
            end_index = 0

            if start_index is None:
                track_range = action["parameters"].get("trackRange", None)
                if track_range:
                    start_index = track_range[0]
                    end_index = track_range[1]

            if start_index is not None:
                if not end_index:
                    end_index = start_index + 1
                if context.currentTrackList is None:
                    queue = await context.service.queue()
                    if queue["queue"]:
                        tracks = get_tracks_from_result_list(resultItems=queue["queue"])
                        context.currentTrackList = tracks

                if context.currentTrackList:
                    item_uris = [a.uri for a in context.currentTrackList]
                    await context.service.start_playback(
                        device_id=context.deviceId, uris=item_uris, offset={"position": start_index}
                    )
            else:
                query = action["parameters"].get("query", None)
                album = action["parameters"].get("album", None)
                track = action["parameters"].get("trackName", None)
                artist = action["parameters"].get("artist", None)
                quantity = action["parameters"].get("quantity", 1)
                if quantity < 9:
                    quantity = 1

                if query:
                    actionType = action["parameters"].get("itemType", "album")
                    if actionType == "track":
                        await play_tracks_with_query(query, quantity, context)
                    else:
                        await play_albums_with_query(query, quantity, context)
                elif track is not None:
                    query = 'track:' + track
                    await play_tracks_with_query(query, quantity, context)
                elif album is not None:
                    query = 'album:' + album
                    await play_albums_with_query(query, quantity, context)
                elif artist is not None:
                    query = 'artist:' + artist
                    await play_artist_with_query(query, context)
                else:
                    # Resume playback on default device
                    await context.service.start_playback(device_id=context.deviceId)
        case "status":
            await print_status(context)
        case "getQueue":
            queue = await context.service.queue()
            print("Current Queue: ")
            for track in queue["queue"]:
                print(f" {track['name']}")
                print(f"   Artists: {", ".join([a['name'] for a in track['artists']])}")
                print(f"   Album: {track['album']['name']}")
            await print_status(context)
        case "pause":
            await context.service.pause_playback(device_id=context.deviceId)
            await print_status(context)
        case "next":
            await context.service.next_track(device_id=context.deviceId)
            await print_status(context)
        case "previous":
            await context.service.previous_track(device_id=context.deviceId)
            await print_status(context)
        case "shuffle":
            await context.service.shuffle(device_id=context.deviceId, state=action["parameters"]["on"])
            await print_status(context)
        case "resume":
            await context.service.start_playback(device_id=context.deviceId)
            await print_status(context)
        case "listDevices":
            devices = await context.service.devices()
            for device in devices["devices"]:
                print(f"Device {device['name']} of type {device['type']} is available")
        case "selectDevice":
            deviceKeyword = action["parameters"]["keyword"].lower()
            devices = await context.service.devices()
            target_device = next(
                (d for d in devices if d.name.lower() == deviceKeyword or d.type.lower() == deviceKeyword), None
            )
            if target_device:
                await context.service.transfer_playback(device_id=target_device.id)
                print(f"Selected device {target_device.name} of type {target_device.type}")
        case "setVolume":
            new_volume = action["parameters"].get("newVolumeLevel", None)
            new_volume = max(0, min(new_volume, 100))
            print(f"Setting volume to {new_volume} ...")
            await context.service.volume(device_id=context.deviceId, volume_percent=new_volume)
        case "changeVolume":
            playback_state = await context.service.current_playback()
            if playback_state and playback_state["device"]:
                volume = int(playback_state["device"]["volume_percent"])
                volume_change = int(action["parameters"].get("volumeChangePercentage", 0))
                new_volume = math.floor((1.0 + volume_change / 100) * volume)
                new_volume = max(0, min(new_volume, 100))
                print(f"Setting volume to {new_volume} ...")
                await context.service.volume(device_id=context.deviceId, volume_percent=new_volume)
        case "searchTracks":
            query = "track:" + action["parameters"].get("query", None)
            tracks = await get_tracks_from_search(query=query, context=context)
            print("Search Results: ")
            update_track_list_and_print(tracks, context)
        case "listPlaylists":
            playlists = await get_current_users_playlists(context)
            for i, playlist in enumerate(playlists):
                print("%4d %s" % (i + 1, playlist.name))

        case "getPlaylist":
            playlists = await get_current_users_playlists(context)
            name = action["parameters"].get("name", None)
            target_playlist = next((p for p in playlists if p.name.casefold() == name.casefold()), None)
            if target_playlist:
                results = await context.service.playlist_items(
                    playlist_id=target_playlist.id, additional_types=['track']
                )
                tracks = get_tracks_from_result_list(resultItems=results['items'])

                print("PLaylist items: ")
                update_track_list_and_print(tracks, context)
        case "getAlbum":
            name = action["parameters"].get("name", None)
            if name:
                results = await context.service.search(q='album:' + name, type='album', limit=50, offset=0)
                if results:
                    target_album_info = results["albums"]["items"][0]
                    if target_album_info:
                        target_album = await context.service.album(target_album_info["uri"])
                        tracks = get_tracks_from_result_list(resultItems=target_album['tracks'])

                        print("Album items: ")
                        update_track_list_and_print(tracks, context)
        case "getFavorites":
            count = action["parameters"].get("count", 50)
            results = await context.service.current_user_top_tracks(limit=count, offset=0)
            if results:
                tracks = get_tracks_from_result_list(resultItems=results['items'])

                print("Favorite tracks: ")
                update_track_list_and_print(tracks, context)
        case "filterTracks":
            trackCollection = context.currentTrackList
            filter_type = action["parameters"].get("filterType", None)
            filter_value = action["parameters"].get("filterValue", None)

            if filter_type and filter_value and trackCollection:
                matched_tracks: list[SimplifiedTrackInfo] = []
                filter_value = filter_value.casefold()
                match filter_type:
                    case "genre":
                        extended_collection = await get_tracks_with_genres(trackCollection, context)
                        matched_tracks = [t for t in extended_collection if filter_value in t.genres]
                    case "artist":
                        matched_tracks = [
                            t
                            for t in trackCollection
                            if any(filter_value in a for a in list(map(str.casefold, t.artistNames)))
                        ]
                    case "name":
                        matched_tracks = [t for t in trackCollection if filter_value in t.name.casefold()]
                if action["parameters"].get("negate", None):
                    tracks = [t for t in trackCollection if t not in matched_tracks]
                else:
                    tracks = matched_tracks

                print("Filtered tracks:")
                update_track_list_and_print(tracks, context)
        case "createPlaylist":
            name = action["parameters"]["name"]
            trackCollection = context.currentTrackList
            if name and trackCollection:
                uris = [t.uri for t in trackCollection]
                playlist = await context.service.user_playlist_create(user=context.userId, name=name)
                await context.service.playlist_add_items(playlist_id=playlist["id"], items=uris)
                print(f"Playlist {name} created with tracks:")
                print_tracks(trackCollection)
            else:
                print("no input tracks for createPlaylist")
        case "deletePlaylist":
            name = action["parameters"].get("name", None)
            playlists = await get_current_users_playlists(context)
            if name and playlists:
                target_playlist = next((p for p in playlists if p.name.casefold() == name.casefold()), None)
                if target_playlist:
                    await context.service.current_user_unfollow_playlist(playlist_id=target_playlist.id)
                    print(f"Playlist {name} deleted")
        case "unknown":
            print(f"Text not understood in this context: {action.get('text', None)}")
