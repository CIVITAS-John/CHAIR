"""
Linkage-based Clustering - John Chen's heuristic
A penalty is applied to the relative size (e.g. numbers of examples or codes) of the clusters
"""

import json
import sys

import matplotlib.pyplot as plt
import numpy as np
from embedding import cpus, dims, embeddings, items, load_temp_json
from scipy.cluster.hierarchy import dendrogram, linkage, to_tree
from scipy.spatial.distance import squareform
from sklearn.metrics.pairwise import pairwise_distances
from sklearn.preprocessing import normalize
from umap import UMAP

# Get the arguments
metrics = sys.argv[3] if len(sys.argv) > 3 else "euclidean"
linkage_mtd = sys.argv[4] if len(sys.argv) > 4 else "ward"
max_dist = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6
min_dist = float(sys.argv[6]) if len(sys.argv) > 6 else 0.4
interactive = sys.argv[7].lower() == "true" if len(sys.argv) > 7 else False
tar_dims = int(sys.argv[8]) if len(sys.argv) > 8 else dims
plotting = sys.argv[9] == "True" if len(sys.argv) > 9 else False

# Print the parameters
print(
    "Parameters - Linkage:",
    linkage_mtd,
    ", Metrics:",
    metrics,
    ", Target Dimensions:",
    tar_dims,
    ", Interactive:",
    interactive,
)

# Separate the examples from labels
sources = load_temp_json("clustering")
labels = [source["label"] for source in sources]
examples = [set(source["examples"]) for source in sources]

# Use UMap to reduce the dimensions
if tar_dims < dims:
    umap = UMAP(n_components=tar_dims)
    embeddings = umap.fit_transform(embeddings)
    print("Embeddings reduced:", embeddings.shape)

# Normalized L2 embeddings will make euclidean distance close to cosine distance (same range 0-2, but ^2)
# Many embedding models are already normalized, but we do it here for safety
embeddings = normalize(embeddings, norm="l2")

# Calculate distances
distances = pairwise_distances(embeddings, embeddings, metric=metrics, n_jobs=cpus)

# Consdense distances
condensed_distances = squareform(distances)

