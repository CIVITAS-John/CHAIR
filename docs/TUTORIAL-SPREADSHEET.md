# Human Coding with Spreadsheets

Generate Excel templates for human coders and import their results back into the CHAIR pipeline.

## What You'll Learn
- How to generate Excel coding templates
- The Excel spreadsheet format (data sheets and codebook sheet)
- How to configure `CodeStep` with `agent: "Human"`
- How to import completed codes back into the pipeline
- How to combine human and AI coding

## Prerequisites
- A prepared dataset (see [TUTORIAL-DATA.md](./TUTORIAL-DATA.md))
- Microsoft Excel or compatible spreadsheet editor
- CHAIR built and configured (see [TUTORIAL.md](./TUTORIAL.md))

## Overview

The human coding workflow:

```
Load dataset → Export Excel templates → Human coders fill in → Import codes → Consolidate → Evaluate
```

`CodeStep` with `agent: "Human"` automates the export and import steps.

## Excel Format

### Data Sheets
Each chunk gets its own worksheet with these columns:

| Column | Description |
|--------|-------------|
| ID | Item identifier |
| CID | Chunk ID |
| SID | Speaker/user ID |
| Nickname | Display name |
| Time | Timestamp |
| In | "Y" if item belongs to this chunk |
| Content | The text to code |
| **Codes** | **Where coders enter their codes** (comma or semicolon separated) |
| Memo | Optional notes |
| Consolidated | Auto-populated after consolidation |

Three special rows appear at the bottom of each sheet:
- **Thoughts** (ID=-1): Pre-coding impressions
- **Summary** (ID=-2): Chunk summary
- **Reflection** (ID=-3): Post-coding insights

### Codebook Sheet
A separate worksheet with columns: **Label**, **Category**, **Definition**, **Examples**, **Alternatives**. Multiple values use bullet points (`* item1`, `* item2`).

## Configuring the Human CodeStep

```typescript
import { CodeStep } from "../src/steps/code-step.js";

const code = new CodeStep({
    agent: "Human",
    coders: ["alice", "bob"],       // Expected files: human/alice.xlsx, human/bob.xlsx
    subdir: "human",                // Folder relative to dataset path (default: "human")
    onMissing: "wait",              // What to do if file is missing/empty
    codebookSheet: "Codebook",      // Sheet name for codebook (default: "Codebook")
});
```

**`onMissing` options:**

| Value | Behavior |
|-------|----------|
| `"ask"` | Prompt user for action (default) |
| `"skip"` | Skip this coder |
| `"wait"` | Open the file and wait for coder to close it |
| `"abort"` | Stop execution |

## Exporting Templates

When `CodeStep` runs and finds no existing files, it auto-exports empty Excel templates to `<dataset-path>/<subdir>/<coder>.xlsx`.

With `onMissing: "wait"`, it opens the file and pauses until the coder closes it:

```typescript
import { LoadJsonStep } from "../src/loading/load-json-step.js";
import { CodeStep } from "../src/steps/code-step.js";
import { QAJob } from "../src/job.js";

const load = new LoadJsonStep({ path: "./my-dataset" });
const code = new CodeStep({
    agent: "Human",
    coders: ["coder1"],
    onMissing: "wait",
});

const job = new QAJob({ steps: [load, code] });
await job.execute();
```

## Importing Completed Codes

After coders fill in the **Codes** column, re-run the same pipeline. `CodeStep` automatically:
1. Reads each worksheet (skips the Codebook sheet)
2. Parses codes from the Codes column (split by comma, semicolon, or newline)
3. Builds a codebook with examples from the coded items
4. Falls back to JSON (`<coder>.json`) if Excel loading fails

## Using the Programmatic API

For direct control, use the export/import functions:

```typescript
import { exportChunksForCoding } from "../src/utils/io/export.js";
import { importCodes, importCodebook } from "../src/utils/io/import.js";

// Export chunks to an Excel workbook
const workbook = exportChunksForCoding(chunks, existingAnalyses);
await workbook.xlsx.writeFile("./output/coding-template.xlsx");

// Import codes from a completed Excel file
const codedThreads = await importCodes(dataset, "./output/completed.xlsx");

// Import just the codebook
const codebook = await importCodebook("./output/completed.xlsx");
```

## Combining Human + AI Coding

Both human and AI `CodeStep`s can run in the same pipeline. `ConsolidateStep` merges all results:

```typescript
import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import { LoadJsonStep } from "../src/loading/load-json-step.js";
import { CodeStep } from "../src/steps/code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { QAJob } from "../src/job.js";

const load = new LoadJsonStep({ path: "./my-dataset" });

const humanCode = new CodeStep({
    agent: "Human",
    coders: ["alice"],
});

const aiCode = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelAnalyzerAny],
    model: ["gpt-4o"],
});

const consolidate = new ConsolidateStep({ model: ["gpt-4o"] });

const job = new QAJob({
    embedder: "openai-small-512",
    steps: [load, humanCode, aiCode, consolidate],
    parallel: true,
});
await job.execute();
```

## Tips for Human Coders
- Use consistent code names across coders for better consolidation
- Enter multiple codes separated by commas or semicolons
- Use the **Thoughts** row to document pre-coding impressions
- Use the **Reflection** row for post-coding insights
- Fill in the **Codebook** sheet for clarity and reproducibility

## Next Steps
- [Inductive Coding](./TUTORIAL-INDUCTIVE.md) — AI-powered code generation
- [Deductive Coding](./TUTORIAL-DEDUCTIVE.md) — Apply predefined codebooks
