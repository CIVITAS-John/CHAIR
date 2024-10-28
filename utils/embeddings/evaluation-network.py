"""
Prepare distances for d3.js network visualization
"""

import json
from typing import cast

from embedding import cpus, embeddings
from numpy import float32
from numpy.typing import NDArray
from sklearn.metrics.pairwise import pairwise_distances
from sklearn.preprocessing import MinMaxScaler, normalize
from umap import UMAP

embeddings = normalize(embeddings, norm="l2")
# Calculate the distance matrix
distances = pairwise_distances(embeddings, embeddings, metric="euclidean", n_jobs=cpus)

# Use UMap to reduce the dimensions
umap = UMAP(n_components=2, metric="precomputed")  # densmap=True,
embeddings = cast(NDArray[float32], umap.fit_transform(embeddings))
print("Embeddings reduced:", embeddings.shape)

# Reshape the positions using MinMaxScaler
scaler = MinMaxScaler(feature_range=(100, 200))
embeddings = scaler.fit_transform(embeddings)
x, y = embeddings[:, 0], embeddings[:, 1]

# Send the results
raw = {"Distances": distances.tolist(), "Positions": embeddings.tolist()}
print(json.dumps(raw))
