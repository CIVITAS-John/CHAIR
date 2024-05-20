import { UseLLMs } from '../../translation/general.js';
import { ConsolidateConversations } from './codebooks.js';
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { PipelineConsolidator } from './consolidator.js';
import { DefinitionGenerator } from './definition-generator.js';
import { RefineMerger } from './refine-merger.js';
import { SimpleMerger } from './simple-merger.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    var Humans = ["Lexie", "Lily", "John"];
    for (var Human of Humans) {
        await ConsolidateConversations(new PipelineConsolidator(
            // Merge very similar names
            new SimpleMerger({}),
            // Generate definitions for missing ones
            new DefinitionGenerator(),
            // Merge definitions
            new RefineMerger({ Maximum: 0.5, UseDefinition: false }),
            new RefineMerger({ Maximum: 0.5, Looping: true }),
            new RefineMerger({ Maximum: 0.65, UseDefinition: false }),
            new RefineMerger({ Maximum: 0.65, Looping: true }),
        ), "Coded Dataset 1", "0~16-gpt-3.5-turbo.json", "human", Human, false);
    }
}, "llama3-70b");

process.exit(0);