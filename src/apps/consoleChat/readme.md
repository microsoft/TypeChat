A simple **Chat Bot** implemented as a Node Console App. 

You must add these environment variables
- "OPENAI_API_KEY": "Your key",
- "OPENAI_API_BASE": "Your endpoint",
- "DEPLOYMENT_NAME": "Your deployment"

You can put the variables in launch.json or in in **.env** file - which we will automatically load using dotenv.

To run the Chat Bot in VS Code: 
- Configure launch.json like so: 
{
    "program": "${workspaceFolder}/src/apps/consoleChat/chatApp.ts",
    "console": "externalTerminal"
}
