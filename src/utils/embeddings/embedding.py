"""
Processes embeddings
"""

import json
import multiprocessing
import os
import sys
import numpy as np
from typing import List, Literal, TypedDict, cast, overload

cpus = multiprocessing.cpu_count()

# Get the arguments
dims = int(sys.argv[1])
items = int(sys.argv[2])

# Read from `./known/temp.bytes`
with open("./known/temp.bytes", "rb") as file:
    # Calculate the number of embeddings if not provided
    items = (
        int(os.stat("./known/temp.bytes").st_size / (dims * 4)) if items == 0 else items
    )
    # Read the bytes
    float_bytes = file.read(dims * items * 4)  # 4 bytes per float
    # Convert the bytes to floats
    embeddings = np.frombuffer(float_bytes, dtype=np.float32)
    # print("Embeddings received:", len(embeddings), ", expected:", Dimensions * Embeddings)

# Reshape the embeddings
embeddings = embeddings.reshape((items, dims))

# Type for clustering.temp.json
Source = TypedDict(
    "Source",
    {
        "label": str,
        "examples": List[str],
    },
)

# Types for evaluation.temp.json
Label = TypedDict(
    "Label",
    {
        "label": str,
        "owners": List[int],
    },
)
LabelsMeta = TypedDict(
    "LabelsMeta",
    {
        "ownerLabels": List[str],
        "labels": List[Label],
    },
)


@overload
def load_temp_json(mode: Literal["clustering"]) -> List[Source]: ...


@overload
def load_temp_json(mode: Literal["evaluation"]) -> LabelsMeta: ...


def load_temp_json(mode: Literal["clustering", "evaluation"]):
    """Load the temp JSON file from the known directory."""
    with open(f"./known/{mode}.temp.json", "r", encoding="utf-8") as f:
        if mode == "clustering":
            return cast(List[Source], json.load(f))
        if mode == "evaluation":
            return cast(LabelsMeta, json.load(f))
        return None
