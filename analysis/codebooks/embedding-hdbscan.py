import sys
import numpy as np
import multiprocessing
import matplotlib.pyplot as plt
import seaborn as sns

cpus = multiprocessing.cpu_count()

# Get the arguments
Dimensions = int(sys.argv[1])
Embeddings = int(sys.argv[2])
Method = sys.argv[3] if len(sys.argv) > 3 else "leaf"
MinCluster = int(sys.argv[4]) if len(sys.argv) > 4 else 2
MinSamples = int(sys.argv[5]) if len(sys.argv) > 5 else 1
Metrics = sys.argv[6] if len(sys.argv) > 6 else "cosine"
TargetDimensions = int(sys.argv[7]) if len(sys.argv) > 7 else Dimensions
print("Method:", Method, ", MinCluster:", MinCluster, ", MinSamples:", MinSamples, ", Metrics:", Metrics, ", Target Dimensions:", TargetDimensions)

# Read from `./known/temp.bytes`
with open("./known/temp.bytes", "rb") as file:
    # Read the bytes
    float_bytes = file.read(Dimensions * Embeddings * 4)  # 4 bytes per float
    # Convert the bytes to floats
    embeddings = np.frombuffer(float_bytes, dtype=np.float32)
    # print("Embeddings received:", len(embeddings), ", expected:", Dimensions * Embeddings)

# Reshape the embeddings
embeddings = embeddings.reshape((Embeddings, Dimensions))
# print("Embeddings reshaped:", embeddings.shape)
# print("Example embedding:", embeddings[2])

# Use UMap to reduce the dimensions
from umap import UMAP
if TargetDimensions < Dimensions:
    umap = UMAP(n_components = TargetDimensions)
    embeddings = umap.fit_transform(embeddings)
    print("Embeddings reduced:", embeddings.shape)

# Calculate distances
from sklearn.metrics.pairwise import pairwise_distances
distances = pairwise_distances(embeddings, embeddings, metric=Metrics, n_jobs=cpus)

# Send into HDBScan
import json
import hdbscan
hdb = hdbscan.HDBSCAN(min_cluster_size = MinCluster, min_samples = MinSamples, cluster_selection_method = Method, core_dist_n_jobs = cpus, metric = 'precomputed') # , prediction_data = True
hdb.fit(distances.astype(np.float64))
print(json.dumps([hdb.labels_.tolist(), hdb.probabilities_.tolist()]))

# Plot the clusters
if TargetDimensions == 2:
    color_palette = sns.color_palette('deep', len(set(hdb.labels_)))
    cluster_colors = [color_palette[x] if x >= 0
                    else (0.5, 0.5, 0.5)
                    for x in hdb.labels_]
    colors = [sns.desaturate(x, p) for x, p in
              zip(cluster_colors, hdb.probabilities_)]
    plt.scatter(embeddings[:, 0], embeddings[:, 1], s=50, linewidth=0, c=colors, alpha=0.25)
    plt.show()