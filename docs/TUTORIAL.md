# Getting Started with CHAIR

Complete setup and usage guide for CHAIR — a library for qualitative data analysis using LLMs and human-AI collaboration.

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
scripts\setup.bat

# Linux/macOS
./scripts/setup.sh
```

3. Configure API keys when prompted for your preferred LLM providers. For Google AI, get your API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

The setup script will:
- Check Node.js installation (v20+)
- Create `.env` file with API keys
- Install Node.js dependencies
- Build the project
- Setup Python virtual environment
- Install Python dependencies

## Running Examples

After setup, run the included examples directly:
```bash
# Windows
scripts\run.bat examples\example-automatic.ts

# Unix/macOS
./scripts/run.sh examples/example-automatic.ts
```

Available examples:
- `examples/example-automatic.ts` — Automatic inductive analysis (processes txt-data)
- `examples/example-interactive.ts` — Interactive inductive analysis (processes docx-data, with user input)
- `examples/example-deductive.ts` — Deductive analysis with predefined codebook

For development (rebuilds the project before running):
```bash
# Windows
scripts\run.bat --dev examples\example-automatic.ts

# Unix/macOS
./scripts/run.sh --dev examples/example-automatic.ts
```

## Configuration

### Supported LLM Providers
OpenAI GPT, Google Gemini, Anthropic Claude, Groq, Ollama, MistralAI

Configure API keys in the `.env` file. See `.env.example` for the required variables.

### Supported Embedders
OpenAI embeddings, local models, custom implementations. An embedder is required for the consolidation and evaluation steps.

### Quick Configuration Example
```typescript
import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import { QAJob } from "../src/job.js";
import { LoadJsonStep } from "../src/loading/load-json-step.js";
import { CodeStep } from "../src/steps/code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { EvaluateStep } from "../src/steps/evaluate-step.js";

const load = new LoadJsonStep({ path: "./data" });
const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelAnalyzerAny],
    model: ["gpt-5.4-mini"],
});
const consolidate = new ConsolidateStep({ model: ["gpt-5.4-mini"] });
const evaluate = new EvaluateStep({ consolidator: consolidate, subdir: "evaluation" });

const job = new QAJob({
    embedder: "openai-small-512",
    steps: [load, code, consolidate, evaluate],
    parallel: true,
});
await job.execute();
```

To customize, modify `examples/example-automatic.ts` and re-run with the run script.

## Tutorials

Detailed guides for each workflow:

- **[Data Preparation](./TUTORIAL-DATA.md)** — Convert TXT, DOCX, QDPX, or other formats into CHAIR's data format
- **[Human Coding with Spreadsheets](./TUTORIAL-SPREADSHEET.md)** — Generate Excel templates for human coders and import results
- **[Inductive Coding](./TUTORIAL-INDUCTIVE.md)** — AI-powered code generation from data (no predefined codebook)
- **[Deductive Coding](./TUTORIAL-DEDUCTIVE.md)** — Apply predefined codebooks to data using LLMs

## Troubleshooting

### Common Issues
- **API Key Configuration**: Ensure your LLM provider API keys are set in `.env`
- **Node.js Version**: Verify you're using Node.js v20 or later (`node --version`)
- **Python Dependencies**: Check that all Python packages are installed correctly
- **Build Errors**: Use `--dev` flag when running experiments to rebuild after source changes

### Getting Help
- Report issues on [GitHub Issues](https://github.com/CIVITAS-John/CHAIR/issues)
- Join discussions in [GitHub Discussions](https://github.com/CIVITAS-John/CHAIR/discussions)
