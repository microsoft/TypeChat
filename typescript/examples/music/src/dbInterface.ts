import sqlite3 from "sqlite3";

const dbPath = "../musicLibrary.db"

type Row = { [key:string] : unknown }

function executeQuery(query: string, params: any[] = []): Row[] | void {
    const db = new sqlite3.Database(dbPath, (error) => {
        if (error) {
            console.log(`Error executing query: ${query} against ${dbPath}`);
            return;
        }
        
        db.all(query, params, (error: Error, rows: Row[]) => {
            db.close();

            if (error) {
                console.log(`Error executing query: ${query} against ${dbPath}`);
                return;
            }

            return rows;
        });
    });
}

export function insertTracks(tracks: SpotifyApi.TrackObjectFull[]) {
    let insertQuery = 'INSERT INTO tracks (id, title, artist_id, album_id, duration, release_data, genre)\nVALUES\n';
    for (const track of tracks) {
        // TODO: genre
        insertQuery += `    (${track.id},${track.name},${track.artists[0].id},${track.album.id},${track.duration_ms},${track.album.release_date})`;
    }    


}
export function getArtists() {
    const query = "SELECT * FROM artists";
    const artists = executeQuery(query);
    return artists;
}
