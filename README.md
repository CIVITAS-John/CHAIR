# CHAIR: A Library for **C**ollaborative **H**uman-**AI** **I**nductive **R**esearch

CHAIR is a comprehensive library for conducting inductive qualitative data analysis using Large Language Models (LLMs) and human-AI collaboration.

## Overview

CHAIR provides a complete pipeline for inductive qualitative data analysis, featuring:

- **Flexible Data Input**: Support for text files, Word documents, and structured data formats
- **AI-Powered Coding**: Support for multiple LLM providers (OpenAI, Google, Anthropic, Groq, Ollama, etc.)
- **Multiple Coding Strategies**: Item-level, chunk-level, and specialized analysis approaches
- **Human-AI Collaboration**: Interactive and automatic modes for coding and consolidation
- **Advanced Consolidation**: Smart merging and refinement of coding results
- **Evaluation Framework**: Network-based evaluation and visualization tools
- **Multi-step Analysis Pipeline**: Complete Load → Code → Consolidate → Evaluate workflow

## Analysis Pipeline

### 1. Load Step
Load your qualitative data from various sources:
- Text files, Word documents, Excel spreadsheets
- REFI-QDA QDPX files (ATLAS.ti, NVivo, MAXQDA)
- Structured JSON with `configuration.js`

### 2. Code Step
Apply coding strategies — inductive, deductive, or both:
- **Inductive (AI)**: Item-level, chunk-level, and verb-based analysis strategies
- **Deductive (AI)**: Apply predefined codebooks with three-pass verification
- **Human**: Import codes from Excel spreadsheets or DOCX comments
- **Ensemble**: Combine multiple coders via weighted voting for robustness

### 3. Consolidate Step
Merge and refine coding results:
- **Simple Merger**: Embedding-based label deduplication
- **Refine Merger**: LLM-powered semantic merging with definitions
- **Definition Generator**: Auto-generate code descriptions
- For deductive coding: collect codebooks for comparison without merging

### 4. Evaluate / Reliability Step
Assess and visualize results:
- **Evaluate**: Network analysis, coverage assessment, interactive visualization
- **Reliability**: Krippendorff's Alpha, percent agreement, per-code precision/recall

## Quick Start

📖 **See [TUTORIAL.md](TUTORIAL.md) for complete installation and usage instructions**

### Prerequisites
- [Node.js](https://nodejs.org/en/download) (v20 or later)
- [Python](https://www.python.org/downloads/) (v3.12 or later)

### Installation
```bash
git clone https://github.com/CIVITAS-John/CHAIR.git
cd CHAIR

# Windows
scripts\setup.bat

# Unix/Mac
./scripts/setup.sh
```

The setup script will:
- Check Node.js installation (v20+)
- Create .env file with API keys
- Install Node.js dependencies
- Build the project
- Setup Python virtual environment
- Install Python dependencies

### Running Example Analysis

After installation, run the provided examples to see the framework in action:

```bash
# Windows
scripts\run.bat examples\example-automatic.ts
scripts\run.bat examples\example-interactive.ts
scripts\run.bat examples\example-deductive.ts

# Unix/macOS
./scripts/run.sh examples/example-automatic.ts
./scripts/run.sh examples/example-interactive.ts
./scripts/run.sh examples/example-deductive.ts
```

## Development

### Building & Running
```bash
npm run build                                          # Build main library
./scripts/run.sh --dev examples/example-automatic.ts   # Rebuild + run experiment
```

### Code Quality
```bash
npm run lint         # Run ESLint and Prettier
npm run format       # Auto-fix formatting issues
```

### Project Structure

```
src/
├── coding/           # Analysis strategies and implementations
├── consolidating/    # Code merging and consolidation logic
├── evaluating/       # Evaluation metrics and visualization
├── loading/         # Data loading implementations
├── steps/           # Pipeline step definitions
├── utils/           # Utilities for LLMs, embeddings, file
examples/            # Example configurations and data
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

## License

CHAIR is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License. See [LICENSE.md](LICENSE.md) for details.

## Citation

If you use this software in your research, please cite:

```bibtex
@software{chen2025chair,
  title={CHAIR: A Library for Collaborative Human-AI Inductive Qualitative Research},
  author={Chen, John and Zhang, Yanjia and Cheng, Sihan},
  year={2025},
  institution={Northwestern University},
  url={https://github.com/CIVITAS-John/CHAIR}
}
```

## Documentation

- 📖 [Getting Started](docs/TUTORIAL.md) — Installation, setup, and quick start
- 📂 [Data Preparation](docs/TUTORIAL-DATA.md) — Convert TXT, DOCX, QDPX, or other formats
- 📊 [Human Coding with Spreadsheets](docs/TUTORIAL-SPREADSHEET.md) — Generate Excel templates for human coders
- 🤖 [Inductive Coding](docs/TUTORIAL-INDUCTIVE.md) — AI-powered code generation from data
- 📋 [Deductive Coding](docs/TUTORIAL-DEDUCTIVE.md) — Apply predefined codebooks using LLMs

## Support

- 🐛 Report issues on [GitHub Issues](https://github.com/CIVITAS-John/CHAIR/issues)
- 💬 Join discussions in [GitHub Discussions](https://github.com/CIVITAS-John/CHAIR/discussions)

## Contributors

- **John Chen**, Northwestern University - [civitas@u.northwestern.edu](mailto:civitas@u.northwestern.edu)
- **Yanjia Zhang**, Northwestern University - [fzhang@u.northwestern.edu](mailto:fzhang@u.northwestern.edu)
- **Sihan Cheng**, Northwestern University - [sihancheng2026@u.northwestern.edu](mailto:sihancheng2026@u.northwestern.edu)