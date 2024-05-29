// CutoffDate: The cutoff date for the dataset.
export const CutoffDate = new Date(2021, 0, 1);

// ResearchQuestion: The research question.
export const ResearchQuestion = "The research question is: How did Physics Lab's online community emerge? (through the lens of learning sciences, human-computer interaction, and participatory design)"

/** GetSpeakerName: Get the name (used in prompts) in place of a speaker. */
export function GetSpeakerName(ID: string): string {
    switch (ID) {
        case "3":
            return "Designer-1";
        case "8":
            return "Designer-2";
        default:
            return `User-${ID}`;
    }
}

/** GetSpeakerNameForExample: Get the name (used in prompts) in place of a speaker for examples. */
export function GetSpeakerNameForExample(ID: string): string {
    switch (ID) {
        case "3":
        case "8":
            return "Designer";
        default:
            return `User`;
    }
}