import sys
import os
import numpy as np
import math
import matplotlib.pyplot as plt
import matplotlib.patheffects as PathEffects
import matplotlib.transforms as mtransforms
from matplotlib.markers import MarkerStyle
from embedding import Dimensions, Items, cpus, labels, embeddings

# Evaluate coverage of codebooks through KDE
# Get the arguments
Owners = int(sys.argv[3]) if len(sys.argv) > 3 else 2
Visualize = sys.argv[4].lower() == "true" if len(sys.argv) > 4 else False
OutputPath = sys.argv[5] if len(sys.argv) > 5 else './known'
print('Owners:', Owners, ', Visualize:', Visualize)

# Seperate owners' names from labels (the first few items)
groups = labels[:Owners]
group_ids = [i for i in range(Owners)]
labels = labels[Owners:]

# Separate the owners from labels (format: owner1,owner2,owner3|label)
if labels[0].count('|') > 0:
    owners = [label.split('|')[0].split(',') for label in labels]
    owners = [set([int(owner) for owner in owner_list]) for owner_list in owners]
    labels = [label.split('|')[1] for label in labels]
else:
    owners = [{0}] * len(labels)

# Calculate the distance matrix
from sklearn.metrics.pairwise import pairwise_distances
from sklearn.preprocessing import normalize
embeddings = normalize(embeddings, norm='l2')
distances = pairwise_distances(embeddings, embeddings, metric='euclidean', n_jobs=cpus)

# Use UMap to reduce the dimensions
from umap import UMAP
umap = UMAP(n_components=2, metric='precomputed') # densmap=True, 
embeddings = umap.fit_transform(distances)
x, y = embeddings[:, 0], embeddings[:, 1]
print("Embeddings reduced:", embeddings.shape)

# The output of UMap does not need to be normalized.
# from sklearn.preprocessing import StandardScaler, MinMaxScaler
# scaler = StandardScaler()
# embeddings = scaler.fit_transform(embeddings)
# scaler = MinMaxScaler(feature_range=(-1, 1))
# embeddings = scaler.fit_transform(embeddings)

# However, we need to calculate the bounds and total area.
resolution = 25
inv_resolution = 1 / resolution
extent = [math.floor(np.min(x)), math.ceil(np.max(x)), math.floor(np.min(y)), math.ceil(np.max(y))]
total_area = (extent[1] - extent[0]) * (extent[3] - extent[2])
xlist = np.linspace(extent[0], extent[1], (extent[1] - extent[0]) * resolution) # 0.04 per step
ylist = np.linspace(extent[2], extent[3], (extent[3] - extent[2]) * resolution)
xgrid, ygrid = np.meshgrid(xlist, ylist)

# Calculate the bandwidth
bandwidth = math.sqrt((extent[1] - extent[0]) * (extent[3] - extent[2])) / (math.sqrt(max(10, len(x))) * 4)

# Calculating KDE
def get_distribution(owner):
    from scipy.stats import gaussian_kde
    idx = [j for j in range(len(labels)) if owner in owners[j]]
    x1, y1 = x[idx], y[idx]
    # Get the evaluator
    kde = gaussian_kde(np.vstack([x1, y1]), bw_method=bandwidth)
    result = kde(np.vstack([xgrid.ravel(), ygrid.ravel()])).reshape(xgrid.shape)
    # Normalize the result to level the playground between codebooks
    # Note that the entirety of area size under the KDE curve = 1
    # Which means the value for each resolution*resolution cell, density * len(embeddings) = expected frequency for resolution*resolution
    return result * len(x1)

# Compute the KDE
reference_distribution = get_distribution(0)
total_cells = reference_distribution.size
print('Bandwidth:', bandwidth, ", Area:", total_area, ", Cells:", total_cells)

