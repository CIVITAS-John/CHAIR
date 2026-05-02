# Deductive Coding with Predefined Codebooks

Apply a predefined codebook to your data using LLMs — codes are selected from your scheme, not generated.

## What You'll Learn
- How deductive coding differs from inductive coding
- How to prepare and format a codebook
- How to configure `CodeStep` with a predefined codebook
- The three-pass analysis strategy
- How to use substeps for category-filtered multi-pass coding

## Prerequisites
- A prepared dataset (see [TUTORIAL-DATA.md](./TUTORIAL-DATA.md))
- A predefined codebook (JSON file or `Codebook` object)
- API keys configured for at least one LLM provider (see [TUTORIAL.md](./TUTORIAL.md))

## When to Use Deductive Coding
- Applying established theoretical frameworks to new data
- Validating existing coding schemes on new datasets
- Ensuring consistency across multiple studies
- Theory-driven analysis with known constructs

For exploratory analysis where codes emerge from data, see [TUTORIAL-INDUCTIVE.md](./TUTORIAL-INDUCTIVE.md).

## Codebook Format

A codebook maps code labels to their definitions:

```json
{
    "self-introduction": {
        "label": "self-introduction",
        "categories": ["Interview Process"],
        "definitions": ["The interviewee introduces themselves, their background, or qualifications"],
        "examples": [],
        "alternatives": ["self-presentation"]
    },
    "motivation": {
        "label": "motivation",
        "categories": ["Career Development"],
        "definitions": ["Discussion of what drives or motivates career or educational choices"],
        "examples": []
    }
}
```

**Key fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `label` | Yes | Primary code name (used for matching) |
| `definitions` | **Critical** | Clear explanations — codes without definitions are excluded from prompts |
| `categories` | No | Higher-level groupings (enables substep filtering) |
| `examples` | No | Example text snippets |
| `alternatives` | No | Synonym labels for the same concept |

> **Important**: Every code must have at least one definition. The LLM uses definitions to decide which codes apply.

## Loading a Codebook

### From a JSON file
```typescript
const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelCoderSimple],
    model: ["gpt-4o"],
    codebook: "./path/to/codebook.json",
});
```

### From a Codebook object
```typescript
import type { Codebook } from "../src/schema.js";

const myCodebook: Codebook = {
    "greeting": {
        label: "greeting",
        definitions: ["A welcoming or introductory statement at the start of interaction"],
    },
    "question-asking": {
        label: "question-asking",
        definitions: ["Posing a question to gather information or prompt reflection"],
    },
};

const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelCoderSimple],
    model: ["gpt-4o"],
    codebook: myCodebook,
});
```

### From a QDPX file
`LoadQdpxStep` automatically extracts codebooks from REFI-QDA projects. See [TUTORIAL-DATA.md](./TUTORIAL-DATA.md#format-3-qdpx-files-refi-qda-standard).

## The Deductive Strategy

### ItemLevelCoderSimple

```typescript
import ItemLevelCoderSimple from "../src/coding/deductive/item-level-simple.js";
```

This strategy is designed specifically for deductive coding. It instructs the LLM to:

1. **Interpret**: Understand the data following coding instructions
2. **Identify**: Select applicable codes following each code's definitions
3. **Verify**: Check whether selected codes match both instructions and definitions; eliminate mismatches

The LLM can only select codes from the predefined codebook — it cannot create new codes.

### Code Validation

After the LLM responds, selected codes are validated against the codebook using fuzzy matching (0.9 threshold). If a close match is found, the canonical label from the codebook is used. This handles minor LLM variations like capitalization or punctuation differences.

## Advanced: Substeps

For large codebooks, you can split the analysis into category-filtered passes using `substeps`. Each substep receives a filtered subset of the codebook:

```typescript
const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelCoderSimple],
    model: ["gpt-4o"],
    codebook: "./codebook.json",
    parameters: {
        substeps: [
            {
                name: "Social Codes",
                includeCategories: "Social",
            },
            {
                name: "Content Codes",
                includeCategories: "Content",
                excludeCategories: "Content > Technical",
            },
        ],
    },
});
```

- `includeCategories`: Include codes where any category starts with this prefix
- `excludeCategories`: Exclude codes where any category starts with this prefix
- When `parallel: true` in `QAJob`, substeps run concurrently
- Results are merged across substeps (codes combined per item, duplicates removed)

## Complete Pipeline Example

```typescript
import ItemLevelCoderSimple from "../src/coding/deductive/item-level-simple.js";
import { QAJob, type QAJobConfig } from "../src/job.js";
import { LoadJsonStep } from "../src/loading/load-json-step.js";
import { CodeStep } from "../src/steps/code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { EvaluateStep } from "../src/steps/evaluate-step.js";

const load = new LoadJsonStep({ path: "./my-dataset" });

const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelCoderSimple],
    model: ["gpt-4o"],
    codebook: "./codebook.json",
});

const consolidate = new ConsolidateStep({ model: ["gpt-4o"] });

const evaluate = new EvaluateStep({
    consolidator: consolidate,
    subdir: "evaluation",
});

const config: QAJobConfig = {
    embedder: "openai-small-512",
    steps: [load, code, consolidate, evaluate],
    parallel: true,
};

const job = new QAJob(config);
await job.execute();
```

## Combining Deductive and Inductive

Run both approaches in the same pipeline — `ConsolidateStep` merges all results:

```typescript
import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import ItemLevelCoderSimple from "../src/coding/deductive/item-level-simple.js";

const inductiveCode = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelAnalyzerAny],
    model: ["gpt-4o"],
});

const deductiveCode = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelCoderSimple],
    model: ["gpt-4o"],
    codebook: "./codebook.json",
});

const job = new QAJob({
    embedder: "openai-small-512",
    steps: [load, inductiveCode, deductiveCode, consolidate, evaluate],
    parallel: true,
});
```

## Tips
- **Every code needs definitions** — codes without definitions are excluded from LLM prompts
- **Use clear, unambiguous definitions** to guide the LLM accurately
- **Categories** help organize large codebooks and enable substep filtering
- **Start with a small sample** to validate your codebook works as expected
- **Review the LLM's reasoning** in the output JSON (look for `summary` and `plan` fields)

## Next Steps
- [Human Coding with Spreadsheets](./TUTORIAL-SPREADSHEET.md) — Combine with human deductive coding
- [Inductive Coding](./TUTORIAL-INDUCTIVE.md) — Discover new codes from data
