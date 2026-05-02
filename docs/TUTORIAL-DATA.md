# Data Preparation Guide

Learn how to prepare qualitative data from different formats for analysis with CHAIR.

## What You'll Learn
- How CHAIR organizes qualitative data (datasets, chunk groups, chunks, items)
- The native JSON data format and `configuration.js` schema
- How to convert raw TXT transcripts to JSON
- How to convert DOCX interview files to JSON (with optional comment extraction)
- How to load REFI-QDA QDPX files directly
- How to use `LoadJsonStep` to load your prepared data

## Prerequisites
- Node.js v20+ and Python 3.12+ installed
- CHAIR cloned and set up (see [TUTORIAL.md](./TUTORIAL.md))

## Understanding CHAIR's Data Model

CHAIR organizes qualitative data in a four-level hierarchy:

```
Dataset
├── Chunk Group (e.g., "interviews")     — a named collection stored in one JSON file
│   ├── Chunk (e.g., "interview-01")     — a time-bounded group of items
│   │   ├── Item (e.g., message 1)       — atomic unit of analysis
│   │   ├── Item (e.g., message 2)
│   │   └── ...
│   ├── Chunk (e.g., "interview-02")
│   └── ...
└── Chunk Group (e.g., "focus-groups")
    └── ...
```

- **Dataset**: Top-level container with metadata (title, research question, coding notes)
- **Chunk Group**: A named collection of related chunks, stored in one JSON file
- **Chunk**: A time-bounded group of items (e.g., one interview transcript, one focus group session)
- **Item**: The atomic unit — a single message, paragraph, or response with speaker ID and content

## The Native JSON Format

Each chunk group is stored as a JSON file mapping chunk IDs to chunk objects. Here's the schema:

```json
{
    "chunk-id": {
        "id": "chunk-id",
        "start": "1970-01-01 00:00:00",
        "end": "1970-01-01 00:00:00",
        "items": [
            {
                "id": "chunk-id-1",
                "uid": "Speaker1",
                "time": "1970-01-01 00:00:00",
                "content": "The actual text content of this item."
            },
            {
                "id": "chunk-id-2",
                "uid": "Speaker2",
                "time": "1970-01-01 00:00:00",
                "content": "Another piece of text content."
            }
        ]
    }
}
```

**Field Reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier for the chunk or item |
| `start` / `end` | Yes | Time range for the chunk (use `"1970-01-01 00:00:00"` if unavailable) |
| `uid` | Yes | Speaker/author identifier |
| `time` | Yes | Timestamp for the item (use `"1970-01-01 00:00:00"` if unavailable) |
| `content` | Yes | The actual text content to be coded |
| `nickname` | No | Display name for the speaker |
| `tags` | No | Additional qualitative tags |
| `mentions` | No | User IDs mentioned in this item |

> **Note**: The JSON object key for each chunk must match that chunk's `id` field.

See `examples/data-format.json` for a minimal reference.

## Writing configuration.js

Every dataset directory needs a `configuration.js` file that describes the dataset metadata and points to the JSON data files. Here's an annotated example:

```javascript
export default /** @type {import("../src/schema").RawDataset} */ ({
    // Filesystem-safe identifier (used in output paths)
    name: "my-interview-study",

    // Human-readable title
    title: "Community Kitchen Interview Study",

    // Maps chunk group names to their JSON filenames
    data: {
        "interviews": "interviews.json",
        "focus-groups": "focus-groups.json",
    },

    // Description of the dataset (included in LLM prompts)
    description: "Semi-structured interviews with participants of the Community Kitchen program.",

    // Research question (guides the LLM's coding focus)
    researchQuestion: "How do participants experience collaborative cooking and learning?",

    // Additional coding instructions for the LLM
    codingNotes: "Focus on emotional experiences, social dynamics, and learning moments.",

    // Optional: maps speaker UIDs to display names
    getSpeakerName: (uid) => {
        const names = { "P1": "Participant 1", "INT": "Interviewer" };
        return names[uid] ?? uid;
    },

    // Optional: maps speaker UIDs to anonymized names for examples
    getSpeakerNameForExample: (uid) => {
        const names = { "P1": "Participant", "INT": "Interviewer" };
        return names[uid] ?? uid;
    },
});
```

**Key Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Filesystem-safe identifier |
| `title` | Yes | Human-readable title |
| `data` | Yes | Maps chunk group names → JSON filenames |
| `description` | Yes | What this dataset contains |
| `researchQuestion` | Yes | The main research question (included in LLM prompts) |
| `codingNotes` | Yes | Additional instructions for the LLM |
| `getSpeakerName` | No | Maps UIDs to display names (defaults to identity) |
| `getSpeakerNameForExample` | No | Maps UIDs to anonymized names (defaults to `getSpeakerName`) |

See `examples/txt-data/configuration.js` for a working example.

## Format 1: Raw TXT Files

For plain-text interview transcripts with the following format:

```
Speaker1:
Content of what Speaker1 said.

Speaker2:
Content of what Speaker2 said.

Speaker1:
More content from Speaker1.
```

### Converting TXT to JSON

CHAIR includes a Python transformer at `examples/txt-data/transformer.ipynb` that converts `.txt` files to JSON. The transformer:

1. Scans a folder for `.txt` files
2. Identifies speakers from lines ending with `:`
3. Groups content paragraphs under each speaker
4. Outputs a single `data-example.json` file

**To use it:**

1. Place your `.txt` files in a folder (e.g., `./my-data/`)
2. Copy `examples/txt-data/transformer.ipynb` into that folder
3. Run the notebook, updating the `root_folder_path` variable
4. The transformer generates `data-example.json`
5. Write a `configuration.js` pointing to the generated JSON file

