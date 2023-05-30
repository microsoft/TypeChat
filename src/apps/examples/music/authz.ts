import open from 'open';
import chalk from 'chalk';
import express from 'express';

import { Server } from 'http';
type AuthzHandlerFn = (token: string) => void;
type AuthzHandler = AuthzHandlerFn | undefined;
type AuthzServer = Server | undefined;

const scope = [
    'user-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'streaming',
    'ugc-image-upload',
    'user-follow-modify',
    'user-follow-read',
    'user-library-read',
    'user-library-modify',
    'user-read-private',
    'user-read-birthdate',
    'user-read-email',
    'user-top-read',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-recently-played',
].join('%20');

const baseClientId = process.env.SPOTIFY_AUTHZ_CLI;

export class Authzor {
    url: string;
    app: express.Express;
    handler: AuthzHandler;
    server: AuthzServer;

    constructor(
        public port = 4815,
        public showDialog = false,
        public clientId = baseClientId
    ) {
        const redirectUri = 'http://localhost:' + port + '/callback';

        this.url =
            'https://accounts.spotify.com/authorize' +
            '?client_id=' +
            clientId +
            '&response_type=token' +
            '&scope=' +
            scope +
            '&show_dialog=' +
            showDialog +
            '&redirect_uri=' +
            redirectUri;

        this.app = express();

        this.app.get('/callback', (req, res) => {
            res.sendFile(__dirname + '/callback.html');
            if (req.query.error) {
                console.log(
                    chalk.red('Something went wrong. Error: '),
                    req.query.error
                );
            }
        });

        this.app.get('/token', (req, res) => {
            res.sendStatus(200);
            const token = req.query.access_token as string;
            if (token) {
                if (this.handler) {
                    this.handler(token);
                }
            }
            this.close();
        });
    }

    authorize(handler: AuthzHandlerFn) {
        this.handler = handler;
        this.server = this.app.listen(this.port, () => {
            if (this.showDialog) {
                console.log(
                    chalk.blue(
                        'Opening the Spotify Login Dialog in your browser...'
                    )
                );
            }
            open(this.url, { wait: false });
        });
    }

    close() {
        if (this.server) {
            this.server.close();
        }
    }
}
