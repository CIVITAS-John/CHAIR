// Glossary: Preprocessing Chinese text to translate glossary terms into English
// We use nodejieba to tokenize Chinese text and replace certain tokens with English glossary terms
// The glossary is stored in a CSV file (./known/glossary.csv)
import * as File from "fs";

import * as Jieba from "nodejs-jieba";

Jieba.load();

// Read Glossaries
const Glossaries = File.readFileSync("./known/glossary.csv", "utf-8").split("\n");
const GlossaryMap = new Map<string, string>();
for (const Glossary of Glossaries) {
    const [Source, Translation] = Glossary.split(",");
    Jieba.insertWord(Source);
    GlossaryMap.set(Source, Translation.trim());
}

/** HandleGlossary: Tokenize Chinese text and replace glossary terms.*/
export function HandleGlossary(Text: string): string {
    const Tokens = Jieba.cut(Text);
    return Tokens.map((Token) => (GlossaryMap.has(Token) ? GlossaryMap.get(Token) : Token)).join("");
}

/** Preprocess: Preprocess for translation. */
export function Preprocess(Text: string): string {
    // Remove overly repetitive pattern.
    // Otherwise, some AI will complain and refuse to translate.
    Text = Text.replaceAll(/(.)\1{9,}/g, (_Match, Char: string) => Char.repeat(9));
    // Trim the text's white spaces in each line.
    Text = Text.split("\n")
        .map((Line) => Line.trim())
        .join("\n");
    // Handle the glossary
    return HandleGlossary(Text);
}
