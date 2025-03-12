import type { DataChunk, DataItem } from "../../utils/schema";

import { BaseStep } from "./base-step";

export interface LoadStepConfig {
    Path?: string; // Defaults to?
    // Passes the entire dataset to the filter in case only certain messages are needed
    // Default filter: (data) => data
    Filter?: <T extends DataChunk<DataItem>>(data: Record<string, T>) => Record<string, T>;
}

export class LoadStep extends BaseStep {
    _type = "Load";

    constructor(private readonly Config: LoadStepConfig) {
        super();
    }

    async Execute() {
        // Call some functions to load the data
    }
}
