import sys
import numpy as np
from embedding import Dimensions, Items, cpus, labels, embeddings

# Linkage-based Clustering - John Chen's heuristic
# A penalty is applied to the relative size (e.g. numbers of examples or codes) of the clusters

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "euclidean"
Linkage = sys.argv[4] if len(sys.argv) > 4 else "ward"
MaxDistance = float(sys.argv[5]) if len(sys.argv) > 5 else 0.7
MinDistance = float(sys.argv[6]) if len(sys.argv) > 6 else 0.4
TargetDimensions = int(sys.argv[7]) if len(sys.argv) > 7 else Dimensions
Plotting = bool(sys.argv[8]) if len(sys.argv) > 8 else False
Penalty = MaxDistance - MinDistance
print("Linkage:", Linkage, ", MaxDistance:", MaxDistance, ", MinDistance:", MinDistance, ", Metrics:", Metrics, ", Target Dimensions:", TargetDimensions)

# Separate the sizes from labels
# The format: label|||size
sizes = [int(label.split("|||")[1]) for label in labels]
labels = [label.split("|||")[0] for label in labels]

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

# For average sizes, we only consider those with more than 1
sizes_for_calc = [size for size in sizes if size > 1]
avg_size = np.mean(sizes_for_calc)
std_size = np.std(sizes_for_calc)
print("Average size:", avg_size, ", Standard deviation:", std_size)

# Calculate the penalty on the distance - we calculated twice: once on the distance matrix, once on the linkage
# The rationale is that we want to avoid having a few large clusters and many small clusters
for i in range(Items):
    for j in range(Items):
        penalty = min(1, max(0, (sizes[i] + sizes[j] - avg_size) / 3 / std_size))
        penalty = penalty * penalty
        distances[i][j] += penalty * Penalty

# Calculate the linkage
from scipy.cluster.hierarchy import linkage, to_tree
linkages = linkage(condensed_distances, method=Linkage)
root = to_tree(linkages)

# Pre-traverse the tree for bottom-up depth (leaf = size of the leaf, root = total_size)
leaf_sizes = {}
def pre_traverse(node):
    if node.is_leaf():
        return sizes[node.id]
    leaf_sizes[node.id] = pre_traverse(node.get_left()) + pre_traverse(node.get_right())
    return leaf_sizes[node.id]
total_size = pre_traverse(root)

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
    # Apply the maximum penalty when the new size is 3 * std_size larger than the average
    penalty = min(1, max(0, (leaf_sizes[node.id] - avg_size) / 2 / std_size))
    penalty = penalty * penalty
    criteria = max(MaxDistance - penalty * Penalty, MinDistance)
    # print("Node:", node.id, ", Size:", leaf_sizes[node.id], ", % Penalty:", penalty, ", Distance:", node.dist, ", Criteria:", criteria)
    # Verbose: show the cluster
    left_id = node.get_left().id
    leftlabel = labels[left_id] if left_id < Items else "cluster-" + str(left_id)
    right_id = node.get_right().id
    rightlabel = labels[right_id] if right_id < Items else "cluster-" + str(right_id)
    if cluster == -1 and node.dist <= criteria:
        cluster = cluster_index
        cluster_index += 1
        color = "#000000"
        prob = max(1 - node.dist, 0)
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