# Physics-Lab-Community-Analysis
Analysis code for Physics Lab's online community.

## API Access
To run the code in this repository, you need to create the `.env` file in the repository folder with the following:

```
OPENAI_API_KEY={Your OpenAI API Key}
ANTHROPIC_API_KEY={Your Anthropic API Key}
MISTRAL_API_KEY={Your Mistral API Key}
```

For Google Cloud, you will need to install the GCloud SDK and successfully initialize it in local command line environments. Specifically, you need to do:
```
gcloud init
gcloud auth application-default login
```

## Segmentation
### Messaging Groups
The messaging group data are, essentially, continuous streams of messages covering several years. To enable qualitative analysis, we need to break them down into smaller units of analysis. An intuitive choice is *conversations*: A series of chat exchanges that could stand on its own, with sufficient context information for analysis. In this project, we used basic signal processing approaches to achieve this: by looking at time gaps between every two messages, we tried to find the "peaks" and seperate the stream into multiple chunks. To mitigate the issue of "somebody asked a question a while ago, then another person answered, but those are separated into two", we also looked at the mentioned (@) data and participants data, merging chunks if certain characteristic is identified. However, this might still not be enough. During the analysis, 3 messages will be added to before and after each conversation.

## Translation
### Cache Mechanism
Since API calls for LLMs are not free, we cached everything we could and partitioned the cache based on the LLM used and the type of translation task. See `/known/translation` folder. However, in case that the underlying prompts are changed and we expect big changes in the result, please delete the relevant files and run the code again. 

### Challenges
Translation online netizens' languages has special challenges. Here, we list the ones we addressed in our dataset.
* The platform for the messaging group, QQ, use non-Unicode emojis (e.g. /斜眼笑). We replaced them with relevant Unicode emojis, which takes less tokens and is easier for non-Chinese readers to understand.
* Over the years, users formed a Physics Lab-specific vocabulary, for example, the abbreviation 物实 = PL => 物理实验室 = Physics Lab. LLMs do not have this knowledge and less powerful ones are often confused. Hence, we used nodejieba to tokenize each Chinese content and replaced such terms with prescribed translations (e.g. 认证编辑 => Certified Editor). The usage of a tokenizer, which breaks down Chinese sentences into words, reduces the chance of mis-replacement, but not entirely. For example, 编辑 can be used as both a noun and verb in Chinese; but we replaced all of them with "Editor", which is the noun form. However, a quick glance at the entire dataset shows most usage of "编辑" is indeed about Editors in Physics lab, so we decide to go down this route.

### Evaluation of LLMs
This is preliminary, based on a messaging group record (~570 items) between Mar 21, 2018 - Apr 1, 2018.
* gpt-3.5-turbo ($2): Acceptable quality with a few minor issues.
* claude-3-haiku ($1): Acceptable quality with a few minor issues.
* mistral-small ($10): Decent quality with a few minor issues.
* claude-3-sonnet ($18): Has a bug that prevents it from translating certain data (!) Too eager to give a "response", instead of following the prompt.
```
system
===
Translate all following Chinese text into English, one by one. Use `---` to separate texts.

user
===
1. 嗯
---
2. 我们在期待
---
3. 天体也可以有游戏模式，发射飞船
---
4. 好
---
5. 可以出一个有关于科学的小视频的模块吗
---
6. 我特喜欢飞船诶
---
7. 发射飞船的话应该会有更多的人来玩
---
8. 继电器现在是已经有了吗？
---
9. 发射飞船的话飞船可以自己设计
---
10. 可以设置很多情景
---
11. 比如发射失败
---
12. 自己去造飞船比较有意思
---
13. 有了
---
14. 飞船可以有
---
15. 也可以多模块
---
16. 不过其实是基于引力原理的
---
17. 飞船是本身就有的吗？
---
18. 还是自己去建造
---
19. 本身就有。然后可以增加不同模块。其实不会太复杂。。
---
20. 哦哦
---
21. 其实可以设计个太阳能蓄电池
---
22. 会出星座之类的吗？
---
23. 实验桌上有些地方有阳光的啊
---
24. 本质上是模拟星系内的运动情况
---
25. 所以你可以在现实星系或者自定义星系中去发射飞船
---
26. 关卡设计都会直接开放
---
27. 实验桌上有地方有太阳光
---
28. 放一个太阳能蓄电池也可以代替电池
---
29. 可以考虑
---
30. 太阳能电池板吧
---
31. 然后搞个充电电池
---
32. 嗯嗯
```
* gpt-4.5-turbo ($40): Pretty good quality with a few minor issues. 