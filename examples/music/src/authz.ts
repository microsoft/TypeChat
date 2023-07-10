import open from "open";
import chalk from "chalk";
import express from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

import { Server } from "http";
type AuthzHandlerFn = (token: string | undefined) => void;
type AuthzHandler = AuthzHandlerFn | undefined;
type AuthzServer = Server | undefined;

const scope = [
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
].join("%20");

const baseClientId = process.env.SPOTIFY_APP_CLI;

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
    const redirectUri = "http://localhost:" + port + "/callback";

    this.url =
      "https://accounts.spotify.com/authorize" +
      "?client_id=" +
      clientId +
      "&response_type=token" +
      "&scope=" +
      scope +
      "&show_dialog=" +
      showDialog +
      "&redirect_uri=" +
      redirectUri;

    this.app = express();

    this.app.get("/callback", (req, res) => {
      res.sendFile(__dirname + "/callback.html");
      if (req.query.error) {
        console.log(
          chalk.red("Something went wrong. Error: "),
          req.query.error
        );
      }
    });

    this.app.get("/token", (req, res) => {
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
    if (baseClientId) {
      this.handler = handler;
      this.server = this.app.listen(this.port, () => {
        if (this.showDialog) {
          console.log(
            chalk.blue("Opening the Spotify Login Dialog in your browser...")
          );
        }
        open(this.url, { wait: false });
      });
    }
    else {
        handler(undefined);
    }
  }

  close() {
    if (this.server) {
      this.server.close();
    }
  }
}
