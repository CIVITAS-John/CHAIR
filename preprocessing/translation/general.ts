import * as File from 'fs';
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { EnsureFolder, ExpectedItems, FinishedItems, InitializeLLM, InputTokens, LLMName, MaxItems, MaxOutput, OutputTokens, RequestLLM, RequestLLMWithCache } from "../../utils/llms.js";
import { Preprocess } from "../../utils/glossary.js";
import { Tokenize } from "../../utils/tokenizer.js";

// TranslatedCache: A cache for translated strings.
export const TranslatedCache = new Map<string, Map<string, string>>();

/** LoadCache: Load the tanslation cache from a file. */
export function LoadCache(): void {
    EnsureFolder(`./known/translation/${LLMName}`);
    var Translations = 0;
    for (const Type of File.readdirSync(`./known/translation/${LLMName}`)) {
        const Data = File.readFileSync(`./known/translation/${LLMName}/${Type}`, 'utf-8');
        const Cache = new Map<string, string>(JSON.parse(Data));
        for (const [Key, Value] of Cache) Cache.set(Key.trim(), Value.trim());
        Translations += Cache.size;
        TranslatedCache.set(Type.substring(0, Type.length - 5), Cache);
    }
    console.log(`Known translations: ${Translations}`);
}

/** SaveCache: Save the cache to a file. */
export function SaveCache(): void {
    EnsureFolder(`./known/translation/${LLMName}`);
    for (const [Type, Cache] of TranslatedCache) {
        const Data = JSON.stringify([...Cache], null, 4);
        File.writeFileSync(`./known/translation/${LLMName}/${Type}.json`, Data);
    }
}

/** TranslateStrings: Translate a bunch of strings using a local cache. */
export async function TranslateStrings(Type: string, Source: string[]): Promise<string[]> {
    if (!TranslatedCache.has(Type)) {
        TranslatedCache.set(Type, new Map<string, string>());
    }
    var Cache = TranslatedCache.get(Type)!;
    // First, we check the cache
    const ToTranslate: string[] = [];
    const ToTranslateIndexes: number[] = [];
    const Result: string[] = [];
    for (var Text of Source) {
        Text = Preprocess(Text);
        if (Text.match(/[\u4e00-\u9fa5]/) === null) {
            // Special: if no Chinese characters, skip the translation
            Result.push(Text);
            continue;
        } 
        if (Cache.has(Text)) {
            Result.push(Cache.get(Text)!);
        } else {
            ToTranslate.push(Text);
            ToTranslateIndexes.push(Result.length);
            Result.push(Text);
            Cache.set(Text, Text);
        }
    }
    // If not found, we call LLMs
    if (ToTranslate.length > 0) {
        try {
            const Translated = await TranslateStringsWithLLM(Type, ToTranslate);
            // Save the result to cache
            for (let I = 0; I < ToTranslate.length; I++) {
                Cache.set(ToTranslate[I], Translated[I]);
                Result[ToTranslateIndexes[I]] = Translated[I];
            }
            SaveCache();
            return Result;
        } catch (Error: any) {
            // Remove the cache if failed
            for (let I = 0; I < ToTranslate.length; I++) {
                if (Cache.get(ToTranslate[I]) === ToTranslate[I])
                    Cache.delete(ToTranslate[I]);
            }
            SaveCache();
            throw Error;
        }
    }
    return Result;
}

/** TranslateStringsWithLLM: Translate an arbitrary number of strings calling LLMs. */
export async function TranslateStringsWithLLM(Type: string, Source: string[]): Promise<string[]> {
    // SystemPrompt: The system prompt for the LLM
    var SystemPrompt = "Translate all following Chinese text into English, one by one.";
    switch (Type) {
        case "nickname":
            SystemPrompt = "Translate all following Chinese names into English, one by one.";
            break;
    }
    // Call the LLM
    var Results: string[] = [], Requests: string[] = [];
    var Tokens = Tokenize(SystemPrompt).length + 16; // Leave some space for internal tokens
    for (var Text of Source) {
        var CurrentTokens = Tokenize(Text).length + 16;
        if (Tokens + CurrentTokens > MaxOutput || Requests.length >= MaxItems) {
            Results = Results.concat(await TranslateChunkedStringsWithLLMRetries(Type, Requests, SystemPrompt));
            Requests = [];
            CurrentTokens = 0;
        }
        Requests.push(Text);
    }
    if (Requests.length > 0)
        Results = Results.concat(await TranslateChunkedStringsWithLLMRetries(Type, Requests, SystemPrompt));
    return Results;
}

/** TranslateChunkedStringsWithLLMRetries: Translate a bunch of strings calling LLMs with Retry strategies. */
async function TranslateChunkedStringsWithLLMRetries(Type: string, Requests: string[], SystemPrompt: string): Promise<string[]> {
    var Tries = 0;
    while (true) {
        try {
            return await TranslateChunkedStringsWithLLM(Type, Requests, SystemPrompt, Tries);
        } catch (Error: any) {
            if (++Tries > 2) throw Error;
            console.log(`Translation error ${Error.message}, retrying ${Tries} times.`);
        }
    }
}

/** TranslateChunkedStringsWithLLM: Translate a bunch of strings calling LLMs. */
async function TranslateChunkedStringsWithLLM(Type: string, Source: string[], SystemPrompt: string, Tries: number): Promise<string[]> {
    var Separator = "\n---\n";
    // Call the LLM
    const Result = await RequestLLMWithCache([new SystemMessage(`${SystemPrompt} Always follow the output format:
---
1. Translated Text 1
---
2. Translated Text 2
---
...`.trim()), new HumanMessage(
        Source.map((Text, Index) => `${Index + 1}. ${Text}`).join(Separator))], "translation-cache", Tries * 0.2);
    // Split the result
    var Results = Result.split(/\n *--- *\n/gm);
    // Sometimes GPT-4.5-turbo ignores the proceding line break.
    if (Results.length == 1)
        Results = Result.split(/\n? *--- *\n/gm);
    // Filter empty strings
    Results = Results.filter(Text => Text.trim() !== "");
    // Claude loves to add a sentence at the beginning.
    if (!Results[0].startsWith("1.") && Results.length == Source.length + 1)
        Results.shift();
    if (Results.length !== Source.length) {
        throw new Error(`Translation Error: ${Results.length} results for ${Source.length} sources.`);
    }
    // Save the result to cache
    var Cache = TranslatedCache.get(Type)!;
    for (let I = 0; I < Source.length; I++) {
        Results[I] = Results[I].trim();
        if (Results[I].endsWith("---")) Results[I] = Results[I].substring(0, Results[I].length - 3).trim();
        // Sometimes, some LLM inevitably includes a proceding text
        if (I == 0 && !Results[I].startsWith("1."))
            Results[I] = Results[I].substring(Results[I].indexOf(".") - 1);
        Results[I] = Results[I].replace(/^(\d+)\.?(\s|\n)/gs, '');
        if (Source[I] == Results[I] && Tries == 0) throw new Error(`Translation Error: ${Source[I]} => ${Results[I]}`);
        Cache.set(Source[I], Results[I]);
    }
    return Results;
}