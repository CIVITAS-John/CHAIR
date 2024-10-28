"""
HDBScan Clustering
"""

import json
import sys
from typing import cast

import hdbscan
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
from embedding import Dimensions, cpus, embeddings, labels
from numpy.typing import NDArray
from sklearn.metrics.pairwise import pairwise_distances
from umap import UMAP

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "cosine"
Method = sys.argv[4] if len(sys.argv) > 4 else "leaf"
MinCluster = int(sys.argv[5]) if len(sys.argv) > 5 else 2
MinSamples = int(sys.argv[6]) if len(sys.argv) > 6 else 1
TargetDimensions = int(sys.argv[7]) if len(sys.argv) > 7 else Dimensions
Plotting = bool(sys.argv[8]) if len(sys.argv) > 8 else True
print(
    "Method:",
    Method,
    ", MinCluster:",
    MinCluster,
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

# Send into HDBScan
hdb = hdbscan.HDBSCAN(
    min_cluster_size=MinCluster,
    min_samples=MinSamples,
    cluster_selection_method=Method,
    core_dist_n_jobs=cpus,
    metric="precomputed",
)  # , prediction_data = True
hdb.fit(distances.astype(np.float64))
linkage = hdb.single_linkage_tree_._linkage  # pylint: disable=protected-access

# Send the results
print(json.dumps([hdb.labels_.tolist(), hdb.probabilities_.tolist()]))

# Plot the clusters
if Plotting:
    # Transform the embeddings to 2D
    if TargetDimensions < 2:
        umap = UMAP(n_components=2)
        embeddings = cast(NDArray[np.float32], umap.fit_transform(embeddings))
    # Get the colors
    color_palette = sns.color_palette("deep", len(set(hdb.labels_)))
    cluster_colors = [
        color_palette[x] if x >= 0 else (0.5, 0.5, 0.5) for x in hdb.labels_
    ]
    colors = [sns.desaturate(x, p) for x, p in zip(cluster_colors, hdb.probabilities_)]
    # Plot the clusters
    plt.scatter(
        embeddings[:, 0], embeddings[:, 1], s=50, linewidth=0, c=colors, alpha=0.25
    )
    # Give a label to each point
    for i, txt in enumerate(labels):
        plt.annotate(txt, (embeddings[i, 0], embeddings[i, 1]))
    plt.show()
