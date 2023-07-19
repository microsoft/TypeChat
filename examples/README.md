
To see TypeChat in action, check out the examples found in this directory. Each example shows how TypeChat handles natural language input and maps to validated TypeScript or Python types as output.


| Name | Description | Features |
| ---- | ----------- | -------- |
| [Sentiment](https://github.com/microsoft/TypeChat/tree/main/examples/sentiment) | Categorize the sentiment of user input as negative, neutral, or positive. | Match user intent to a set of nouns. | 
| [Coffee Shop](https://github.com/microsoft/TypeChat/tree/main/examples/coffeeShop) | Intelligent agent for a coffee shop. | Capturing user intent as a set of nouns, in this case, the items in a coffee order. |
| [Calendar](https://github.com/microsoft/TypeChat/tree/main/examples/calendar) | Natural language calendar modification. | Capture user intent as a sequence of actions. | 
| [Restaurant](https://github.com/microsoft/TypeChat/tree/main/examples/restaurant) | Intelligent agent for a generic restaurant. | Captures user intent as a set of nouns, but with more complex linguistic input, illustrating the line between simpler and more advanced language models in handling compound sentences, distractions, and corrections. This example also shows how we can use TypeScript to simplify creation of a user intent summary. |
| [Math](https://github.com/microsoft/TypeChat/tree/main/examples/math) | Translate simple calculations into a simple program given an API that can perform the 4 basic mathematical operators | Program generation based on an API schema. |
| [Music](https://github.com/microsoft/TypeChat/tree/main/examples/music) | Natural language app for playing music, creating playlists, etc. using Spotify. | Captures user intent as actions in JSON which correspond to a simple dataflow program over an API provided in the intent schema. |

## Step 1: Configure your development environment

### Option 1: Local Machine

You can experiment with these TypeChat examples on your local machine with just Node.js.

1. Ensure [Node.js (18.16.0 LTS or newer)](https://nodejs.org/en) or newer is installed.
2. Clone the repo with `git clone https://github.com/microsoft/TypeChat.git`. `cd` to the root of the repo.
3. Install packages with `npm install`.

### Option 2: GitHub Codespaces

GitHub Codespaces enables you to try TypeChat quickly in a development environment hosted in the cloud.

On the TypeChat repository page:

1. Click the green button labeled `<> Code`
2. Select the `Codespaces` tab.
3. Click the green `Create codespace` button.

<details>
<summary>If this is your first time creating a codespace, read this.</summary>

If this is your first time creating a codespace on this repository, GitHub will take a moment to create a dev container image for your session.
Once the image has been created, the browser will load Visual Studio Code in a developer environment automatically configured with the necessary prerequisites, TypeChat cloned, and packages installed.

Remember that you are running in the cloud, so all changes you make to the source tree must be committed and pushed before destroying the codespace. GitHub accounts are usually configured to automatically delete codespaces that have been inactive for 30 days.

For more information, see the [GitHub Codespaces Overview](https://docs.github.com/en/codespaces/overview)
</details>

## Step 2: Build TypeChat

Build TypeChat within the repository root.

```
npm run build
```

## Step 3: Configure environment variables

Currently, the examples are running on OpenAI or Azure OpenAI endpoints.
To use an OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `OPENAI_MODEL`| The OpenAI model name (e.g. `gpt-3.5-turbo` or `gpt-4`) |
| `OPENAI_API_KEY` | Your OpenAI API key |

To use an Azure OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `AZURE_OPENAI_ENDPOINT` | The full URL of the Azure OpenAI REST API (e.g. `https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME/chat/completions?api-version=2023-05-15`) |
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI API key |

We recommend setting environment variables by creating a `.env` file in the root directory of the project that looks like the following:

```
# For OpenAI
OPENAI_MODEL=...
OPENAI_API_KEY=...

# For Azure OpenAI
AZURE_OPENAI_ENDPOINT=...
AZURE_API_KEY=...
```

## Step 4: Run the examples

Examples can be found in the `examples` directory.
To run an example interactively, type `node ./dist/main.js` from the example's directory and enter requests when prompted.
Type `quit` or `exit` to end the session.

Note that there are various sample `.txt` input files provided in each `src` directory that can give a sense of what commands you can run.
To run an example with an input file, run `node ./dist/main.js <input-file-path>`.
For example, in the coffee shop directory, you can run:

```
node ./dist/main.js ./dist/orders.txt
```

<!-- TODO: Discuss ts-node etc. -->