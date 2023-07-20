# Music

The Music example shows how to capture user intent as actions in JSON which corresponds to a simple dataflow program over the API provided in the intent schema. This example shows this pattern using natural language to control the Spotify API to play music, create playlists, and perform other actions from the API. 

# Try Music
To run the Music example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

This example also requires additional setup to use the Spotify API:

1. Go to https://developer.spotify.com/dashboard. 
2. Log into Spotify with your user account if you are not already logged in.
3. Click the button in the upper right labeled Create App.
4. Fill in the form, making sure the Redirect URI is http://localhost:PORT/callback, where PORT is a four-digit port number you choose for the authorization redirect.
5. Click the settings button and copy down the Client ID and Client Secret (the client secret requires you to click 'View client secret').
6. In your .env file, set `SPOTIFY_APP_CLI` to your client id and `SPOTIFY_APP_CLISEC` to your client secret.  Also set `SPOTIFY_APP_PORT` to the PORT on your local machine that you chose in step 4.

A Spotify Premium account is required to run this example.

# Usage
Example prompts can be found at [`src/input.txt`](./src/input.txt).

For example, use natural language to start playing a song with the Spotify player:

**Input**:
```
🎵> play shake it off by taylor swift
```

**Output**:
```
Plan Validated:
{
    "@steps": [
        {
            "@func": "searchTracks",
            "@args": [
                "shake it off taylor swift"
            ]
        },
        {
            "@func": "play",
            "@args": [
                {
                    "@ref": 0
                }
            ]
        }
    ]
}
import { API } from "./schema";
function program(api: API) {
  const step1 = api.searchTracks("shake it off taylor swift");
  return api.play(step1);
}
Playing...
Shake It Off
```