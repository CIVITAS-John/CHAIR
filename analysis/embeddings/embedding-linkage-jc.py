import sys
import numpy as np
from embedding import Dimensions, Items, cpus, labels, embeddings

# Linkage-based Clustering - John Chen's heuristic
# The basic idea is to apply a penalty to the distance based on the depth of the tree

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "euclidean"
Linkage = sys.argv[4] if len(sys.argv) > 4 else "ward"
MaxDistance = float(sys.argv[5]) if len(sys.argv) > 5 else 1
Penalty = float(sys.argv[6]) if len(sys.argv) > 6 else 0.25
MinDistance = float(sys.argv[7]) if len(sys.argv) > 7 else 0.25
TargetDimensions = int(sys.argv[8]) if len(sys.argv) > 8 else Dimensions
Plotting = bool(sys.argv[9]) if len(sys.argv) > 9 else False
print("Linkage:", Linkage, ", MaxDistance:", MaxDistance, ", MinDistance:", MinDistance, ", Metrics:", Metrics, ", Target Dimensions:", TargetDimensions)

# Use UMap to reduce the dimensions
from umap import UMAP
if TargetDimensions < Dimensions:
    umap = UMAP(n_components = TargetDimensions)
    embeddings = umap.fit_transform(embeddings)
    from sklearn.preprocessing import normalize
    embeddings = normalize(embeddings, norm='l2')
    print("Embeddings reduced:", embeddings.shape)

# Calculate distances
from sklearn.metrics.pairwise import pairwise_distances
distances = pairwise_distances(embeddings, embeddings, metric=Metrics, n_jobs=cpus)

# Consdense distances
from scipy.spatial.distance import squareform
condensed_distances = squareform(distances)

# Calculate the linkage
from scipy.cluster.hierarchy import linkage, to_tree
linkages = linkage(condensed_distances, method=Linkage)
root = to_tree(linkages)

# Pre-traverse the tree for bottom-up depth (leaf = 0, root = max_depth)
leaf_depths = {}
def pre_traverse(node):
    if node.is_leaf():
        return -1
    leaf_depths[node.id] = max(pre_traverse(node.get_left()), pre_traverse(node.get_right())) + 1
    return leaf_depths[node.id]
max_depth = pre_traverse(root)

# Default cluster: -1, 100%
cluster_index = 0
clusters = np.full(Items, -1)
probs = np.full(Items, 1.0)
colors = {}

# Traverse the tree
def traverse(node, depth, cluster=-1, prob=1, color="#cccccc"):
    global cluster_index
    colors[node.id] = color
    # If it is a leaf, assign the cluster
    if node.is_leaf():
        clusters[node.id] = cluster
        probs[node.id] = prob
        return 1
    # If it is not a leaf, check if it is a cluster
    criteria = max(MaxDistance - leaf_depths[node.id] * Penalty, MinDistance)
    # Verbose: show the cluster
    left_id = node.get_left().id
    leftlabel = labels[left_id] if left_id < Items else "cluster-" + str(left_id)
    right_id = node.get_right().id
    rightlabel = labels[right_id] if right_id < Items else "cluster-" + str(right_id)
    # print("depth", leaf_depths[node.id], "distance", node.dist, leftlabel, rightlabel, criteria, node.dist <= criteria)
    if cluster == -1 and node.dist <= criteria:
        cluster = cluster_index
        cluster_index += 1
        color = "#000000"
    colors[node.id] = color
    # Traverse the children
    return traverse(node.get_left(), depth + 1, cluster, prob, color) + traverse(node.get_right(), depth + 1, cluster, prob, color)
nodes = traverse(root, 0)

# Plot the distances
if Plotting:
    # Do a dendrogram
    from scipy.cluster.hierarchy import dendrogram
    import matplotlib.pyplot as plt
    fig = plt.figure()
    ax = fig.add_subplot(1, 1, 1)
    dendrogram(linkages, labels=labels, ax=ax, orientation='right', link_color_func=lambda k: colors[k])
    ax.tick_params(axis='x', which='major', labelsize=10)
    ax.tick_params(axis='y', which='major', labelsize=10)
    wm = plt.get_current_fig_manager()
    wm.window.state('zoomed')
    plt.show()

# Send the results
import json
print(json.dumps([clusters.tolist(), probs.tolist()]))