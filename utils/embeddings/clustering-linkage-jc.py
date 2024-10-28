"""
Linkage-based Clustering - John Chen's heuristic
A penalty is applied to the relative size (e.g. numbers of examples or codes) of the clusters
"""

import json
import sys

import matplotlib.pyplot as plt
import numpy as np
from embedding import Dimensions, Items, cpus, embeddings, labels
from scipy.cluster.hierarchy import dendrogram, linkage, to_tree
from scipy.spatial.distance import squareform
from sklearn.metrics.pairwise import pairwise_distances
from sklearn.preprocessing import normalize
from umap import UMAP

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "euclidean"
Linkage = sys.argv[4] if len(sys.argv) > 4 else "ward"
MaxDistance = float(sys.argv[5]) if len(sys.argv) > 5 else 0.65
MinDistance = float(sys.argv[6]) if len(sys.argv) > 6 else 0.4
TargetDimensions = int(sys.argv[7]) if len(sys.argv) > 7 else Dimensions
Plotting = bool(sys.argv[8]) if len(sys.argv) > 8 else False
Penalty = MaxDistance - MinDistance
print(
    "Linkage:",
    Linkage,
    ", MaxDistance:",
    MaxDistance,
    ", MinDistance:",
    MinDistance,
    ", Metrics:",
    Metrics,
    ", Target Dimensions:",
    TargetDimensions,
)

# Separate the examples from labels
sources = [json.loads(label) for label in labels]
labels = [source["Label"] for source in sources]
examples = [set(source["Examples"]) for source in sources]

# Use UMap to reduce the dimensions
if TargetDimensions < Dimensions:
    umap = UMAP(n_components=TargetDimensions)
    embeddings = umap.fit_transform(embeddings)
    embeddings = normalize(embeddings, norm="l2")
    print("Embeddings reduced:", embeddings.shape)

# Calculate distances
distances = pairwise_distances(embeddings, embeddings, metric=Metrics, n_jobs=cpus)

# Consdense distances
condensed_distances = squareform(distances)

# For average sizes, we only consider those with more than 1
sizes_for_calc = [len(examples[i]) for i in range(Items) if len(examples[i]) > 1]
avg_size = np.mean(sizes_for_calc)
max_size = avg_size * 3
penalty_coff = max_size - avg_size
print("Average size:", avg_size, ", Max penalty size:", max_size)


def count_merged(code1, code2):
    """Calculate the unique differences of examples after merged."""
    return len(examples[code1] - examples[code2]) / len(
        examples[code1] | examples[code2]
    )


# Calculate the penalty on the distance based on number of differences
for i in range(Items):
    for j in range(Items):
        if distances[i][j] > MinDistance:
            penalty = count_merged(i, j)
            penalty = penalty * penalty
            distances[i][j] += penalty * Penalty

# Calculate the linkage
linkages = linkage(condensed_distances, method=Linkage)
root = to_tree(linkages)

tree_examples = {}


def pre_traverse(node):
    """Pre-traverse the tree for bottom-up depth (leaf = size of the leaf, root = total_size)."""
    if node.is_leaf():
        return examples[node.id]
    tree_examples[node.id] = pre_traverse(node.get_left()) | pre_traverse(
        node.get_right()
    )
    return tree_examples[node.id]


total_size = len(pre_traverse(root))

# Default cluster: -1, 100%
cluster_index = 0
clusters = np.full(Items, -1)
probs = np.full(Items, 1.0)
colors = {}


def traverse(node, depth, cluster=-1, prob=1, color="#cccccc"):
    """Traverse the tree."""
    global cluster_index
    colors[node.id] = color
    # If it is a leaf, assign the cluster
    if node.is_leaf():
        clusters[node.id] = cluster
        probs[node.id] = prob
        return 1
    # If it is not a leaf, check if it is a cluster
    # Apply the maximum penalty when the new size is 3 * std_size larger than the average
    penalty = min(1, max(0, (len(tree_examples[node.id]) - avg_size) / penalty_coff))
    penalty = penalty * penalty
    criteria = max(MaxDistance - penalty * Penalty, MinDistance)
    # print("Node:", node.id, ", Size:", len(tree_examples[node.id]), ", % Penalty:", penalty, ", Distance:", node.dist, ", Criteria:", criteria)
    # Verbose: show the cluster
    # left_id = node.get_left().id
    # leftlabel = labels[left_id] if left_id < Items else "cluster-" + str(left_id)
    # right_id = node.get_right().id
    # rightlabel = labels[right_id] if right_id < Items else "cluster-" + str(right_id)
    if cluster == -1 and node.dist <= criteria:
        cluster = cluster_index
        cluster_index += 1
        color = "#000000"
        prob = max(1 - node.dist, 0)
    colors[node.id] = color
    # Traverse the children
    return traverse(node.get_left(), depth + 1, cluster, prob, color) + traverse(
        node.get_right(), depth + 1, cluster, prob, color
    )


nodes = traverse(root, 0)

# Plot the distribution of distances with log scale
# if False:
#     fig, ax = plt.subplots()
#     # Filter out distances > 0.8
#     distances = distances[distances < 0.7]
#     ax.hist(distances.flatten(), bins=70, log=True)
#     ax.set_xlabel("Distance")
#     ax.set_ylabel("Log Frequency")
#     ax.set_title("Distribution of Distances")
#     wm = plt.get_current_fig_manager()
#     wm.window.state("zoomed")
#     plt.show()

# Plot the dendrogram
if Plotting:
    fig = plt.figure()
    ax = fig.add_subplot(1, 1, 1)
    dendrogram(
        linkages,
        labels=labels,
        ax=ax,
        orientation="right",
        link_color_func=lambda k: colors[k],
    )
    ax.tick_params(axis="x", which="major", labelsize=10)
    ax.tick_params(axis="y", which="major", labelsize=10)
    wm = plt.get_current_fig_manager()
    if wm is not None:
        wm.window.state("zoomed")  # type: ignore
    plt.show()

# Send the results
print(json.dumps([clusters.tolist(), probs.tolist()]))
