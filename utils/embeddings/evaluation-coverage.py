"""
Evaluate coverage of codebooks through KDE
"""

import json
import math
import sys
from typing import cast

import matplotlib.patheffects as PathEffects
import matplotlib.pyplot as plt
import matplotlib.transforms as mtransforms
import numpy as np
from embedding import cpus, embeddings, load_temp_json
from matplotlib.markers import MarkerStyle
from numpy.typing import NDArray
from scipy.stats import gaussian_kde
from sklearn.metrics.pairwise import pairwise_distances
from sklearn.preprocessing import normalize
from umap import UMAP

labels_meta = load_temp_json("evaluation")

# Get the arguments
# Owners = int(sys.argv[3]) if len(sys.argv) > 3 else 2
Owners = len(labels_meta["OwnerLabels"])
Visualize = sys.argv[4].lower() == "true" if len(sys.argv) > 4 else False
OutputPath = sys.argv[5] if len(sys.argv) > 5 else "./known"
print("Owners:", Owners, ", Visualize:", Visualize)

# Seperate owners' names from labels (the first few items)
# groups = labels[:Owners]
groups = labels_meta["OwnerLabels"]
group_ids = list(range(Owners))
# labels = labels[Owners:]
labels_objs = labels_meta["Labels"]

# Separate the owners from labels (format: owner1,owner2,owner3|label)
# if labels[0].count("|") > 0:
#     _owners = [label.split("|")[0].split(",") for label in labels]
#     owners = [{int(owner) for owner in owner_list} for owner_list in _owners]
#     labels = [label.split("|")[1] for label in labels]
# else:
#     owners = [{0}] * len(labels)

# Separate the owners from labels (format: {"Label": str, "Owners": List[int]} )
owners = [set(label["Owners"]) for label in labels_objs]
labels = [label["Label"] for label in labels_objs]

# Calculate the distance matrix
embeddings = normalize(embeddings, norm="l2")
distances = pairwise_distances(embeddings, embeddings, metric="euclidean", n_jobs=cpus)

# Use UMap to reduce the dimensions
umap = UMAP(n_components=2, metric="precomputed")  # densmap=True,
embeddings = cast(NDArray[np.float32], umap.fit_transform(distances))
x, y = embeddings[:, 0], embeddings[:, 1]
print("Embeddings reduced:", embeddings.shape)

# The output of UMap does not need to be normalized.
# from sklearn.preprocessing import StandardScaler, MinMaxScaler
# scaler = StandardScaler()
# embeddings = scaler.fit_transform(embeddings)
# scaler = MinMaxScaler(feature_range=(-1, 1))
# embeddings = scaler.fit_transform(embeddings)

# However, we need to calculate the bounds and total area.
RESOLUTION = 25
INV_RESOLUTION = 1 / RESOLUTION
extent = (
    math.floor(np.min(x)),
    math.ceil(np.max(x)),
    math.floor(np.min(y)),
    math.ceil(np.max(y)),
)
total_area = (extent[1] - extent[0]) * (extent[3] - extent[2])
xlist = np.linspace(
    extent[0], extent[1], (extent[1] - extent[0]) * RESOLUTION
)  # 0.04 per step
ylist = np.linspace(extent[2], extent[3], (extent[3] - extent[2]) * RESOLUTION)
xgrid, ygrid = np.meshgrid(xlist, ylist)

# Calculate the bandwidth
bandwidth = math.sqrt((extent[1] - extent[0]) * (extent[3] - extent[2])) / (
    math.sqrt(max(10, len(x))) * 4
)


def get_distribution(owner):
    """Calculating KDE."""
    idx = [j for j in range(len(labels)) if owner in owners[j]]
    x1, y1 = x[idx], y[idx]
    # Get the evaluator
    kde = gaussian_kde(np.vstack([x1, y1]), bw_method=bandwidth)
    result = kde(np.vstack([xgrid.ravel(), ygrid.ravel()])).reshape(xgrid.shape)
    # Normalize the result to level the playground between codebooks
    # Note that the entirety of area size under the KDE curve = 1
    # Which means the value for each resolution*resolution cell,
    # density * len(embeddings) = expected frequency for resolution*resolution
    return result * len(x1)


# Compute the KDE
reference_distribution = get_distribution(0)
total_cells = reference_distribution.size
print("Bandwidth:", bandwidth, ", Area:", total_area, ", Cells:", total_cells)

