import sys
import numpy as np
import multiprocessing

cpus = multiprocessing.cpu_count()

# Get the arguments
Dimensions = int(sys.argv[1])
Embeddings = int(sys.argv[2])
Metrics = sys.argv[3] if len(sys.argv) > 3 else "cosine"
Linkage = sys.argv[4] if len(sys.argv) > 4 else "complete"
MinDistance = float(sys.argv[5]) if len(sys.argv) > 5 else 0.25
TargetDimensions = int(sys.argv[6]) if len(sys.argv) > 6 else Dimensions
Plotting = bool(sys.argv[7]) if len(sys.argv) > 7 else False
print("Linkage:", Linkage, ", MinDistance:", MinDistance, ", Metrics:", Metrics, ", Target Dimensions:", TargetDimensions)

# Read from `./known/temp.bytes`
with open("./known/temp.bytes", "rb") as file:
    # Read the bytes
    float_bytes = file.read(Dimensions * Embeddings * 4)  # 4 bytes per float
    # Convert the bytes to floats
    embeddings = np.frombuffer(float_bytes, dtype=np.float32)
    # print("Embeddings received:", len(embeddings), ", expected:", Dimensions * Embeddings)

# Reshape the embeddings
embeddings = embeddings.reshape((Embeddings, Dimensions))

# Use UMap to reduce the dimensions
from umap import UMAP
if TargetDimensions < Dimensions:
    umap = UMAP(n_components = TargetDimensions)
    embeddings = umap.fit_transform(embeddings)
    print("Embeddings reduced:", embeddings.shape)

# Calculate distances
from sklearn.metrics.pairwise import pairwise_distances
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
    import matplotlib.pyplot as plt
    plt.hist(hist_distances, bins=100)
    plt.show()

# Send into DBScan
import json
from sklearn.cluster import AgglomerativeClustering
# from sklearn.preprocessing import normalize
# norm_embeddings = normalize(embeddings, norm='l2')
db = AgglomerativeClustering(n_clusters=None, distance_threshold=MinDistance, linkage=Linkage, metric="precomputed")
db.fit(distances)

print(json.dumps([db.labels_.tolist(), np.ones(Embeddings).tolist()]))