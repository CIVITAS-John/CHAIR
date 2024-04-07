// Glossary: Preprocessing Chinese text to translate glossary terms into English
// We use nodejieba to tokenize Chinese text and replace certain tokens with English glossary terms
// The glossary is stored in a CSV file (./known/glossary.csv)
import * as File from 'fs';
import * as Jieba from 'nodejs-jieba';

Jieba.load();

// Read Glossaries
const Glossaries = File.readFileSync(`./known/glossary.csv`, 'utf-8').split('\n');
const GlossaryMap = new Map<string, string>();
for (const Glossary of Glossaries) {
    var [Source, Translation] = Glossary.split(',');
    Jieba.insertWord(Source);
    GlossaryMap.set(Source, Translation.trim());
}

/** HandleGlossary: Tokenize Chinese text and replace glossary terms.*/
export function HandleGlossary(Text: string): string {
    const Tokens = Jieba.cut(Text);
    return Tokens.map(Token => GlossaryMap.has(Token) ? GlossaryMap.get(Token) : Token).join('');
}