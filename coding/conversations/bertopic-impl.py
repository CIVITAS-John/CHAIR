import sys
from dotenv import dotenv_values
config = dotenv_values(".env")

# Read from `./known.temp.text` for messages
with open("./known/temp.text", "r", encoding="utf-8") as file:
    labels = file.read().splitlines()

# Get the number of items
n_samples = int(sys.argv[1]) if len(sys.argv) > 1 else len(labels)
rq = sys.argv[2] if len(sys.argv) > 2 else """The research question is: How did Physics Lab's online community emerge?"""
notes = sys.argv[3] if len(sys.argv) > 3 else """"Designer" refer to people who designed and developed Physics Lab. Code through the lens of learning sciences, human-computer interaction, and participatory design."""

# Use BERTopic to get the topics
from bertopic import BERTopic
from hdbscan import HDBSCAN
hdbscan_model = HDBSCAN(min_cluster_size=3, prediction_data=True, cluster_selection_method = "leaf")

# Use GPT-3.5 for the representation model
import openai
import tiktoken
from bertopic.representation import OpenAI
from bertopic import BERTopic
tokenizer = tiktoken.encoding_for_model("gpt-3.5-turbo")

# Create your representation model
client = openai.OpenAI(api_key=config["OPENAI_API_KEY"])
representation_model = OpenAI(
    client,
    prompt=f"""
You are an expert in thematic analysis with grounded theory, working on open coding.
{rq}
{notes}

Your goal is to describe the following topic with verb phrases.
Documents of the topic:
===
[DOCUMENTS]
===
Keywords of the topic: [KEYWORDS]""",
    model="gpt-3.5-turbo", 
    delay_in_seconds=2,
    chat=True,
    nr_docs=4,
    doc_length=100,
    tokenizer=tokenizer
)

# Use the representation model in BERTopic on top of the default pipeline
topic_model = BERTopic(representation_model=representation_model)

# Run the model
model = BERTopic(language="english", embedding_model="all-MiniLM-L12-v2", verbose=True, 
                 representation_model=representation_model, hdbscan_model=hdbscan_model)
topics, probs = model.fit_transform(labels[:n_samples])

# Print the topics
print(model.get_topic_info())
print(model.get_topic(0))