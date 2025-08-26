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
- Text files
- Word documents (with qualitative codes as comments)
- Excel Spreadsheets (with qualitative codes)

### 2. Code Step
Apply Generative AI coding strategies:
- **Item-Level Analysis**: Individual data item analysis
- **Chunk-Level Analysis**: Process larger text segments
- **BERTopic Integration**: Automatic topic modeling

In parallel or alternatively, load human coding results.

### 3. Consolidate Step
Merge and refine coding results:
- **Simple Merger**: Basic consolidation
- **Refine Merger**: Similarity-based merging
- **Definition Generator**: Auto-generate code descriptions

### 4. Evaluate Step
Assess and visualize results:
- **Network Analysis**: Graph-based coding relationships
- **Coverage Analysis**: Completeness assessment
- **Interactive Visualization**: Web-based exploration

## Quick Start

📖 **See [TUTORIAL.md](TUTORIAL.md) for complete installation and usage instructions**

### Prerequisites
- [Node.js](https://nodejs.org/en/download) (v20 or later)
- [Python](https://www.python.org/downloads/) (v3.12 or later)

### Installation
```bash
git clone https://github.com/CIVITAS-John/CHAIR.git
cd CHAIR
./setup.sh  # or setup.bat on Windows
```

### Running Example Analysis

After installation, you can run the provided examples to see the framework in action:

```bash
# Build the project with examples
pnpm run build:examples

# Run automatic analysis (processes txt-data)
node out/examples/example-automatic.js

# Run interactive analysis (processes docx-data with user input)
node out/examples/example-interactive.js
```

## Development

### Building
```bash
pnpm run build        # Build main project
pnpm run build:examples    # Build with examples
pnpm run build:workspaces  # Build with workspaces
```

### Code Quality
```bash
pnpm run lint         # Run ESLint and Prettier
pnpm run format       # Auto-fix formatting issues
```

### Project Structure

```
src/
├── coding/           # Analysis strategies and implementations
├── consolidating/    # Code merging and consolidation logic
├── evaluating/       # Evaluation metrics and visualization
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

## Support

- 📖 See [TUTORIAL.md](docs/TUTORIAL.md) for detailed setup and usage instructions
- 🐛 Report issues on [GitHub Issues](https://github.com/CIVITAS-John/CHAIR/issues)
- 💬 Join discussions in [GitHub Discussions](https://github.com/CIVITAS-John/CHAIR/discussions)

## Contributors

- **John Chen**, Northwestern University - [civitas@u.northwestern.edu](mailto:civitas@u.northwestern.edu)
- **Yanjia Zhang**, Northwestern University - [fzhang@u.northwestern.edu](mailto:fzhang@u.northwestern.edu)
- **Sihan Cheng**, Northwestern University - [sihancheng2026@u.northwestern.edu](mailto:sihancheng2026@u.northwestern.edu)