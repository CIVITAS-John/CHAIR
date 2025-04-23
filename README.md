# Generative AI-driven Qualitative Analysis

Documentation in progress...

## Setup

First, please ensure that [Node.js (v20 or later)](https://nodejs.org/en/download) and [Python (v3.13 or later)](https://www.python.org/downloads/) are installed.

Obtain a copy of the code either by [downloading the zip file directly](https://github.com/CIVITAS-John/LLM-Qualitative-Analysis/archive/refs/heads/next.zip) or cloning:

```bash
git clone https://github.com/CIVITAS-John/LLM-Qualitative-Analysis.git
cd LLM-Qualitative-Analysis
```

Depending on your operating system, run the setup script at `setup.bat` (Windows) or `setup.sh` (Linux/macOS), located in the root directory of the repository. This script will install all necessary dependencies and set up the environment for you.

You will be asked to enter an API key for each of the available service backends. If not applicable, leave it empty. For the Google API, get the API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

## Run the example analysis

The setup script should build the project, including the example analysis. If you cannot see the `out/examples` folder, please try running the following command:

```bash
pnpm run build
```

If you wish to make adjustments to the models or the embedder used, please modify the `examples/job-config.ts` file. Once you have made the changes, run the above command again to rebuild the project.

To run the example analysis, run the following command in the root directory of the repository:

```bash
node out/examples/job-config.js
```

## Creating a job configuration

// TODO: Add a detailed description of the job configuration file and its parameters.