# Calculate the minimum expected density
# Here, the problem is: we don't know how much is really needed
# for a cell to be considered as "covered"
# Thankfully, we are only making a relative metrics
# For example, if we want to recognize cells denser than half of a hypothetical uniform distribution
# min_density_per_cell * (0.04 * 0.04) * total_cells = len(embeddings) * 0.5
min_density = len(embeddings) / (INV_RESOLUTION * INV_RESOLUTION) / total_cells * 0.5
max_density = np.percentile(
    reference_distribution[reference_distribution > min_density], 90
)
print("Density clamp range:", min_density, max_density)


def get_spread(distribution):
    """Calculating spread and density."""
    count = np.where(distribution > min_density, 1, 0).sum()
    return count / total_cells


evaluation = {}


def get_density(distribution, _spread):
    """
    Calculating density
    density_per_1% = len(embeddings) / spread / 100
    density_per_cell * (0.04 * 0.04) * (total_cells * spread) = len(embeddings)
    """
    dist = distribution[distribution > min_density]
    mean = dist.mean()
    variation = dist.var() / dist.mean()
    coefficient = 1 * (INV_RESOLUTION * INV_RESOLUTION) * total_cells / 100
    print("Density:", mean, ", Variation:", variation, ", Coefficient:", coefficient)
    return [mean * coefficient, variation]


reference_spread = get_spread(reference_distribution)
reference_density, reference_variance = get_density(
    reference_distribution, reference_spread
)
print(
    "Reference spread:",
    reference_spread,
    ", density",
    reference_density,
    ", variation",
    reference_variance,
)

# Calculate sub-distributions
distributions = [get_distribution(codebook) for codebook in group_ids[1:]]

# Calculate the overlapping distribution
overlapping = np.zeros(reference_distribution.shape)
for i, distribution in enumerate(distributions):
    overlapping += np.where(distribution > min_density, 1, 0)


plot_size_per_unit = math.ceil(math.sqrt(max(len(embeddings), 100)) / 5)


def plot_comparison(codebooks, distribution, type="heatmap"):
    """Plotting function."""
    codebookset = set(codebooks)
    dis = np.where(distribution < min_density, 0, distribution)  # max_density

    # Handle different numbers of codebooks
    if len(codebooks) == 1:
        # 1 baseline + 1 codebook
        combinations = [
            lambda i, j: codebookset.isdisjoint(i),
            lambda i, j: codebookset.issubset(i),
        ]
        markers = ["o", "s"]
        colors = ["tab:gray", "tab:red"]
        legends = [groups[0], groups[codebooks[0]]]
    elif len(codebooks) == 2:
        # 1 baseline + 2 codebooks
        combinations = [
            lambda i, j: codebookset.isdisjoint(i),
            lambda i, j: codebooks[0] in i,
            lambda i, j: codebooks[1] in i,
            lambda i, j: codebookset.issubset(i),
        ]
        markers = ["o", "o", "o", "lr"]
        colors = ["tab:gray", "tab:red", "tab:blue", ["tab:red", "tab:blue"]]
        legends = [
            groups[0] + " only",
            groups[codebooks[0]],
            groups[codebooks[1]],
            "both",
        ]
    else:
        # 1 baseline + n codebooks
        combinations = [lambda i, j: codebookset.isdisjoint(i)]
        markers = ["o"]
        colors = ["tab:gray"] + ["tab:red"] * len(codebooks)
        legends = ["None of the codebooks"]
        for n in range(len(codebooks)):
            combinations.append(lambda i, j: len(codebookset.intersection(i)) == j)
            markers.append("$" + str(n + 1) + "$")
            legends.append(str(n + 1) + " codebooks")

    # Plotting the heatmap
    fig, ax = plt.subplots(
        figsize=(
            (extent[1] - extent[0] + 1.5) * plot_size_per_unit,
            (extent[3] - extent[2]) * plot_size_per_unit,
        )
    )
    heatmap = (
        ax.imshow(
            overlapping,
            origin="lower",
            vmax=len(codebooks),
            vmin=0,
            extent=extent,
            aspect="auto",
            cmap="magma",
        )
        if type == "overlap"
        else ax.imshow(
            dis,
            origin="lower",
            vmax=max_density,
            vmin=0,
            extent=extent,
            aspect="auto",
            cmap="viridis",
        )
    )

    # Plot the texts
    offset = mtransforms.ScaledTranslation(5 / 72, -3 / 72, plt.gcf().dpi_scale_trans)
    text_transform = ax.transData + offset
    for i, point in enumerate(embeddings):
        is_baseline = combinations[0](owners[i], 0)
        alpha = 0.5 if is_baseline else 1
        txt = ax.text(
            point[0],
            point[1],
            labels[i],
            color="k",
            fontsize=8,
            transform=text_transform,
            alpha=alpha,
        )
        txt.set_path_effects(
            [PathEffects.withStroke(linewidth=1, foreground="w", alpha=0.5 * alpha)]
        )

    # Plot each group with its own color and label
    for i, owner in enumerate(combinations):
        idx = [j for j in range(len(labels)) if owner(owners[j], i)]
        marker = markers[i]
        color = colors[i]
        if marker == "lr":
            ax.scatter(
                x[idx],
                y[idx],
                marker=MarkerStyle(fillstyle="left", marker="o"),
                color=color[0],
            )
            ax.scatter(
                x[idx],
                y[idx],
                marker=MarkerStyle(fillstyle="right", marker="o"),
                color=color[1],
            )
        else:
            ax.scatter(
                x[idx], y[idx], marker=marker, color=color, label=f"{legends[i]}"
            )

    names = [str(codebook) for codebook in codebooks]
    # Setting the labels and limitations
    ax.set_xlim(extent[0], extent[1])
    ax.set_ylim(extent[2], extent[3])
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    if len(codebooks) == 1:
        ax.set_title(
            "Visualization of Codebook " + groups[0] + " (" + type.capitalize() + ")"
        )
    else:
        ax.set_title(
            "Combined Visualization of Codebook "
            + ", ".join(names)
            + " ("
            + type.capitalize()
            + ")"
        )
    ax.legend()

    # Adding a color bar
    cbar = fig.colorbar(heatmap)
    cbar.set_label("Density")

    # Save the plot
    path = OutputPath + "/coverage-" + "-".join(names)
    if type != "heatmap":
        path += "-" + type
    plt.savefig(path + ".png", dpi=160, bbox_inches="tight")
    print("Coverage plot saved to", path)

    # Show the plot
    if Visualize:
        wm = plt.get_current_fig_manager()
        if wm is not None:
            wm.window.state("zoomed")  # type: ignore
        plt.show()