# Calculate the minimum expected density
# Here, the problem is: we don't know how much is really needed for a cell to be considered as "covered"
# Thankfully, we are only making a relative metrics
# For example, if we want to recognize cells denser than half of a hypothetical uniform distribution
# min_density_per_cell * (0.04 * 0.04) * total_cells = len(embeddings) * 0.5
min_density = len(embeddings) / (inv_resolution * inv_resolution) / total_cells * 0.5
max_density = np.percentile(reference_distribution[reference_distribution > min_density], 90)
print('Density clamp range:', min_density, max_density)

# Calculating spread and density
def get_spread(distribution):
    count = np.where(distribution > min_density, 1, 0).sum()
    return count / total_cells

# Calculating density
# density_per_1% = len(embeddings) / spread / 100
# density_per_cell * (0.04 * 0.04) * (total_cells * spread) = len(embeddings)
evaluation = {}
def get_density(distribution, spread):
    dist = distribution[distribution > min_density]
    mean = dist.mean()
    variation = dist.var() / dist.mean()
    coefficient = 1 * (inv_resolution * inv_resolution) * total_cells / 100
    print('Density:', mean, ', Variation:', variation, ', Coefficient:', coefficient)
    return [mean * coefficient, variation]

reference_spread = get_spread(reference_distribution)
reference_density, reference_variance = get_density(reference_distribution, reference_spread)
print('Reference spread:', reference_spread, ", density", reference_density, ", variation", reference_variance)

# Calculate sub-distributions
distributions = [get_distribution(codebook) for codebook in group_ids[1:]]

# Calculate the overlapping distribution
overlapping = np.zeros(reference_distribution.shape)
for i, distribution in enumerate(distributions):
    overlapping += np.where(distribution > min_density, 1, 0)

# Plotting function
plot_size_per_unit = math.ceil(math.sqrt(max(len(embeddings), 100)) / 5)
def plot_comparison(codebooks, distribution, type='heatmap'):
    codebookset = set(codebooks)
    dis = np.where(distribution < min_density, 0, distribution) # max_density

    # Handle different numbers of codebooks
    if len(codebooks) == 1:
        # 1 baseline + 1 codebook
        combinations = [lambda i, j: codebookset.isdisjoint(i), lambda i, j: codebookset.issubset(i)]
        markers = ['o', 's']
        colors = ['tab:gray', 'tab:red']
        legends = [groups[0], groups[codebooks[0]]]
    elif len(codebooks) == 2:
        # 1 baseline + 2 codebooks
        combinations = [lambda i, j: codebookset.isdisjoint(i), lambda i, j: codebooks[0] in i, lambda i, j: codebooks[1] in i, lambda i, j: codebookset.issubset(i)]
        markers = ['o', 'o', 'o', 'lr']
        colors = ['tab:gray', 'tab:red', 'tab:blue', ['tab:red', 'tab:blue']]
        legends = [groups[0] + ' only', groups[codebooks[0]], groups[codebooks[1]], 'both']
    else:
        # 1 baseline + n codebooks
        combinations = [lambda i, j: codebookset.isdisjoint(i)]
        markers = ['o']
        colors = ['tab:gray'] + ['tab:red'] * len(codebooks)
        legends = ['None of the codebooks']
        for n in range(len(codebooks)):
            combinations.append(lambda i, j: len(codebookset.intersection(i)) == j)
            markers.append('$' + str(n + 1) + '$')
            legends.append(str(n + 1) + ' codebooks')

    # Plotting the heatmap
    fig, ax = plt.subplots(figsize=((extent[1] - extent[0] + 1.5) * plot_size_per_unit, (extent[3] - extent[2]) * plot_size_per_unit))
    if type == 'overlap':
        heatmap = ax.imshow(overlapping, origin='lower', vmax=len(codebooks), vmin=0, extent=extent, aspect='auto', cmap='magma')
    elif type == 'heatmap':
        heatmap = ax.imshow(dis, origin='lower', vmax=max_density, vmin=0, extent=extent, aspect='auto', cmap='viridis')

    # Plot the texts
    offset = mtransforms.ScaledTranslation(5/72, -3/72, plt.gcf().dpi_scale_trans)
    text_transform = ax.transData + offset
    for i, point in enumerate(embeddings):
        is_baseline = combinations[0](owners[i], 0)
        alpha = 0.5 if is_baseline else 1
        txt = ax.text(point[0], point[1], labels[i], color='k', fontsize=8, transform=text_transform, alpha=alpha)
        txt.set_path_effects([PathEffects.withStroke(linewidth=1, foreground='w', alpha=0.5 * alpha)])

    # Plot each group with its own color and label
    for i, owner in enumerate(combinations):
        idx = [j for j in range(len(labels)) if owner(owners[j], i) == True]
        marker = markers[i]
        color = colors[i]
        if marker == 'lr':
            ax.scatter(x[idx], y[idx], marker=MarkerStyle(fillstyle='left', marker='o'), color=color[0])
            ax.scatter(x[idx], y[idx], marker=MarkerStyle(fillstyle='right', marker='o'), color=color[1])
        else:
            ax.scatter(x[idx], y[idx], marker=marker, color=color, label=f'{legends[i]}')

    names = [str(codebook) for codebook in codebooks]
    # Setting the labels and limitations
    ax.set_xlim(extent[0], extent[1])
    ax.set_ylim(extent[2], extent[3])
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    if len(codebooks) == 1:
        ax.set_title('Visualization of Codebook ' + groups[0] + ' (' + type.capitalize() + ')')
    else:
        ax.set_title('Combined Visualization of Codebook ' + ', '.join(names) + ' (' + type.capitalize() + ')')
    ax.legend()

    # Adding a color bar
    cbar = fig.colorbar(heatmap)
    cbar.set_label('Density')

    # Save the plot
    path = OutputPath + '/coverage-' + '-'.join(names)
    if type != 'heatmap': path += '-' + type
    plt.savefig(path + '.png', dpi=160, bbox_inches='tight')
    print('Coverage plot saved to', path)

    # Show the plot
    if Visualize:
        wm = plt.get_current_fig_manager()
        wm.window.state('zoomed')
        plt.show()

