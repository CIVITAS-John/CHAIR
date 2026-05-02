# AI-Powered Inductive Coding

Generate qualitative codes from your data using LLMs — no predefined codebook needed.

## What You'll Learn
- How inductive coding works in CHAIR
- Available analysis strategies and when to use each
- How to configure `CodeStep` with `agent: "AI"`
- How to consolidate codes with `SimpleMerger`, `DefinitionGenerator`, and `RefineMerger`
- Interactive vs. automatic consolidation
- The complete Load → Code → Consolidate → Evaluate pipeline

## Prerequisites
- A prepared dataset (see [TUTORIAL-DATA.md](./TUTORIAL-DATA.md))
- API keys configured for at least one LLM provider (see [TUTORIAL.md](./TUTORIAL.md))

## The Pipeline

```
Load → Code (AI) → Consolidate → Evaluate
```

In inductive coding, codes **emerge from the data** rather than being predefined. CHAIR uses LLMs to perform open coding on each item, then consolidates overlapping codes into a unified codebook.

## Step 1: Loading Data

```typescript
import { LoadJsonStep } from "../src/loading/load-json-step.js";

const load = new LoadJsonStep({ path: "./examples/txt-data" });
```

See [TUTORIAL-DATA.md](./TUTORIAL-DATA.md) for details on preparing your data.

## Step 2: Coding with AI

### Analysis Strategies

| Strategy | Import | Best For |
|----------|--------|----------|
| `ItemLevelAnalyzerAny` | `../src/coding/item-level-any.js` | General exploratory coding — any label format |
| `ItemLevelAnalyzerVerb` | `../src/coding/item-level-verb.js` | Process-oriented analysis — gerund-based codes (e.g., "expressing frustration") |

**Custom strategies** can be created by passing options to an analyzer constructor:

```typescript
new ItemLevelAnalyzerAny({
    name: "item-flooding",
    prompt: "Special requirement: always generate more than 20 phrases for each message.",
})
```

Multiple strategies run independently and produce separate codebooks, which are merged during consolidation.

### Model Selection

```typescript
// Single model
model: ["gpt-4o"]

// Multiple models — each produces separate results
model: ["gpt-4o", "gemini-2.0-flash"]
```

Supported providers: OpenAI GPT, Google Gemini, Anthropic Claude, Groq, Ollama, MistralAI.

### AI Parameters

```typescript
const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelAnalyzerAny],
    model: ["gpt-4o"],
    parameters: {
        temperature: 0.5,       // LLM creativity (0-2)
        retries: 3,             // Retry failed requests
        customPrompt: "Focus on emotional language.",  // Extra instructions
        contextWindow: 5,       // Previous messages for context (0=none, -1=all)
        fakeRequest: false,     // Skip LLM calls for testing
        alias: "emotional",     // Appended to filename for identification
    },
});
```

### Complete CodeStep Example

```typescript
import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import ItemLevelAnalyzerVerb from "../src/coding/item-level-verb.js";
import { CodeStep } from "../src/steps/code-step.js";

const code = new CodeStep({
    agent: "AI",
    strategy: [
        ItemLevelAnalyzerAny,
        ItemLevelAnalyzerVerb,
        new ItemLevelAnalyzerAny({
            name: "item-flooding",
            prompt: "Special requirement: always generate more than 20 phrases for each message.",
        }),
    ],
    model: ["gpt-4o"],
});
```

## Step 3: Consolidation

Multiple strategies produce many overlapping codes. `ConsolidateStep` merges them into a unified codebook.

### Consolidators

| Consolidator | What It Does | Uses LLM? |
|-------------|-------------|-----------|
| `SimpleMerger` | Clusters codes by label similarity using embeddings; picks shortest label | No |
| `DefinitionGenerator` | Generates definitions for codes that lack them | Yes |
| `RefineMerger` | Clusters by label + definition similarity, then LLM-refines merged codes | Yes |

### Configuration

