"""
Processes embeddings
"""

import json
import multiprocessing
import os
import sys
from typing import List, Literal, TypedDict, cast, overload

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

# Reshape the embeddings
embeddings = embeddings.reshape((Items, Dimensions))

# Type for clustering.temp.json
Source = TypedDict(
    "Source",
    {
        "Label": str,
        "Examples": List[str],
    },
)

# Types for evaluation.temp.json
Label = TypedDict(
    "Label",
    {
        "Label": str,
        "Owners": List[int],
    },
)
LabelsMeta = TypedDict(
    "LabelsMeta",
    {
        "OwnerLabels": List[str],
        "Labels": List[Label],
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
