import sqlite3 from "sqlite3";

const dbPath = "../musicLibrary.db"

type Row = {}

function executeQuery(query: string, params: any[] = []): any {
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

export function getArtists() {
    const query = "SELECT * FROM artists";
    const artists = executeQuery(query);
    return artists;
}
