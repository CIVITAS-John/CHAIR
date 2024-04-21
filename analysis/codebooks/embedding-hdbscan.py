import sys
import numpy as np

# Get the arguments
Dimensions = int(sys.argv[1])
Embeddings = int(sys.argv[2])

print("Dimensions:", Dimensions)
print("Embeddings:", Embeddings)

# Read from `./known/temp.bytes`
with open("./known/temp.bytes", "rb") as file:
    # Read the bytes
    float_bytes = file.read(Dimensions * Embeddings * 4)  # 4 bytes per float
    # Convert the bytes to floats
    embeddings = np.frombuffer(float_bytes, dtype=np.float32)
    # print("Embeddings received:", len(embeddings), ", expected:", Dimensions * Embeddings)

# Reshape the embeddings
embeddings = embeddings.reshape((Embeddings, Dimensions))
print("Embeddings reshaped:", embeddings.shape)
# print("Example embedding:", embeddings[2])

# Send into HDBScan
import json
from sklearn.cluster import HDBSCAN
from sklearn.preprocessing import normalize
norm_embeddings = normalize(embeddings, norm='l2')
hdb = HDBSCAN(min_cluster_size = 2, min_samples = 2)
hdb.fit(norm_embeddings)
print(json.dumps(hdb.labels_.tolist()))

# Use UMap to reduce the dimensions for potential visualization
from umap import UMAP
umap = UMAP(n_components = 2)
reduced_embeddings = umap.fit_transform(embeddings)
print("Embeddings reduced:", reduced_embeddings.shape)