**Example TXT input** (from `examples/txt-data/data-example-1.txt`):
```
Interviewer:
Thank you for taking the time to speak with us today. Can you start by introducing yourself?

Interviewee:
Of course! My name is Alex Green, and I'm a software engineer with five years of experience.
```

> **Tip**: The transformer was generated by GPT-4o and can be adapted for your specific transcript format. Modify the speaker detection logic in `process_text_file()` to match your data.

## Format 2: Raw DOCX Files

For Word documents with speaker-timestamped paragraphs. This format also supports extracting Word comments as human codes.

### Converting DOCX to JSON

Use the Python transformer at `examples/docx-data/transformer.ipynb`. It requires the `python-docx` package:

```bash
pip install python-docx
```

The transformer:

1. Parses `.docx` files using `python-docx`
2. Identifies speakers and timestamps from paragraph starts (e.g., `"Jordan 00:01:33"`)
3. Groups subsequent paragraphs under each speaker
4. Optionally extracts Word comments as human codes (per commenter)
5. Outputs `data-example.json` (data) and `human/{Coder_Name}.json` (codes)

**Key functions in the transformer:**

| Function | Purpose |
|----------|---------|
| `process_single_docx()` | Converts one DOCX to structured chunk data |
| `extract_comments_as_codes()` | Extracts Word comments as qualitative codes |
| `convert_folder_to_json()` | Batch-converts a folder of DOCX files |

**Comment extraction**: If your DOCX files contain comments (e.g., from human coders annotating the transcript), the transformer extracts them as codes. Comments are split by `;`, `,`, or `.` to support multiple codes per comment. Each commenter's codes are saved separately as `human/{Commenter_Name}.json`.

> **Tip**: The extracted human codes can be loaded directly by `CodeStep` with `agent: "Human"`. See [TUTORIAL-SPREADSHEET.md](./TUTORIAL-SPREADSHEET.md) for details.

## Format 3: QDPX Files (REFI-QDA Standard)

QDPX files follow the REFI-QDA standard — a cross-platform format used by tools like ATLAS.ti, NVivo, and MAXQDA. CHAIR handles QDPX conversion automatically via `LoadQdpxStep`.

### Using LoadQdpxStep

```typescript
import { LoadQdpxStep } from "../src/loading/load-qdpx-step.js";

const load = new LoadQdpxStep({
    path: "./data/my-project.qdpx",
});
```

`LoadQdpxStep` automatically:
1. Unzips the QDPX archive
2. Parses the `project.qde` XML file
3. Converts text sources to the JSON data format
4. Extracts human-coded segments from the project
5. Extracts the codebook (useful for deductive coding — see [TUTORIAL-DEDUCTIVE.md](./TUTORIAL-DEDUCTIVE.md))

### Configuration Options

```typescript
const load = new LoadQdpxStep({
    // Path to the .qdpx file or an already-extracted directory
    path: "./data/my-project.qdpx",

    // Where to save the converted JSON (default: sibling directory of the .qdpx file)
    outputDir: "./data/my-project-json",

    // Skip conversion if output already exists (default: true)
    skipIfExists: true,

    // Only include sources that have coded segments
    onlyCodedThreads: true,

    // Filter the codebook to only codes actually used in coded segments
    onlyUsedCodes: true,

    // Custom filter to include/exclude specific threads by ID
    threadFilter: (threadId) => !threadId.startsWith("excluded-"),

    // Transform data items after loading
    postprocessItem: (item) => ({
        ...item,
        content: item.content.trim(),
    }),

    // Transform coded items after loading
    postprocessCoded: (item) => item,
});
```

See `examples/qdpx-data/` for sample QDPX project structures.

## Format 4: Direct JSON (LoadJsonStep)

If your data is already in JSON format with a `configuration.js` file, use `LoadJsonStep` directly:

```typescript
import { LoadJsonStep } from "../src/loading/load-json-step.js";

const load = new LoadJsonStep({
    path: "./my-dataset",
});
```

### Optional Configuration

```typescript
const load = new LoadJsonStep({
    path: "./my-dataset",

    // Filter chunks after loading (e.g., only include specific chunks)
    filter: (chunks) => {
        return Object.fromEntries(
            Object.entries(chunks).filter(([key]) => key.startsWith("interview-"))
        );
    },

    // Transform each data item after loading
    postprocessItem: (item) => ({
        ...item,
        content: item.content.replace(/\[inaudible\]/g, ""),
    }),
});
```

## Preparing Your Own Dataset: Step-by-Step

1. **Create a dataset folder** (e.g., `./my-study/`)
2. **Convert your raw data to JSON** using one of the methods above:
   - TXT → use the `transformer.ipynb` from `examples/txt-data/`
   - DOCX → use the `transformer.ipynb` from `examples/docx-data/`
   - QDPX → skip this step, `LoadQdpxStep` handles it
   - Other formats → write a custom converter that outputs the JSON schema above
3. **Write `configuration.js`** with your dataset metadata and research question
4. **Verify** by loading the dataset:
   ```typescript
   const load = new LoadJsonStep({ path: "./my-study" });
   const job = new QAJob({ steps: [load] });
   await job.execute();
   ```
   Check the log output for successful loading messages.

## Next Steps

- [Inductive Coding](./TUTORIAL-INDUCTIVE.md) — AI-powered code generation from your data
- [Human Coding with Spreadsheets](./TUTORIAL-SPREADSHEET.md) — Generate Excel templates for human coders
- [Deductive Coding](./TUTORIAL-DEDUCTIVE.md) — Apply predefined codebooks to your data
