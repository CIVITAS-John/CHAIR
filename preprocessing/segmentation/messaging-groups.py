import sys
import csv
import numpy as np
np.set_printoptions(threshold=sys.maxsize)
from dotenv import load_dotenv

## Load the timestamps from the CSV file
# Get the file path from the command line argument
if len(sys.argv) < 2:
    ## Load the dataset path
    sys.path.append('../')
    file_path = load_dotenv("DATASET_PATH") + r'\Messaging Groups\Users of Physics Lab (Group 1)\Messages.csv'
else:
    file_path = sys.argv[1]
print("Loading:", file_path)

## Load the timestamps
try:
    # Initialize an empty list to store timestamps
    timestamps = []
    ids = []

    # Open the CSV file
    with open(file_path, 'r', encoding='utf-8') as csv_file:
        # Create a CSV reader object
        csv_reader = csv.reader(csv_file)

        # Iterate over the rows in the CSV file
        for row in csv_reader:
            # Skip the header row
            if csv_reader.line_num == 1:
                continue
            ids.append(int(row[0]))
            # Convert to number and add to the list
            timestamps.append(int(int(row[3]) / 1000))
    
    # Convert lists to numpy arrays
    timestamps = np.array(timestamps)
    ids = np.array(ids)

except FileNotFoundError:
    print(f"Error: File '{file_path}' not found.")
except Exception as e:
    print(f"Error: {e}")

## First, we separate the timestamps into groups with the min distance of 1 days
# Calculate the time difference between each timestamp
time_diff = np.diff(timestamps)

## Then, within each group, we further segment the timestamps into subgroups
from scipy.signal import find_peaks

# Find the peaks
# We consider everything under 5 minutes as NOT a peak
peaks, _ = find_peaks(time_diff, height=300, prominence=300)

# Preview the peaks
print("Local peaks found:", len(peaks))

# Write back the groups to a CSV file
# Write it in the same directory as the input file
import pandas as pd 
output_file = file_path.replace('.csv', '.Groups.csv')
pd.DataFrame(ids[peaks]).to_csv(output_file, index=False, header=False)