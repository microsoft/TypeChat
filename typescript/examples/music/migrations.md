# Local Music DB Migrations

Tracks table
```[SQL]
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist_id INTEGER NOT NULL,
    album_id INTEGER,
    duration INTEGER,
    release_date TEXT,
    genre TEXT,
);
```
Albums table
```[SQL]
CREATE TABLE albums (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist_id INTEGER NOT NULL,
    release_date TEXT,
    genre TEXT,
);
```
Playlists table
```[SQL]
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    creation_date TEXT,
    description TEXT,
);
```
Artists table
```[SQL]
CREATE TABLE artists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT,
    genre TEXT
);
```
