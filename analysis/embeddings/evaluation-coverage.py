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
umap = UMAP(n_components = 2)
embeddings = umap.fit_transform(embeddings)
print("Embeddings reduced:", embeddings.shape)

# Standardize the embeddings
from sklearn.preprocessing import StandardScaler, MinMaxScaler
scaler = StandardScaler()
embeddings = scaler.fit_transform(embeddings)
scaler = MinMaxScaler(feature_range=(-1, 1))
embeddings = scaler.fit_transform(embeddings)

# Compute the density
from scipy.stats import gaussian_kde
x, y = embeddings[:, 0], embeddings[:, 1]
kde = gaussian_kde([x, y])
xgrid = np.linspace(-1, 1, 100)
ygrid = np.linspace(-1, 1, 100)
Xgrid, Ygrid = np.meshgrid(xgrid, ygrid)
Z = kde(np.vstack([Xgrid.ravel(), Ygrid.ravel()])).reshape(Xgrid.shape)

# Plot the heatmap
if Visualize:
    # Plotting the heatmap
    fig, ax = plt.subplots(figsize=(20, 20))
    heatmap = ax.imshow(Z, origin='lower', extent=[-1, 1, -1, 1], aspect='auto', cmap='viridis')

    # Note that we only support 1 baseline + 2 codebooks; or 1 baseline + 1 codebook
    if Owners == 2:
        combinations = [[0], [0, 1]]
        markers = ['o', 's']
        colors = ['tab:gray', 'tab:red']
        legends = [groups[0], groups[1]]
    else:
        combinations = [[0], [0, 1], [0, 2], [0, 1, 2]]
        markers = ['o', 'o', 'o', 'lr']
        colors = ['tab:gray', 'tab:red', 'tab:blue', ['tab:red', 'tab:blue']]
        legends = [groups[0] + ' only', groups[1], groups[2], 'both']

    # Plot the texts
    offset = mtransforms.ScaledTranslation(5/72, -3/72, plt.gcf().dpi_scale_trans)
    text_transform = ax.transData + offset
    for i, point in enumerate(embeddings):
        txt = ax.text(point[0], point[1], labels[i], color='k', fontsize=8, transform=text_transform)
        txt.set_path_effects([PathEffects.withStroke(linewidth=1, foreground='w', alpha=0.5)])

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
    ax.set_title('Comparison of Codes')
    ax.legend()

    # Adding a color bar
    cbar = fig.colorbar(heatmap)
    cbar.set_label('Density')

    wm = plt.get_current_fig_manager()
    wm.window.state('zoomed')
    plt.savefig('./known/coverage.png', dpi=160, bbox_inches='tight')
    plt.show()
