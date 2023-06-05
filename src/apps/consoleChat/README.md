A simple **Chat Bot** implemented as a Node Console App.

You must add these environment variables:

- `OPENAI_API_KEY`: Your key
- `OPENAI_API_BASE`: Your endpoint
- `DEPLOYMENT_NAME`: Your deployment

You can safely put the environment variables in a root-level file named `.env` which will be automatically loaded by using [`dotenv`](https://www.npmjs.com/package/dotenv):

```
OPENAI_API_KEY=<YOUR_KEY>
OPENAI_API_BASE=<YOUR_ENDPOINT>
DEPLOYMENT_NAME=<YOUR_DEPLOYMENT>
```

To run the Chat Bot in VS Code, configure `launch.json` like so:

```json
{
    "name": "Run Console Chat App",
    "program": "${workspaceFolder}/src/apps/consoleChat/chatApp.ts",
    "console": "externalTerminal"
}
```
