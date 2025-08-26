# LLM Qualitative Analysis

A comprehensive library for conducting inductive qualitative data analysis using Large Language Models (LLMs) and human-AI collaboration.

## Overview

This tool provides a complete pipeline for inductive qualitative data analysis, featuring:

- **Multi-step Analysis Pipeline**: Load, code, consolidate, and evaluate qualitative data
- **AI-Powered Coding**: Support for multiple LLM providers (OpenAI, Google, Anthropic, Groq, Ollama, etc.)
- **Human-AI Collaboration**: Interactive and automatic modes for coding and consolidation
- **Multiple Coding Strategies**: Item-level, chunk-level, and specialized analysis approaches
- **Advanced Consolidation**: Smart merging and refinement of coding results
- **Evaluation Framework**: Network-based evaluation and visualization tools
- **Flexible Data Input**: Support for text files, Word documents, and structured data formats

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
git clone https://github.com/CIVITAS-John/LLM-Qualitative-Analysis.git
cd LLM-Qualitative-Analysis
./setup.sh  # or setup.bat on Windows
```

## Project Structure

```
src/
├── coding/           # Analysis strategies and implementations
├── consolidating/    # Code merging and consolidation logic
├── evaluating/       # Evaluation metrics and visualization
├── steps/           # Pipeline step definitions
├── utils/           # Utilities for LLMs, embeddings, file 
examples/            # Example configurations and data
```

## Configuration

The framework supports extensive configuration options:

- **LLM Models**: OpenAI GPT, Google Gemini, Anthropic Claude, Groq, Ollama, MistralAI
- **Embedders**: OpenAI embeddings, local models, custom implementations
- **Data Formats**: Plain text, Word documents, structured JSON/Excel
- **Analysis Modes**: Automatic, interactive, hybrid approaches
- **Parallel Processing**: Multi-threaded execution for large datasets

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

### Documentation
```bash
pnpm run docs         # Generate TypeDoc documentation
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License. See [LICENSE.md](LICENSE.md) for details.

## Citation

If you use this software in your research, please cite:

## Support

- 📖 See [TUTORIAL.md](TUTORIAL.md) for detailed setup and usage instructions
- 🐛 Report issues on [GitHub Issues](https://github.com/CIVITAS-John/LLM-Qualitative-Analysis/issues)
- 💬 Join discussions in [GitHub Discussions](https://github.com/CIVITAS-John/LLM-Qualitative-Analysis/discussions)

## Contributors

- **John Chen** - [civitas@u.northwestern.edu](mailto:civitas@u.northwestern.edu)
- **Frank Zhang** - [fzhang@u.northwestern.edu](mailto:fzhang@u.northwestern.edu)
- **Sihan Cheng** - [fzhang@u.northwestern.edu](mailto:fzhang@u.northwestern.edu)