```typescript
import { SimpleMerger } from "../src/consolidating/simple-merger.js";
import { DefinitionGenerator } from "../src/consolidating/definition-generator.js";
import { RefineMerger } from "../src/consolidating/refine-merger.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";

const consolidate = new ConsolidateStep({
    model: ["gpt-4o"],
    builderConfig: {
        consolidators: [
            // Pass 1: Deduplicate similar labels (no LLM cost)
            new SimpleMerger({ looping: true }),
            // Pass 2: Generate definitions for undescribed codes
            new DefinitionGenerator(),
            // Pass 3: Merge semantically similar codes (moderate threshold)
            new RefineMerger({ maximum: 0.5, minimum: 0.4, looping: true }),
            // Pass 4: More aggressive merging (higher threshold)
            new RefineMerger({ maximum: 0.6, minimum: 0.4, looping: true }),
        ],
    },
});
```

- `looping: true` — repeat until no more merges are found
- `maximum` / `minimum` — clustering thresholds (higher = more aggressive merging)

### Interactive vs. Automatic

Add `interactive: true` to any consolidator to manually approve merges:

```typescript
new SimpleMerger({ looping: true, interactive: true })
```

Interactive mode shows a dendrogram and lets you select the merge threshold. Compare `examples/example-automatic.ts` (fully automatic) with `examples/example-interactive.ts` (interactive consolidation).

## Step 4: Evaluation

```typescript
import { EvaluateStep } from "../src/steps/evaluate-step.js";

const evaluate = new EvaluateStep({
    consolidator: consolidate,
    subdir: "evaluation",
});
```

Generates comparison metrics and network visualizations in `<dataset>/evaluation/`.

## Putting It All Together

Complete pipeline from `examples/example-automatic.ts`:

```typescript
import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import ItemLevelAnalyzerVerb from "../src/coding/item-level-verb.js";
import { DefinitionGenerator } from "../src/consolidating/definition-generator.js";
import { RefineMerger } from "../src/consolidating/refine-merger.js";
import { SimpleMerger } from "../src/consolidating/simple-merger.js";
import { QAJob, type QAJobConfig } from "../src/job.js";
import { LoadJsonStep } from "../src/loading/load-json-step.js";
import { CodeStep } from "../src/steps/code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { EvaluateStep } from "../src/steps/evaluate-step.js";

const load = new LoadJsonStep({ path: "./examples/txt-data" });

const code = new CodeStep({
    agent: "AI",
    strategy: [
        ItemLevelAnalyzerAny,
        ItemLevelAnalyzerVerb,
        new ItemLevelAnalyzerAny({
            name: "item-flooding",
            prompt: "Special requirement: always generate more than 20 phrases for each message.",
        }),
    ],
    model: ["gpt-4o"],
});

const consolidate = new ConsolidateStep({
    model: ["gpt-4o"],
    builderConfig: {
        consolidators: [
            new SimpleMerger({ looping: true }),
            new DefinitionGenerator(),
            new RefineMerger({ maximum: 0.5, minimum: 0.4, looping: true }),
            new RefineMerger({ maximum: 0.6, minimum: 0.4, looping: true }),
        ],
    },
});

const evaluate = new EvaluateStep({
    consolidator: consolidate,
    subdir: "evaluation",
});

const config: QAJobConfig = {
    embedder: "openai-small-512",       // Required for consolidation/evaluation
    steps: [load, code, consolidate, evaluate],
    parallel: true,                      // Parallelize within steps
};

const job = new QAJob(config);
await job.execute();
```

## Understanding the Output

After execution, the dataset folder contains:

```
my-dataset/
├── item-any/           # Results from ItemLevelAnalyzerAny
│   ├── *.json          # Coded threads (JSON)
│   └── *.xlsx          # Coded threads (Excel)
├── item-verb/          # Results from ItemLevelAnalyzerVerb
├── item-flooding/      # Results from custom strategy
├── references/         # Consolidated reference codebook
└── evaluation/         # Evaluation results and visualizations
```

## Tips
- **Start small**: Test with a few chunks before running on your full dataset
- **Use `fakeRequest: true`** to test pipeline structure without LLM costs
- **Multiple strategies** give richer initial codes for better consolidation
- **Adjust thresholds**: Lower `RefineMerger` thresholds = more conservative merging

## Next Steps
- [Deductive Coding](./TUTORIAL-DEDUCTIVE.md) — Apply predefined codebooks
- [Human Coding with Spreadsheets](./TUTORIAL-SPREADSHEET.md) — Combine with human coding
