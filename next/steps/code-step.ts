import type { AIParameters, CodeStrategy, LLMModel } from "./base-step";
import { BaseStep } from "./base-step";
import type { LoadStep } from "./load-step";

export type CodeStepConfig = {
    // To avoid confusion for AI "output" vs human "input", this is just the path to store the coded data
    Path?: string; // Defaults to?
    Dataset?: LoadStep | LoadStep[]; // Defaults to all datasets loaded
} & (
    | {
          Agent: "Human";
          // If Path doesn't exist, data will be exported to a new file (e.g. ${Path}.TODO.xlsx) for the human to code
      }
    | {
          Agent: "AI";
          // Renaming "Analyzer" to "Strategy" to avoid confusion with "the LLM that analyzes the data"
          Strategy: CodeStrategy | CodeStrategy[];
          Model: LLMModel | LLMModel[];
          Parameters?: AIParameters;
      }
);

export class CodeStep extends BaseStep {
    _type = "Code";
    constructor(private readonly Config: CodeStepConfig) {
        super();
    }

    async Execute() {
        // Call some functions to code the data
    }
}
