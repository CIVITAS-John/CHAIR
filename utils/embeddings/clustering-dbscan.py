"""
DBScan Clustering
"""

import json
import sys
from typing import cast

import matplotlib.pyplot as plt
import numpy as np
from embedding import Dimensions, Items, cpus, embeddings
from numpy.typing import NDArray
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import pairwise_distances
from umap import UMAP

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "cosine"
Epsilon = float(sys.argv[4]) if len(sys.argv) > 4 else 0.17
MinSamples = int(sys.argv[5]) if len(sys.argv) > 5 else 1
TargetDimensions = int(sys.argv[6]) if len(sys.argv) > 6 else Dimensions
Plotting = bool(sys.argv[7]) if len(sys.argv) > 7 else True
print(
    "Epsilon:",
    Epsilon,
    ", MinSamples:",
    MinSamples,
    ", Metrics:",
    Metrics,
    ", Target Dimensions:",
    TargetDimensions,
)

# Use UMap to reduce the dimensions
if TargetDimensions < Dimensions:
    umap = UMAP(n_components=TargetDimensions)
    embeddings = cast(NDArray[np.float32], umap.fit_transform(embeddings))
    print("Embeddings reduced:", embeddings.shape)

# Calculate distances
distances = pairwise_distances(embeddings, embeddings, metric=Metrics, n_jobs=cpus)

# Plot the distances
if Plotting:
    # Exclude the diagonal on a new instance
    hist_distances = np.copy(distances)
    np.fill_diagonal(hist_distances, 1)

    # Do a histogram of the distances
    hist_distances = hist_distances.min(axis=1)
    hist_distances = hist_distances[hist_distances < 1]
    hist_distances = hist_distances[hist_distances > 0]

    plt.hist(hist_distances, bins=100)
    plt.show()

# Send into DBScan
# from sklearn.preprocessing import normalize
# norm_embeddings = normalize(embeddings, norm='l2')
db = DBSCAN(eps=Epsilon, min_samples=MinSamples, metric="precomputed", n_jobs=cpus)
db.fit(distances)

# Change all 0 to -1
db.labels_[db.labels_ == 0] = -1

# Send the results
print(json.dumps([db.labels_.tolist(), np.ones(Items).tolist()]))