# If interactive, visualize the distances
if interactive != False:
    # Create figure with 2 columns - left for histogram, right for tables
    fig = plt.figure(figsize=(20, 8))
    gs = plt.GridSpec(1, 2, width_ratios=[3, 2])

    # Set the window title
    fig.canvas.manager.set_window_title(interactive)

    # Left plot - histogram
    ax_hist = fig.add_subplot(gs[0])
    instruction_text = fig.text(
        0.1,
        0.9,
        "Click to set max distance (red line)\nPress Enter to confirm the choices",
        fontsize=10,
        va="top",
    )

    # Filter and plot histogram as before
    vis_distances = distances[distances < 1]
    vis_distances = vis_distances[vis_distances > 0]
    ax_hist.hist(vis_distances.flatten(), bins=70, log=True)
    ax_hist.set_xlabel("Distance")
    ax_hist.set_ylabel("Log Frequency")
    ax_hist.set_title(
        "Distribution of Code Distances\n0 = Identical, 2 = Vastly Different",
        loc="right",
        pad=10,
    )

    # Initialize lines
    max_line = ax_hist.axvline(max_dist, color="red", linestyle="--", label="Max")
    min_line = ax_hist.axvline(min_dist, color="blue", linestyle="--", label="Min")
    ax_hist.legend()

    # Right side - tables
    ax_tables = fig.add_subplot(gs[1])
    ax_tables.axis("off")

    def update_tables():
        ax_tables.clear()
        ax_tables.axis("off")

        # Get pairs around thresholds
        pairs = []
        for i in range(items):
            for j in range(i + 1, items):
                pairs.append((i, j, distances[i][j]))

        # Sort by distance
        pairs.sort(key=lambda x: -x[2])

        # Find pairs around max/min thresholds
        max_pairs = []
        min_pairs = []
        for i, j, dist in pairs:
            if max_dist > dist:
                max_pairs.append((labels[i], labels[j], f"{dist:.3f}"))
            if min_dist > dist:
                min_pairs.append((labels[i], labels[j], f"{dist:.3f}"))
            if len(max_pairs) >= 10 and len(min_pairs) >= 10:
                break

        # Create table data
        max_table_data = max_pairs[:10]
        min_table_data = min_pairs[:10]

        # Handle case where there are no pairs
        if len(max_table_data) == 0:
            max_table_data = [("No pairs found", "", "")]
        if len(min_table_data) == 0:
            min_table_data = [("No pairs found", "", "")]

        # Add tables
        ax_tables.text(
            0.05,
            1,
            f"Pairs Near Max Threshold = {max_dist:.2f}",
            fontsize=12,
            fontweight="bold",
        )
        ax_tables.text(
            0.05,
            0.97,
            "Codes under the threshold can be merged when examples are similar",
            fontsize=10,
        )
        max_table = ax_tables.table(
            cellText=max_table_data,
            colLabels=["Code 1", "Code 2", "Dist"],
            loc="top",
            cellLoc="left",
            bbox=[0.05, 0.55, 0.9, 0.4],
            colWidths=[0.45, 0.45, 0.1],
        )
        max_table.auto_set_font_size(False)
        max_table.set_fontsize(9)

        # Adjust cell padding for max_table
        for cell in max_table._cells.values():
            cell.PAD = 0.02

        ax_tables.text(
            0.05,
            0.5,
            f"Pairs Near Min Threshold = {min_dist:.2f}",
            fontsize=12,
            fontweight="bold",
        )
        ax_tables.text(
            0.05, 0.47, "Codes under the threshold will always be merged", fontsize=10
        )

        min_table = ax_tables.table(
            cellText=min_table_data,
            colLabels=["Code 1", "Code 2", "Dist"],
            loc="top",
            cellLoc="left",
            bbox=[0.05, 0.05, 0.9, 0.4],
            colWidths=[0.45, 0.45, 0.1],
        )
        min_table.auto_set_font_size(False)
        min_table.set_fontsize(9)

        # Adjust cell padding for max_table
        for cell in min_table._cells.values():
            cell.PAD = 0.02

        fig.canvas.draw()

    # Key event handler to close the plot
    def onkey(event):
        if event.key == "enter":
            plt.close()

    # Update click handler to refresh tables
    update_max = True  # Start with max threshold

    def onclick(event):
        global max_dist, min_dist, update_max
        if event.inaxes != ax_hist:
            return

        if update_max:
            max_dist = round(event.xdata, 2)
            max_dist = max(max_dist, min_dist)
            max_line.set_xdata([max_dist, max_dist])
            instruction_text.set_text(
                "Click to set min threshold (blue line)\nPress Enter to confirm the choices"
            )
        else:
            min_dist = round(event.xdata, 2)
            min_dist = min(min_dist, max_dist)
            min_line.set_xdata([min_dist, min_dist])
            instruction_text.set_text(
                "Click to set max threshold (red line)\nPress Enter to confirm the choices"
            )

        update_max = not update_max
        update_tables()

    # Initial table update
    update_tables()

    # Connect the event handlers
    fig.canvas.mpl_connect("button_press_event", onclick)
    fig.canvas.mpl_connect("key_press_event", onkey)

    # Show the plot
    plt.tight_layout()
    plt.subplots_adjust(top=0.85)
    plt.show()

# Print the hyperparameters
g_penalty = max_dist - min_dist
print(
    "Hyperparameters - Max Distance:",
    max_dist,
    ", MinDistance:",
    min_dist,
    ", Penalty Coefficient:",
    g_penalty,
)

# For average sizes, we only consider those with more than 1
sizes_for_calc = [len(examples[i]) for i in range(items) if len(examples[i]) > 1]
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
for i in range(items):
    for j in range(items):
        if distances[i][j] > min_dist:
            penalty = count_merged(i, j)
            penalty = penalty * penalty
            distances[i][j] += penalty * g_penalty

# Calculate the linkage
linkages = linkage(condensed_distances, method=linkage_mtd)
root = to_tree(linkages)

tree_examples = {}


# Pre-traverse the tree to get the sizes of the leaves and compile the examples
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
clusters = np.full(items, -1)
probs = np.full(items, 1.0)
colors = {}


# Traverse the tree
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
    t_penalty = min(1, max(0, (len(tree_examples[node.id]) - avg_size) / penalty_coff))
    t_penalty = t_penalty * t_penalty
    criteria = max(max_dist - t_penalty * g_penalty, min_dist)

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

# Plot the dendrogram
if plotting:
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

# Send the results:
print(json.dumps([clusters.tolist(), probs.tolist(), max_dist, min_dist]))
