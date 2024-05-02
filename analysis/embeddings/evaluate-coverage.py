import sys
import numpy as np
import matplotlib.pyplot as plt
from embedding import Dimensions, Items, cpus, labels, embeddings

# Evaluate coverage of codebooks through KDE
# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "euclidean"

# Separate the owners ID from labels (format: owner_id/label)
if labels[0].count('/') > 0:
    owners = [int(label.split('/')[0]) for label in labels]
    labels = [label.split('/')[1] for label in labels]
else:
    owners = [0] * len(labels)

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

# Plotting the heatmap
fig, ax = plt.subplots()
heatmap = ax.imshow(Z, origin='lower', extent=[-1, 1, -1, 1], aspect='auto', cmap='viridis')

# Plot each group with its own color and label
colors = plt.cm.jet(np.linspace(0, 1, len(np.unique(owners))))
for owner_id, color in zip(np.unique(owners), colors):
    idx = owners == owner_id
    ax.scatter(x[idx], y[idx], color=color, label=f'Codebook {owner_id}')

# Plot the texts
for i, point in enumerate(embeddings):
    ax.text(point[0], point[1], labels[i], color='black', fontsize=8)

# Setting the labels and limitations
ax.set_xlim(-1, 1)
ax.set_ylim(-1, 1)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_title('Density Heatmap on Codes')
ax.legend()

# Adding a color bar
cbar = fig.colorbar(heatmap)
cbar.set_label('Density')

wm = plt.get_current_fig_manager()
wm.window.state('zoomed')
plt.show()