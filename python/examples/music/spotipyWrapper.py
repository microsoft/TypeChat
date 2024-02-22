from typing_extensions import Any
from pydantic.dataclasses import dataclass, field
import spotipy # type: ignore

# The spotipy library does not provide type hints or async methods. This file has some wrappers and stubs 
# to give just-enough typing for the demo

# This class holds the Track info needed for our use
@dataclass
class SimplifiedTrackInfo:
    name: str
    uri: str
    artistNames: list[str]
    artistUris: list[str]
    albumName: str
    genres: list[str] = field(default_factory=list)

# This class holds the Playlist info needed for our use
@dataclass
class SimplifiedPlaylistInfo:
    name: str
    id: str

# This wrapper class allows the rest of the code to use type hints and async pattern
class AsyncSpotipy:
    _service: spotipy.Spotify

    def __init__(self, service: spotipy.Spotify):
        super().__init__()
        self._service = service

    async def devices(self) -> dict[str, Any]:
        return self._service.devices()  # type: ignore

    async def search(
        self, q: str, limit: int = 10, offset: int = 0, type: str = "track", market: str | None = None
    ) -> dict[str, Any]:
        return self._service.search(q=q, limit=limit, offset=offset, type=type, market=market)  # type: ignore

    async def next(self, result: dict[str, Any]) -> dict[str, Any]:
        return self._service.next(result=result)  # type: ignore

    async def artist(self, artist_id: str) -> dict[str, Any]:
        return self._service.artist(artist_id=artist_id)  # type: ignore

    async def album(self, album_id: str, market: str | None = None) -> dict[str, Any]:
        return self._service.album(album_id=album_id, market=market)  # type: ignore

    async def queue(self) -> dict[str, Any]:
        return self._service.queue()  # type: ignore

    async def current_playback(self, market: str | None = None, additional_types: str | None = None) -> dict[str, Any]:
        return self._service.current_playback(market=market, additional_types=additional_types)  # type: ignore

    async def start_playback(
        self,
        device_id: str | None = None,
        context_uri: str | None = None,
        uris: list[str] | None = None,
        offset: dict[str, int] | None = None,
        position_ms: int | None = None,
    ) -> None:
        return self._service.start_playback(device_id=device_id, context_uri=context_uri, uris=uris, offset=offset, position_ms=position_ms)  # type: ignore

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

    async def current_user_top_tracks(
        self, limit: int = 20, offset: int = 0, time_range: str = "medium_term"
    ) -> dict[str, Any]:
        return self._service.current_user_top_tracks(limit=limit, offset=offset, time_range=time_range)  # type: ignore

    async def current_user_playlists(self, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        return self._service.current_user_playlists(limit=limit, offset=offset)  # type: ignore

    async def user_playlist_create(
        self, user: str, name: str, public: bool = True, collaborative: bool = False, description: str = ""
    ) -> dict[str, Any]:
        return self._service.user_playlist_create(user=user, name=name, public=public, collaborative=collaborative, description=description)  # type: ignore

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

    async def playlist_add_items(self, playlist_id: str, items: list[str], position: int | None = None) -> None:
        return self._service.playlist_add_items(playlist_id=playlist_id, items=items, position=position)  # type: ignore

    async def current_user_unfollow_playlist(self, playlist_id: str) -> None:
        return self._service.current_user_unfollow_playlist(playlist_id=playlist_id)  # type: ignore

