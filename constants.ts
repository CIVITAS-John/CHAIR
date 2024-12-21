import type { DataChunk, DataItem, Dataset } from "./utils/schema.js";

// ResearchQuestion: The research question.
export let ResearchQuestion = "(Unset)";

// CodingNotes: The notes for qualitative coding.
export let CodingNotes = "(Unset)";

let getSpeakerName: (ID: string) => string;
/** GetSpeakerName: Get the name (used in prompts) in place of a speaker. */
export function GetSpeakerName(ID: string): string {
    return getSpeakerName(ID);
}

let getSpeakerNameForExample: (ID: string) => string;
/** GetSpeakerNameForExample: Get the name (used in prompts) in place of a speaker for examples. */
export function GetSpeakerNameForExample(ID: string): string {
    return getSpeakerNameForExample(ID);
}

//
/** InitializeDataset: Initialize constants from a dataset.. */
export function InitializeDataset(Dataset: Dataset<DataChunk<DataItem>>) {
    ResearchQuestion = `The research question is: ${Dataset.ResearchQuestion}`;
    CodingNotes = Dataset.CodingNotes;
    getSpeakerName = Dataset.GetSpeakerName ?? ((ID: string) => ID);
    getSpeakerNameForExample = Dataset.GetSpeakerNameForExample ?? getSpeakerName;
}
