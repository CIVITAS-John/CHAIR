# Physics-Lab-Community-Analysis
Analysis code for Physics Lab's online community.

## API Access
To run the code in this repository, you need to create the `.env` file in the repository folder with the following:

`OPENAI_API_KEY={Your OpenAI API Key}`


## Translation
### Cache Mechanism
Since API calls for LLMs are not free, we cached everything we could and partitioned the cache based on the LLM used and the type of translation task. See `/known/translation` folder. However, in case that the underlying prompts are changed and we expect big changes in the result, please delete the relevant files and run the code again. 

### Challenges
Translation online netizens' languages has special challenges. Here, we list the ones we addressed in our dataset.
* The platform for the messaging group, QQ, use non-Unicode emojis (e.g. /斜眼笑). We replaced them with relevant Unicode emojis, which takes less tokens and is easier for non-Chinese readers to understand.
* Over the years, users formed a Physics Lab-specific vocabulary, for example, the abbreviation 物实 = PL => 物理实验室 = Physics Lab. LLMs do not have this knowledge and less powerful ones are often confused. Hence, we used nodejieba to tokenize each Chinese content and replaced such terms with prescribed translations (e.g. 认证编辑 => Certified Editor). The usage of a tokenizer, which breaks down Chinese sentences into words, reduces the chance of mis-replacement, but not entirely. For example, 编辑 can be used as both a noun and verb in Chinese; but we replaced all of them with "Editor", which is the noun form. However, a quick glance at the entire dataset shows most usage of "编辑" is indeed about Editors in Physics lab, so we decide to go down this route.