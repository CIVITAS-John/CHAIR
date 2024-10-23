# Generative AI-driven Qualitative Analysis
Documentation in progress...

# Installation
Please install the latest `node.js` from [https://nodejs.org/en](the official website).
Then, in the terminal of this folder, run `npm install`.

# API Access
To run the code in this repository, you need to create the `.env` file in the repository folder with the following:

```
OPENAI_API_KEY={Your OpenAI API Key}
ANTHROPIC_API_KEY={Your Anthropic API Key}
MISTRAL_API_KEY={Your Mistral API Key}
GROQ_API_KEY={Your Groq API Key} # for llama3 series models
GOOGLE_API_KEY={Your Google API Key} # for gecko embedding models
DATASET_PATH={The root to the dataset path}
```

For Google API, get the key at https://aistudio.google.com/app/u/1/apikey

# Run the example analysis
Now, please go to `./examples/code-evaluate.ts`. If you are using Visual Studio Code, use `Run` => `Start Debugging` on the file.