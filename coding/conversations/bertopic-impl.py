import sys

# Read from `./known.temp.text` for messages
with open("./known/temp.text", "r", encoding="utf-8") as file:
    labels = file.read().splitlines()

# Get the number of items
n_samples = sys.argv[1] if len(sys.argv) > 1 else len(labels)

# Use BERTopic to get the topics
from bertopic import BERTopic
from bertopic.representation import KeyBERTInspired
from hdbscan import HDBSCAN
hdbscan_model = HDBSCAN(min_cluster_size=3, prediction_data=True, cluster_selection_method = "leaf")
representation_model = KeyBERTInspired()
model = BERTopic(language="english", verbose=True, representation_model=representation_model, hdbscan_model=hdbscan_model)
topics, probs = model.fit_transform(labels[:n_samples])


# Print the topics
print(model.get_topic_info())
print(model.get_topic(0))