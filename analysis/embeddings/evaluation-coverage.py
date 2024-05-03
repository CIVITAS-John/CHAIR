import sys
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as PathEffects
import matplotlib.transforms as mtransforms
from matplotlib.markers import MarkerStyle
from embedding import Dimensions, Items, cpus, labels, embeddings

# Evaluate coverage of codebooks through KDE
# Get the arguments
Owners = int(sys.argv[3]) if len(sys.argv) > 3 else 2
Visualize = bool(sys.argv[4]) if len(sys.argv) > 4 else True

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
umap = UMAP(densmap=True, n_components = 2)
embeddings = umap.fit_transform(embeddings)
print("Embeddings reduced:", embeddings.shape)

# Standardize the embeddings
from sklearn.preprocessing import StandardScaler, MinMaxScaler
scaler = StandardScaler()
embeddings = scaler.fit_transform(embeddings)
scaler = MinMaxScaler(feature_range=(-1, 1))
embeddings = scaler.fit_transform(embeddings)
x, y = embeddings[:, 0], embeddings[:, 1]

# Calculating density
def get_density(owner):
    from scipy.stats import gaussian_kde
    idx = [j for j in range(len(labels)) if owner in owners[j]]
    kde = gaussian_kde([x[idx], y[idx]])
    xgrid = np.linspace(-1, 1, 100)
    ygrid = np.linspace(-1, 1, 100)
    Xgrid, Ygrid = np.meshgrid(xgrid, ygrid)
    return kde(np.vstack([Xgrid.ravel(), Ygrid.ravel()])).reshape(Xgrid.shape)

# Plotting function
def plot_comparison(codebooks, density):
    # Plotting the heatmap
    fig, ax = plt.subplots(figsize=(25, 25))
    heatmap = ax.imshow(density, origin='lower', extent=[-1, 1, -1, 1], aspect='auto', cmap='viridis')

    # Note that we only support 1 baseline + 2 codebooks; or 1 baseline + 1 codebook
    if len(codebooks) == 1:
        combinations = [[0], codebooks]
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
        is_baseline = owners[i] == [0]
        alpha = 0.5 if is_baseline else 1
        txt = ax.text(point[0], point[1], labels[i], color='k', fontsize=8, transform=text_transform, alpha=alpha)
        txt.set_path_effects([PathEffects.withStroke(linewidth=1, foreground='w', alpha=0.5 * alpha)])

    # Plot each group with its own color and label
    for i, owner in enumerate(combinations):
        idx = [j for j in range(len(labels)) if owners[j] == owner]
        marker = markers[i]
        color = colors[i]
        if marker == 'lr':
            ax.scatter(x[idx], y[idx], marker=MarkerStyle(fillstyle='left', marker='o'), color=color[0])
            ax.scatter(x[idx], y[idx], marker=MarkerStyle(fillstyle='right', marker='o'), color=color[1])
        else:
            ax.scatter(x[idx], y[idx], marker=marker, color=color, label=f'{legends[i]}')

    # Setting the labels and limitations
    ax.set_xlim(-1, 1)
    ax.set_ylim(-1, 1)
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_title('Comparison of Codebooks ' + ', '.join(codebooks))
    ax.legend()

    # Adding a color bar
    cbar = fig.colorbar(heatmap)
    cbar.set_label('Density')

    # Save the plot
    codebooks = [str(codebook) for codebook in codebooks]
    path = './known/coverage-' + '-'.join(codebooks) + '.png'
    plt.savefig(path, dpi=160, bbox_inches='tight')
    print('Coverage plot saved to', path)

    # Show the plot
    wm = plt.get_current_fig_manager()
    wm.window.state('zoomed')
    if Visualize:
        plt.show()

# Compute the density
reference_density = get_density(0)

# Plot the combination heatmap
if Owners == 3:
    plot_comparison([1, 2], reference_density)

# Plot the individual heatmaps
for codebook in Owners[1:]:
    density = get_density(codebook)
    plot_comparison([codebook], density)