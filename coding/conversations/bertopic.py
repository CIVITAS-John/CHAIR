import sys

# Read from `./known.temp.text` for messages
with open("./known/temp.text", "r") as file:
    labels = file.read().splitlines()

# Get the number of items
n_samples = sys.argv[1] if len(sys.argv) > 1 else len(labels)

# Use BERTopic to get the topics
from bertopic import BERTopic
model = BERTopic(language="english", verbose=True)
topics, probs = model.fit_transform(labels[:n_samples])

# Print the topics
print(model.get_topic_info())
print(model.get_topic(0))