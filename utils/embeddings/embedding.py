"""
Processes embeddings
"""

import multiprocessing
import os
import sys

import numpy as np

cpus = multiprocessing.cpu_count()

# Get the arguments
Dimensions = int(sys.argv[1])
Items = int(sys.argv[2])

# Read from `./known/temp.bytes`
with open("./known/temp.bytes", "rb") as file:
    # Calculate the number of embeddings if not provided
    Items = (
        int(os.stat("./known/temp.bytes").st_size / (Dimensions * 4))
        if Items == 0
        else Items
    )
    # Read the bytes
    float_bytes = file.read(Dimensions * Items * 4)  # 4 bytes per float
    # Convert the bytes to floats
    embeddings = np.frombuffer(float_bytes, dtype=np.float32)
    # print("Embeddings received:", len(embeddings), ", expected:", Dimensions * Embeddings)

# Read from `./known.temp.text` for labels
with open("./known/temp.text", "r", encoding="utf-8") as file:
    labels = file.read().splitlines()

# Reshape the embeddings
embeddings = embeddings.reshape((Items, Dimensions))
