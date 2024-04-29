import sys
import numpy as np
from embedding import Dimensions, Items, cpus, labels, embeddings

# Density visualization

# Get the arguments
Metrics = sys.argv[3] if len(sys.argv) > 3 else "euclidean"
TargetDimensions = int(sys.argv[4]) if len(sys.argv) > 4 else 2

# Use UMap to reduce the dimensions
from umap import UMAP
if TargetDimensions < Dimensions:
    umap = UMAP(n_components = TargetDimensions)
    embeddings = umap.fit_transform(embeddings)
    from sklearn.preprocessing import normalize
    embeddings = normalize(embeddings, norm='l2')
    print("Embeddings reduced:", embeddings.shape)

# Use Plotly's 2D Density plot function
import plotly.figure_factory as ff

fig = ff.create_2d_density(
    x=embeddings[:, 0],  # X coordinates
    y=embeddings[:, 1],  # Y coordinates
    colorscale='Viridis',  # Color scale for the heatmap
    hist_color='rgba(0, 0, 255, 0.5)',  # Histogram color
    point_size=5  # Size of each point on the scatter plot
)

# Update the layout
fig.update_layout(
    title='Density Heatmap of Codes',
    xaxis_title='X',
    yaxis_title='Y',
    xaxis=dict(range=[0, 1]),  # Ensure x-axis ranges from 0 to 1
    yaxis=dict(range=[0, 1])   # Ensure y-axis ranges from 0 to 1
)

# Show the plot
fig.show()