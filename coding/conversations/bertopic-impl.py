"""
Implementation of BERTopic using the `all-MiniLM-L12-v2` model
"""

import json
import sys
from typing import Literal, Mapping, Tuple, Union, cast

from bertopic import BERTopic
from bertopic.representation import KeyBERTInspired
from dotenv import dotenv_values
from hdbscan import HDBSCAN

config = dotenv_values(".env")

# Read from `./known.temp.text` for messages
with open("./known/temp.text", "r", encoding="utf-8") as file:
    messages = file.read().splitlines()

# Get the number of items
n_samples = int(sys.argv[1]) if len(sys.argv) > 1 else len(messages)

# Use BERTopic to get the topics
hdbscan_model = HDBSCAN(
    min_cluster_size=2, prediction_data=True, cluster_selection_method="leaf"
)
representation_model = KeyBERTInspired()

# Run the model
model = BERTopic(
    language="english",
    embedding_model="all-MiniLM-L12-v2",
    verbose=True,
    hdbscan_model=hdbscan_model,
    representation_model=representation_model,
)
topics, probs = model.fit_transform(messages[:n_samples])
if not probs:
    sys.stderr.write("No probabilities found\n")
    sys.exit(1)

# Generate the output: for each topic, return the IDs, probabilities
output = {}
for index, row in model.get_topic_info().iterrows():
    topic = row["Topic"]
    _keywords = cast(
        Union[Mapping[str, Tuple[str, float]], Literal[False]], model.get_topic(topic)
    )
    if not _keywords:
        sys.stderr.write(f"Topic {topic} has no keywords\n")
        continue
    # Get the keys from the keywords [(key, value), ...] to [key, ...] (remove the values)
    keywords = [key for key, _ in _keywords]
    output[topic] = {
        "IDs": [i for i, t in enumerate(topics) if t == topic],
        "Probabilities": [p for i, p in enumerate(probs) if topics[i] == topic],
        "Keywords": keywords,
    }

# Write into a UTF-8 json
sys.stdout.buffer.write(
    json.dumps(output, indent=4, ensure_ascii=False).encode("utf-8")
)
