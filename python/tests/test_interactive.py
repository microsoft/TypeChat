"""
Tests for process_requests reading input files.

Input files are read as UTF-8 regardless of the platform's default text encoding.
Bare open() would instead use locale.getpreferredencoding(False), which is a non-UTF-8
codec on many Windows installs (commonly cp1252) and cannot decode non-ASCII input.

The platform default is simulated here rather than taken from the host locale, so these
tests exercise the same code path on every platform and Python version.
"""

import asyncio
import builtins
from pathlib import Path
from typing import Any

import pytest
from typechat._internal.interactive import process_requests

# A line no non-UTF-8 single-byte codec can round-trip.
NON_ASCII_LINE = "\u30b3\u30fc\u30d2\u30fc\u3092\u4e00\u3064\u304f\u3060\u3055\u3044"


@pytest.fixture
def default_encoding_is_cp1252(monkeypatch: pytest.MonkeyPatch):
    """Make encoding-less open() calls behave as they do under a cp1252 locale."""
    real_open = builtins.open

    def fake_open(file: Any, mode: str = "r", *args: Any, **kwargs: Any) -> Any:
        if "b" not in mode and kwargs.get("encoding") is None:
            kwargs["encoding"] = "cp1252"
        return real_open(file, mode, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fake_open)


def _write_utf8(tmp_path: Path, text: str) -> str:
    path = tmp_path / "input.txt"
    path.write_text(text + "\n", encoding="utf-8")
    return str(path)


def _collect(input_file_name: str) -> list[str]:
    seen: list[str] = []

    async def handler(request: str) -> None:
        seen.append(request)

    asyncio.run(process_requests("> ", input_file_name, handler))
    return seen


@pytest.mark.usefixtures("default_encoding_is_cp1252")
def test_reads_non_ascii_input_file_under_non_utf8_default_encoding(tmp_path: Path):
    input_file_name = _write_utf8(tmp_path, NON_ASCII_LINE)

    requests = _collect(input_file_name)

    assert [line.rstrip("\n") for line in requests] == [NON_ASCII_LINE]


@pytest.mark.usefixtures("default_encoding_is_cp1252")
def test_reads_ascii_input_file_under_non_utf8_default_encoding(tmp_path: Path):
    input_file_name = _write_utf8(tmp_path, "one cappuccino please")

    requests = _collect(input_file_name)

    assert [line.rstrip("\n") for line in requests] == ["one cappuccino please"]


@pytest.mark.usefixtures("default_encoding_is_cp1252")
def test_reads_cp1252_representable_input_file_without_corrupting_it(tmp_path: Path):
    # The UTF-8 bytes of "café" decode under cp1252 as "cafÃ©" rather than raising, so a
    # non-UTF-8 read corrupts this line silently instead of failing.
    input_file_name = _write_utf8(tmp_path, "one café please")

    requests = _collect(input_file_name)

    assert [line.rstrip("\n") for line in requests] == ["one café please"]
