## About Tests
- The tests here will be ported to the Jest framework over the next few days.
- They are only here to test out some of the new support code we are starting to check in. 
- Tests for typechat proper are currently in the typechat code. They will be migrated in future weeks. 

### Typechat Old Tests ###
- Build src
- Build In VS Code, set launch.json to run typechat.ts
- You will also need to add these environment variables to launch.json:
    - "OPENAI_API_KEY": "Your key",
    - "OPENAI_API_BASE": "Your endpoint",
    - "DEPLOYMENT_NAME": "Your deployment"
- Step through suitable runTests method
- If these instructions don't work, please fix them.

### JEST tests ###
-  Ensure you have Jest and related extensions installed.
-  Create an **appConfig.json** file in the test folder. 
-  Clone /src/typeChatConfigSample.json as a basic
-  **You must add keys** for your Azure Open AI subscription. 
    - .gitignore is set up ensure this file does not get checked in, but do double check. 
    - We don't want to leak credentials
- If you don't have an Azure Open AI subscription, **AI tests** will not run 


