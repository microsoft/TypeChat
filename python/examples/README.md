
To see TypeChat in action, check out the examples found in this directory.

Each example shows how TypeChat handles natural language input, and maps to validated JSON as output. Most example inputs run on both GPT 3.5 and GPT 4.
We are working to reproduce outputs with other models.
Generally, models trained on both code and natural language text have high accuracy.

We recommend reading each example in the following order.


| Name | Description |
| ---- | ----------- |
| [Sentiment](https://github.com/microsoft/TypeChat/tree/main/python/examples/sentiment) | A sentiment classifier which categorizes user input as negative, neutral, or positive. This is TypeChat's "hello world!" |
| [Coffee Shop](https://github.com/microsoft/TypeChat/tree/main/python/examples/coffeeShop) | An intelligent agent for a coffee shop. This sample translates user intent is translated to a list of coffee order items.
| [Calendar](https://github.com/microsoft/TypeChat/tree/main/python/examples/calendar) | An intelligent scheduler. This sample translates user intent into a sequence of actions to modify a calendar. |
| [HealthData](https://github.com/microsoft/TypeChat/tree/main/python/examples/healthData) | The Health Data Agent shows how strongly typed **agents with history** could interact with a user to collect information needed for one or more data types ("form filling"). |
| [Restaurant](https://github.com/microsoft/TypeChat/tree/main/python/examples/restaurant) | An intelligent agent for taking orders at a restaurant. Similar to the coffee shop example, but uses a more complex schema to model more complex linguistic input. The prose files illustrate the line between simpler and more advanced language models in handling compound sentences, distractions, and corrections. This example also shows how we can use TypeScript to provide a user intent summary. |
| [Math](https://github.com/microsoft/TypeChat/tree/main/python/examples/math) | Translate calculations into simple programs given an API that can perform the 4 basic mathematical operators. This example highlights TypeChat's program generation capabilities. |
| [MultiSchema](https://github.com/microsoft/TypeChat/tree/main/python/examples/multiSchema) | This application demonstrates a simple way to write a **super-app** that automatically routes user requests to child apps. |
| [Music](https://github.com/microsoft/TypeChat/tree/main/python/examples/music) | An app for playing music, creating playlists, etc. on Spotify through natural language. Each user intent is translated into a series of actions in JSON which correspond to a simple dataflow program, where each step can consume data produced from previous step. |

## Step 1: Configure your development environment

### Option 1: Local Machine

You can experiment with these TypeChat examples on your local machine.

You will need [Python >=3.11](https://www.python.org/downloads/) and [hatch](https://hatch.pypa.io/1.6/install/).

```sh
git clone https://github.com/microsoft/TypeChat
cd TypeChat/python
hatch shell
python examples/sentiment/demo.py
```

Alternatively, you can just use `venv` and `pip`:

```sh
git clone https://github.com/microsoft/TypeChat
cd TypeChat/python
python -m venv ../.venv

# Activate the virtual environment
# Windows
../.venv/Scripts/Activate.ps1
# Unix/POSIX
source ../.venv/bin/activate

pip install .[examples]

python examples/sentiment/demo.py
```

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

## Step 2: Configure environment variables

Currently, the examples are running on OpenAI or Azure OpenAI endpoints.
To use an OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `OPENAI_MODEL`| The OpenAI model name (e.g. `gpt-3.5-turbo` or `gpt-4`) |
| `OPENAI_API_KEY` | Your OpenAI API key  |
| `OPENAI_ENDPOINT` | OpenAI API Endpoint - *optional*,  defaults to `"https://api.openai.com/v1/chat/completions"` |
| `OPENAI_ORGANIZATION` | OpenAI Organization - *optional*, defaults to `""` |

To use an Azure OpenAI endpoint, include the following environment variables:

| Variable | Value |
|----------|-------|
| `AZURE_OPENAI_ENDPOINT` | The full URL of the Azure OpenAI REST API (e.g. `https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME/chat/completions?api-version=2023-05-15`) |
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI API key |

We recommend setting environment variables by creating a `.env` file in the root directory of the project that looks like the following:

```ini
# For OpenAI
OPENAI_MODEL=...
OPENAI_API_KEY=...

# For Azure OpenAI
AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_API_KEY=...
```

## Step 3: Run the examples

Examples can be found in the `examples` directory.

To run an example interactively, type `python examples/<example_name>/demo.py` from the example's directory and enter requests when prompted. Type `quit` or `exit` to end the session. You can also open in VS Code the selected example's directory and press <kbd>F5</kbd> to launch it in debug mode.

Note that there are various sample "prose" files (e.g. `input.txt`) provided in each `src` directory that can give a sense of what you can run.

To run an example with one of these input files, run `python demo.py <input-file-path>`.
For example, in the `coffeeShop` directory, you can run:

```
python demo.py input.txt
```