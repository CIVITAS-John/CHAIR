import sys
import os
import numpy as np
import math
import matplotlib.pyplot as plt
import matplotlib.patheffects as PathEffects
import matplotlib.transforms as mtransforms
from matplotlib.markers import MarkerStyle
from embedding import Dimensions, Items, cpus, labels, embeddings

# Prepare distances for d3.js network visualization
from sklearn.preprocessing import normalize
embeddings = normalize(embeddings, norm='l2')
# Calculate the distance matrix
from sklearn.metrics.pairwise import pairwise_distances
distances = pairwise_distances(embeddings, embeddings, metric='euclidean', n_jobs=cpus)

# Use UMap to reduce the dimensions
from umap import UMAP
umap = UMAP(n_components=2, metric='precomputed') # densmap=True, 
embeddings = umap.fit_transform(distances)
print("Embeddings reduced:", embeddings.shape)

# Reshape the positions using MinMaxScaler
from sklearn.preprocessing import MinMaxScaler
scaler = MinMaxScaler(feature_range=(-45, 45))
embeddings = scaler.fit_transform(embeddings)
x, y = embeddings[:, 0], embeddings[:, 1]

# Send the results
import json
raw = {"Distances": distances.tolist(), "Positions": embeddings.tolist()}
print(json.dumps(raw))