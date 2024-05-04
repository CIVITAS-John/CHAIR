import sys
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
print('Owners:', Owners, ', Visualize:', Visualize)

# Seperate owners' names from labels (the first few items)
groups = labels[:Owners]
group_ids = [i for i in range(Owners)]
labels = labels[Owners:]

# Separate the owners from labels (format: owner1,owner2,owner3|label)
if labels[0].count('|') > 0:
    owners = [label.split('|')[0].split(',') for label in labels]
    owners = [[int(owner) for owner in owner_list] for owner_list in owners]
    labels = [label.split('|')[1] for label in labels]
else:
    owners = [[0]] * len(labels)

# Use UMap to reduce the dimensions
from umap import UMAP
umap = UMAP(densmap=True, n_components=2)
embeddings = umap.fit_transform(embeddings)
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

# Plotting function
plot_size_per_unit = math.ceil(math.sqrt(len(embeddings)) / 5)
def plot_comparison(codebooks, distribution):
    # Plotting the heatmap
    fig, ax = plt.subplots(figsize=((extent[1] - extent[0] + 1.5) * plot_size_per_unit, (extent[3] - extent[2]) * plot_size_per_unit))
    dis = np.where(distribution < min_density, 0, distribution) # max_density
    heatmap = ax.imshow(dis, origin='lower', vmax=max_density, vmin=0, extent=extent, aspect='auto', cmap='viridis')

    # Note that we only support 1 baseline + 2 codebooks; or 1 baseline + 1 codebook
    if len(codebooks) == 1:
        combinations = [[0], [codebooks[0]]]
        markers = ['o', 's']
        colors = ['tab:gray', 'tab:red']
        legends = [groups[0], groups[codebooks[0]]]
    else:
        combinations = [[0], [0, codebooks[0]], [0, codebooks[1]], [0, codebooks[0], codebooks[1]]]
        markers = ['o', 'o', 'o', 'lr']
        colors = ['tab:gray', 'tab:red', 'tab:blue', ['tab:red', 'tab:blue']]
        legends = [groups[0] + ' only', groups[codebooks[0]], groups[codebooks[1]], 'both']

    # Plot the texts
    offset = mtransforms.ScaledTranslation(5/72, -3/72, plt.gcf().dpi_scale_trans)
    text_transform = ax.transData + offset
    for i, point in enumerate(embeddings):
        if len(codebooks) == 1:
            is_baseline = codebooks[0] not in owners[i]
        else:
            is_baseline = owners[i] == [0]
        alpha = 0.5 if is_baseline else 1
        txt = ax.text(point[0], point[1], labels[i], color='k', fontsize=8, transform=text_transform, alpha=alpha)
        txt.set_path_effects([PathEffects.withStroke(linewidth=1, foreground='w', alpha=0.5 * alpha)])

    # Plot each group with its own color and label
    for i, owner in enumerate(combinations):
        if len(codebooks) == 1:
            if owner[0] == 0:
                idx = [j for j in range(len(labels)) if codebooks[0] not in owners[j]]
            else:
                idx = [j for j in range(len(labels)) if codebooks[0] in owners[j]]
        else:
            idx = [j for j in range(len(labels)) if owners[j] == owner]
        marker = markers[i]
        color = colors[i]
        if marker == 'lr':
            ax.scatter(x[idx], y[idx], marker=MarkerStyle(fillstyle='left', marker='o'), color=color[0])
            ax.scatter(x[idx], y[idx], marker=MarkerStyle(fillstyle='right', marker='o'), color=color[1])
        else:
            ax.scatter(x[idx], y[idx], marker=marker, color=color, label=f'{legends[i]}')

    codebooks = [str(codebook) for codebook in codebooks]
    # Setting the labels and limitations
    ax.set_xlim(extent[0], extent[1])
    ax.set_ylim(extent[2], extent[3])
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_title('Comparison of Codebook ' + ', '.join(codebooks))
    ax.legend()

    # Adding a color bar
    cbar = fig.colorbar(heatmap)
    cbar.set_label('Density')

    # Save the plot
    path = './known/coverage-' + '-'.join(codebooks) + '.png'
    plt.savefig(path, dpi=160, bbox_inches='tight')
    print('Coverage plot saved to', path)

    # Show the plot
    wm = plt.get_current_fig_manager()
    wm.window.state('zoomed')
    if Visualize:
        plt.show()

# Plot the combination heatmap
if Owners == 3:
    plot_comparison([1, 2], reference_distribution)

# Plot the individual heatmaps and evaluate spread and density
for codebook in group_ids[1:]:
    distribution = get_distribution(codebook)
    spread = get_spread(distribution)
    density, variation = get_density(distribution, spread)
    print('Codebook:', codebook, ', spread:', spread, ', density:', density, ', variation:', variation)
    evaluation[codebook] = ({ "Spread": spread / reference_spread, "Density": density / reference_density, "Variation": variation })
    plot_comparison([codebook], distribution)

# Send the results
import json
print(json.dumps(evaluation))