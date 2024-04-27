import sys
import numpy as np
import multiprocessing

cpus = multiprocessing.cpu_count()

# Get the arguments
Dimensions = int(sys.argv[1])
Items = int(sys.argv[2])

# Read from `./known/temp.bytes`
with open("./known/temp.bytes", "rb") as file:
    # Read the bytes
    float_bytes = file.read(Dimensions * Items * 4)  # 4 bytes per float
    # Convert the bytes to floats
    embeddings = np.frombuffer(float_bytes, dtype=np.float32)
    # print("Embeddings received:", len(embeddings), ", expected:", Dimensions * Embeddings)

# Read from `./known.temp.text` for labels
with open("./known/temp.text", "r") as file:
    labels = file.read().splitlines()
    
# Reshape the embeddings
embeddings = embeddings.reshape((Items, Dimensions))