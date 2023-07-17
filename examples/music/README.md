### Connecting the app to Spotify
1. Go to https://developer.spotify.com/dashboard. 
2. Log into Spotify with your user account if you are not already logged in.
3. Click the button in the upper right labeled Create App.
4. Fill in the form, making sure the Redirect URI is http://localhost:4815/callback.
5. Click the settings button and copy down the client id and client secret (the client secret requires you to click 'View client secret')
6. In your .env file, set SPOTIFY_APP_CLI to your client id and SPOTIFY_APP_CLISEC to your client secret.  