# Plot the combination heatmap
plot_comparison(group_ids[1:], reference_distribution, "heatmap")

# Plot the overlapping heatmap
if Owners > 2:
    plot_comparison(group_ids[1:], reference_distribution, "overlap")

# Here, conformity is defined as the ratio of the spread to the overlapping area
# (where n >= max(2, floor(codebooks / 2)))
meaningful_threshold = max(2, math.floor(len(group_ids[1:]) / 2))
meaningful_overlapping = np.where(overlapping >= meaningful_threshold, 1, 0)
meaningful_area = meaningful_overlapping.sum()
print(
    "Meaningful overlapping area:",
    meaningful_area,
    "based on >=",
    meaningful_threshold,
    "codebooks",
)

# Outliers (measurement of "novelty") are defined as the covered area outside the overlapping one
outlier = np.where(overlapping < meaningful_threshold, 1, 0)
outlier = np.where(overlapping > 0, outlier, 0)
outlier_area = outlier.sum()
print("Outlier area:", outlier_area, "based on <", meaningful_threshold, "codebooks")

# Meanwhile, contributing area is defined as "without you, how much overlapping area will be lost?"
contributing = np.where(overlapping == meaningful_threshold, 1, 0)
contributing_area = contributing.sum()
print(
    "Contributing area:",
    meaningful_area,
    "based on >=",
    meaningful_threshold,
    "codebooks",
)

# Plot the individual heatmaps and evaluate spread and density, and contribution
for i, codebook in enumerate(group_ids[1:]):
    distribution = distributions[i]
    # Calculate the spread and density
    spread = get_spread(distribution)
    density, variation = get_density(distribution, spread)
    # Calculate the overlapping area
    dist = np.where(distribution > min_density, 1, 0)
    conformity = (dist * meaningful_overlapping).sum()
    contribution = (dist * contributing).sum()
    novelty = (dist * outlier).sum()
    # Finish the evaluation
    print(
        "Codebook:",
        codebook,
        ", spread:",
        spread,
        ", density:",
        density,
        ", variation:",
        variation,
        ", conformity:",
        conformity,
        ", contribution:",
        contribution,
        ", novelty:",
        novelty,
    )
    evaluation[codebook] = {
        "Spread": spread / reference_spread,
        "Density": density / reference_density,
        "Variation": variation,
        "Conformity": conformity / meaningful_area,
        "Contribution": contribution / contributing_area,
        "Novelty": novelty / outlier_area,
    }
    # Plot the heatmap
    plot_comparison([codebook], distribution)

# Send the evaluations
print(json.dumps(evaluation))
