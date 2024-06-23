import { UseLLMs } from '../../utils/llms.js';
import { ConsolidateChunks } from './codebooks.js';
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { PipelineConsolidator } from './consolidator.js';
import { DefinitionGenerator } from './definition-generator.js';
import { RefineMerger } from './refine-merger.js';
import { SimpleMerger } from './simple-merger.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    var Humans = ["Lexie", "Lily", "John"];
    for (var Human of Humans) {
        await ConsolidateChunks(new PipelineConsolidator(
            // Merge very similar names
            new SimpleMerger({}),
            // Generate definitions for missing ones
            new DefinitionGenerator(),
            // Merge definitions
            new RefineMerger({ Maximum: 0.5, Minimum: 0.45, UseDefinition: false }),
            new RefineMerger({ Maximum: 0.5, Minimum: 0.45, Looping: true }),
            new RefineMerger({ Maximum: 0.65, UseDefinition: false }),
            new RefineMerger({ Maximum: 0.65, Looping: true }),
        ), "Coded Dataset 1", "0~16-gpt-3.5-turbo.json", "human", Human, false);
    }
}, "llama3-70b");

process.exit(0);