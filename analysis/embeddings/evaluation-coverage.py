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
Visualize = bool(sys.argv[4]) if len(sys.argv) > 4 else False
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
extent = [math.floor(np.min(x)), math.ceil(np.max(x)), math.floor(np.min(y)), math.ceil(np.max(y))]
xlist = np.linspace(extent[0], extent[1], (extent[1] - extent[0]) * resolution) # 0.04 per step
ylist = np.linspace(extent[2], extent[3], (extent[3] - extent[2]) * resolution)
xgrid, ygrid = np.meshgrid(xlist, ylist)

# Calculating KDE
bandwidth = math.sqrt((extent[1] - extent[0]) * (extent[3] - extent[2])) / max(100, len(x)) * 5
print('Bandwidth:', bandwidth)
def get_distribution(owner):
    from scipy.stats import gaussian_kde
    idx = [j for j in range(len(labels)) if owner in owners[j]]
    x1, y1 = x[idx], y[idx]
    kde = gaussian_kde(np.vstack([x1, y1]), bw_method=bandwidth)
    result = kde(np.vstack([xgrid.ravel(), ygrid.ravel()])).reshape(xgrid.shape)
    # Normalize the result to level the playground between codebooks
    # Note that the entirety of area size under the KDE curve = 1
    # Which means the value for each resolution*resolution cell, density * len(embeddings) = expected frequency for resolution*resolution
    return result * len(x1)

# Compute the KDE
reference_distribution = get_distribution(0)
total_area = reference_distribution.size

# Calculate the minimum expected density
# Here, the problem is: we don't know how much is really needed for a cell to be considered as "covered"
# Thankfully, we are only making a relative metrics
# Let min_density_per_1% = 1% of len(embeddings) - i.e. the same density when embeddings all spread evenly
# min_density_per_cell / (0.04 * 0.04) = min_density_per_1%
min_density = 0.01 * len(embeddings) / (resolution * resolution)
max_density = np.percentile(reference_distribution[reference_distribution > min_density], 90)
print('Density clamp range:', min_density, max_density)

# Calculating spread and density
def get_spread(distribution):
    return np.where(distribution > min_density, 1, 0).sum() / total_area

# Calculating density
evaluation = []
def get_density(distribution, spread):
    distribution = distribution[distribution > min_density]
    sum = distribution.clip(0, max_density).sum()
    variance = distribution.var()
    print(distribution)
    return [sum / total_area / spread, variance]

reference_spread = get_spread(reference_distribution)
reference_density, reference_variance = get_density(reference_distribution, reference_spread)
evaluation.append((0, reference_spread, reference_density, reference_variance))
print('Reference spread:', reference_spread, ", density", reference_density, ", variance", reference_variance)

# Plotting function
def plot_comparison(codebooks, distribution):
    # Plotting the heatmap
    fig, ax = plt.subplots(figsize=((extent[1] - extent[0]) * 4 + 6, (extent[3] - extent[2]) * 4))
    dis = np.where(distribution < min_density, 0, distribution)
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
    density, variance = get_density(distribution, spread)
    evaluation.append((codebook, spread, density, variance))
    plot_comparison([codebook], distribution)

# Send the results
import json
print(json.dumps(evaluation))