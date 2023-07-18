---
layout: doc-page
title: Examples
---

To see TypeChat in action, check out the examples found in `src/samples`. Each example shows how TypeChat handles natural language input and maps to validated TypeScript or Python types as output.

| Name | Description | Features |
| ---- | ----------- | -------- |
| Calendar | Natural language calendar modification | Capture user intent as a sequence of actions  | 
| Coffee Shop | Intelligent agent for a coffee shop | Capturing user intent as a set of nouns, in this case the items in a coffee order. |
| Restaraunt | Intelligent for a generic restaraunt | Captures user intent as a set of nouns, but with more complex linguistic input, illustrating the line between simpler and more advanced language models in handling compound sentences, distractions, and corrections. This example also shows how we can use TypeScript to simplify creation of a user intent summary. |
| Sentiment | Determine the sentiment of user input | Match user intent to a set of nouns | 
| Music | Natural language app for playing music, creating playlists, etc. using Spotify | Captures user intent as actions using a JSON output form that corresponds to a simple dataflow program over an API provided in the intent schema |

## Step 1: Configure development environment.
#### Option 1: GitHub Codespaces
GitHub Codespaces enables you to try TypeChat quickly in a development environment hosted in the cloud.

On the TypeChat repository page:

1. Click the green button labeled `<> Code`
2. Select the `Codespaces` tab.
3. Click the green `Create codespace` button.

If this is your first time creating a codespace on this repository, GitHub will take a moment to create a dev container image for your session. Once the image has been created, the browser will load Visual Studio Code in a developer environment automatically configured with the necessary prerequisites, TypeChat cloned, and packages installed.

Remember that you are running in the cloud, so all changes you make to the source tree must be committed and pushed before destroying the codespace. GitHub accounts are usually configured to automatically delete codespaces that have been inactive for 30 days.

For more information, see the [GitHub Codespaces Overview](https://docs.github.com/en/codespaces/overview)

#### Option 2: Local Machine

Alternatively, you can experiment with TypeChat on your local machine.

1. Ensure [Node.js (18.16.0 LTS or newer)](https://nodejs.org/en) or newer is installed.
2. Clone the repo with `git clone https://github.com/microsoft/typechat.git`. `cd` to the root of the repo.
3. Install packages with `npm install`.

## Step 2: Build TypeChat.

Build TypeChat and example apps with `npm run build`.

## Step 3: Configure environment variables.
Currently, the examples are running on OpenAI or Azure OpenAI endpoints. To use an OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `OPENAI_MODEL`| The OpenAI model name (e.g. gpt-3.5-turbo or gpt-4) |
| `OPENAI_API_KEY` | Your OpenAI API key |

To use an Azure OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `AZURE_OPENAI_ENDPOINT` | The full URL of the Azure OpenAI REST API (e.g. https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME/chat/completions?api-version=2023-05-15) |
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI API key |

Environment variables can optionally be set by creating a `.env` file in the root directory of the project.

## Step 4: Run the examples.
Examples can be found in `build/examples`. To run an example interactively, type `node <example-name>` in the example's build directory and enter requests when prompted. Type 'quit' or 'exit' to end the session. To run an example with an input file, type `node <example-name> <input-filename>`.