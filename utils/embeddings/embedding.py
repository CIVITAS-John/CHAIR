"""
Processes embeddings
"""

import json
import multiprocessing
import os
import sys
from typing import List, TypedDict

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

# Read from `./known/temp.json` for labels
Source = TypedDict(
    "Source",
    {
        "Label": str,
        "Examples": List[str],
    },
)
with open("./known/temp.json", "r", encoding="utf-8") as file:  # type: ignore
    sources: List[Source] = json.load(file)

# Reshape the embeddings
embeddings = embeddings.reshape((Items, Dimensions))
