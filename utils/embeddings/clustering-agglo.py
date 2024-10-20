import sys
import numpy as np
from embedding import Dimensions, Items, cpus, labels, embeddings

# Hierarchical Agglomerative Clustering

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "cosine"
Linkage = sys.argv[4] if len(sys.argv) > 4 else "average"
MaxDistance = float(sys.argv[5]) if len(sys.argv) > 5 else 0.25
TargetDimensions = int(sys.argv[6]) if len(sys.argv) > 6 else Dimensions
Plotting = bool(sys.argv[7]) if len(sys.argv) > 7 else True
print("Linkage:", Linkage, ", MaxDistance:", MaxDistance, ", Metrics:", Metrics, ", Target Dimensions:", TargetDimensions)

# Use UMap to reduce the dimensions
from umap import UMAP
if TargetDimensions < Dimensions:
    umap = UMAP(n_components = TargetDimensions)
    embeddings = umap.fit_transform(embeddings)
    # from sklearn.preprocessing import normalize
    # embeddings = normalize(embeddings, norm='l2')
    print("Embeddings reduced:", embeddings.shape)

# Calculate distances
from sklearn.metrics.pairwise import pairwise_distances
distances = pairwise_distances(embeddings, embeddings, metric=Metrics, n_jobs=cpus)

# Plot the clusters
from scipy.cluster.hierarchy import dendrogram
import matplotlib.pyplot as plt
def plot_dendrogram(model, **kwargs):
    # Create linkage matrix and then plot the dendrogram

    # create the counts of samples under each node
    counts = np.zeros(model.children_.shape[0])
    n_samples = len(model.labels_)
    for i, merge in enumerate(model.children_):
        current_count = 0
        for child_idx in merge:
            if child_idx < n_samples:
                current_count += 1  # leaf node
            else:
                current_count += counts[child_idx - n_samples]
        counts[i] = current_count

    linkage_matrix = np.column_stack(
        [model.children_, model.distances_, counts]
    ).astype(float)

    # Maximize the dendrogram
    wm = plt.get_current_fig_manager()
    wm.window.state('zoomed')

    # Plot the corresponding dendrogram
    dendrogram(linkage_matrix, **kwargs)

# Send into Clustering
from sklearn.cluster import AgglomerativeClustering
db = AgglomerativeClustering(n_clusters=None, distance_threshold=MaxDistance, metric="precomputed", linkage=Linkage)
db.fit(distances)

# Plot the distances
if Plotting:
    # Do a dendrogram
    plot_dendrogram(db, truncate_mode=None, labels=labels)

    # Exclude the diagonal on a new instance
    hist_distances = np.copy(distances)
    np.fill_diagonal(hist_distances, 1)

    # Do a histogram of the distances
    hist_distances = hist_distances.min(axis=1)
    hist_distances = hist_distances[hist_distances < 1]
    hist_distances = hist_distances[hist_distances > 0]
    import matplotlib.pyplot as plt
    plt.hist(hist_distances, bins=100)
    plt.show()

# Send the results
import json
print(json.dumps([db.labels_.tolist(), np.ones(Items).tolist()]))
