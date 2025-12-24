# LLM Qualitative Analysis Tutorial

Complete setup and usage guide for conducting inductive qualitative data analysis using Large Language Models and human-AI collaboration.

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/en/download) (v20 or later)
- [Python](https://www.python.org/downloads/) (v3.12 or later)

### Quick Setup
1. Clone the repository:
```bash
git clone https://github.com/CIVITAS-John/CHAIR.git
cd CHAIR
```

2. Run the setup script:
```bash
# Windows
setup.bat

# Linux/macOS
./setup.sh
```

3. Configure API keys when prompted for your preferred LLM providers. For Google AI, get your API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

## Usage
### Running Examples
After setup, run the included examples:
```bash
# Build the project
pnpm run build

# Run example analysis
node out/examples/job-config.js

# Run automatic analysis example
node out/examples/example-automatic.js

# Run interactive analysis example  
node out/examples/example-interactive.js
```

## Configuration Options

The framework supports extensive configuration:

- **LLM Models**: OpenAI GPT, Google Gemini, Anthropic Claude, Groq, Ollama, MistralAI
- **Embedders**: OpenAI embeddings, local models, custom implementations
- **Data Formats**: Plain text, Word documents, structured JSON/Excel
- **Analysis Modes**: Automatic, interactive, hybrid approaches
- **Parallel Processing**: Multi-threaded execution for large datasets

To customize models or embedders, modify the `examples/example-automatic.ts` file and rebuild.

### Configuration Example
```typescript
import { QAJob } from "./src/job.js";
import { LoadJsonStep } from "./src/loading/load-json-step.js";
import { CodeStep } from "./src/steps/code-step.js";
import { ConsolidateStep } from "./src/steps/consolidate-step.js";
import { EvaluateStep } from "./src/steps/evaluate-step.js";

const config = {
    embedder: "openai-small-512",
    steps: [
        new LoadJsonStep({ path: "./data" }),
        new CodeStep({
            agent: "AI",
            strategy: ["item-level-any"],
            model: ["gpt-4o"]
        }),
        new ConsolidateStep({ model: ["gpt-4o"] }),
        new EvaluateStep({ subdir: "evaluation" })
    ],
    parallel: true
};

const job = new QAJob(config);
await job.execute();
```

## Troubleshooting

### Common Issues
- **API Key Configuration**: Ensure your LLM provider API keys are properly set
- **Node.js Version**: Verify you're using Node.js v20 or later
- **Python Dependencies**: Check that all Python packages are installed correctly
- **Build Errors**: Run `pnpm run build` after making changes

### Getting Help
- 🐛 Report issues on [GitHub Issues](https://github.com/CIVITAS-John/CHAIR/issues)
- 💬 Join discussions in [GitHub Discussions](https://github.com/CIVITAS-John/CHAIR/discussions)
