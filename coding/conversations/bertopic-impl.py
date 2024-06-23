import sys
from dotenv import dotenv_values
config = dotenv_values(".env")

# Read from `./known.temp.text` for messages
with open("./known/temp.text", "r", encoding="utf-8") as file:
    messages = file.read().splitlines()

# Get the number of items
n_samples = int(sys.argv[1]) if len(sys.argv) > 1 else len(messages)
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
prompt = f"""
You are an expert in thematic analysis with grounded theory, working on open coding.
{rq}
{notes}

You identified a topic from the message. Documents of the topic:
===
[DOCUMENTS]
===
Keywords of the topic: [KEYWORDS]

Respond a single verb phrase to describe the topic."""
print("Prompt:", prompt)
representation_model = OpenAI(
    client,
    prompt=prompt,
    model="gpt-3.5-turbo", 
    delay_in_seconds=2,
    chat=True,
    nr_docs=4,
    doc_length=100,
    tokenizer=tokenizer
)

# Run the model
model = BERTopic(language="english", embedding_model="all-MiniLM-L12-v2", verbose=True, 
                 representation_model=representation_model, hdbscan_model=hdbscan_model)
topics, probs = model.fit_transform(messages[:n_samples])

# Convert the label dict to an array
labels = [label for label in model.topic_labels_.values()]

# Remove anything before the first '_' from labels
labels = [label[label.find("_")+1:] for label in labels]

# Generate the output: for each message, the representation and the probability
output = {}
for i in range(n_samples):
    output[i] = {
        "ID": i,
        "Topic": labels[topics[i]],
        "Probability": probs[i]
    }

# Write into a UTF-8 json
import json
sys.stdout.buffer.write(json.dumps(output, indent=4, ensure_ascii=False).encode("utf-8"))