# Plot the combination heatmap
plot_comparison(group_ids[1:], reference_distribution, 'heatmap')

# Plot the overlapping heatmap
if Owners > 2:
    plot_comparison(group_ids[1:], reference_distribution, 'overlap')

# Here, conformity is defined as the ratio of the spread to the overlapping area (where n >= max(2, floor(codebooks / 2)))
meaningful_threshold = max(2, math.floor(len(group_ids[1:]) / 2))
meaningful_overlapping = np.where(overlapping >= meaningful_threshold, 1, 0)
meaningful_area = meaningful_overlapping.sum()
print('Meaningful overlapping area:', meaningful_area, "based on >=", meaningful_threshold, "codebooks")

# Outliers (measurement of "novelty") are defined as the covered area outside the overlapping one
outlier = np.where(overlapping < meaningful_threshold, 1, 0)
outlier = np.where(overlapping > 0, outlier, 0)
outlier_area = outlier.sum()
print('Outlier area:', outlier_area, "based on <", meaningful_threshold, "codebooks")

# Meanwhile, contributing area is defined as "without you, how much overlapping area will be lost?"
contributing = np.where(overlapping == meaningful_threshold, 1, 0)
contributing_area = contributing.sum()
print('Contributing area:', meaningful_area, "based on >=", meaningful_threshold, "codebooks")

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
    print('Codebook:', codebook, ', spread:', spread, ', density:', density, ', variation:', variation, ', conformity:', conformity, ', contribution:', contribution, ', novelty:', novelty)
    evaluation[codebook] = ({ "Spread": spread / reference_spread, "Density": density / reference_density, "Variation": variation, "Conformity": conformity / meaningful_area, "Contribution": contribution / contributing_area, "Novelty": novelty / outlier_area})
    # Plot the heatmap
    plot_comparison([codebook], distribution)

# Send the evaluations
import json
print(json.dumps(evaluation))