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

# Send into DBScan
import json
from sklearn.cluster import DBSCAN
# from sklearn.preprocessing import normalize
# norm_embeddings = normalize(embeddings, norm='l2')
db = DBSCAN(eps = 0.2, min_samples = 1, metric = 'cosine')
db.fit(embeddings)
print(json.dumps([db.labels_.tolist(), np.ones(Embeddings).tolist()]))

# Use UMap to reduce the dimensions for potential visualization
from umap import UMAP
umap = UMAP(n_components = 2)
reduced_embeddings = umap.fit_transform(embeddings)
print("Embeddings reduced:", reduced_embeddings.shape)