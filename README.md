# Generative AI-driven Qualitative Analysis
Documentation in progress...

# Installation
Please install the latest [https://nodejs.org/en](node.js); and [https://python.org](python).
Then, run the following command in your terminal at this folder:
```
pip install -r requirements.txt
npm install
npm install -D typescript
```

# API Access
To run the code in this repository, you need to create the `.env` file in the repository folder with the following:

```
OPENAI_API_KEY={Your OpenAI API Key}
ANTHROPIC_API_KEY={Your Anthropic API Key}
MISTRAL_API_KEY={Your Mistral API Key}
GROQ_API_KEY={Your Groq API Key} # for llama3 series models
GOOGLE_API_KEY={Your Google API Key} # for gecko embedding models
DATASET_PATH=./examples # or the root path to your datasets
```

For Google API, get the key at [https://aistudio.google.com/app/u/1/apikey](Google AI Studio).

# Run the example analysis
Now, please go to `./examples/code-evaluate.ts`. If you are using Visual Studio Code, use `Run` => `Start Debugging` on the file. If you only have an API key for OpenAI, please change `gecko-768-similarity` to `openai-large-1024`. The performance of the evaluation/visualization would be slightly worse, though.

# Troubleshooting
## macOS
If you are using macOS and have issues with Python or Node.js, try using [https://brew.sh/](Homebrew). Then:
`
brew install python
brew install node
brew install cargo-c
python3 -m venv .venv
source .venv/bin/activate
python3 -m ensurepip --upgrade
python3 -m pip install setuptools
python3 -m pip install -r requirements.txt
`