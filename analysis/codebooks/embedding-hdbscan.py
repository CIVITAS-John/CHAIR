import sys
import numpy as np
import multiprocessing

cpus = multiprocessing.cpu_count()

# Get the arguments
Dimensions = int(sys.argv[1])
Embeddings = int(sys.argv[2])
Method = sys.argv[3] if len(sys.argv) > 3 else "leaf"
MinCluster = float(sys.argv[4]) if len(sys.argv) > 4 else 2
MinSamples = float(sys.argv[5]) if len(sys.argv) > 5 else 1
print("Method:", Method, ", MinCluster:", MinCluster, ", MinSamples:", MinSamples)

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

# Calculate distances
from sklearn.metrics.pairwise import pairwise_distances
distances = pairwise_distances(embeddings, embeddings, metric='cosine', n_jobs=cpus)

# Send into HDBScan
import json
import hdbscan
hdb = hdbscan.HDBSCAN(min_cluster_size = MinCluster, min_samples = MinSamples, cluster_selection_method = Method, core_dist_n_jobs = cpus, metric = 'precomputed') # , prediction_data = True
hdb.fit(distances.astype(np.float64))
print(json.dumps([hdb.labels_.tolist(), hdb.probabilities_.tolist()]))

# Here, we try to use the soft clustering to produce more nuanced probabilities
# Unfortunately, I don't think that really make a difference - except for more time spent and weird chances returned
# membership = hdbscan.all_points_membership_vectors(hdb)
# labels = [int(np.argmax(x)) for x in membership]
# probabilities = [float(np.max(x)) for x in membership]
# print(json.dumps([hdb.labels_.tolist(), probabilities]))

# Use UMap to reduce the dimensions for potential visualization
from umap import UMAP
umap = UMAP(n_components = 2)
reduced_embeddings = umap.fit_transform(embeddings)
# print("Embeddings reduced:", reduced_embeddings.shape)