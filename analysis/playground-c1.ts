import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { Consolidator1 } from './codebooks/consolidator-1.js';
import { InitializeEmbeddings, Model } from '../utils/embeddings.js';

InitializeEmbeddings("gecko-768-similarity");

/*
import { loadEvaluator } from "langchain/evaluation";
const chain = await loadEvaluator("embedding_distance", { embedding: Model });

const res = await chain.evaluateStrings({
  prediction: "Label: Anticipation\nDefinition: Quotes expressing anticipation or expectation",
  reference: "Label: Expectation\nDefinition: Quotes expressing anticipation or expectation",
});

console.log({ res });*/

await UseLLMs(async () => {
    await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
    // await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "llama3-70b"); // llama3-70b

process.exit(0);