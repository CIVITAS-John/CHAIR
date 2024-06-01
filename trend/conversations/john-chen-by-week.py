import sys
import json
from datetime import datetime
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

## GPT Prompt:
## What's the trend of Participant 3's participation in the conversations over time? 
## Then, compare the trend with the overall activity trend of the group.

# Get the file path from the command line argument
if len(sys.argv) < 3:
    ## Load the dataset path
    sys.path.append('../../')
    from dotenv import load_dotenv
    dataset_path = load_dotenv("DATASET_PATH")
    file_path1 = dataset_path + r'\Messaging Groups\Users of Physics Lab (Group 1)\Conversations.json'
    file_path2 = dataset_path + r'\Messaging Groups\Users of Physics Lab (Group 2)\Conversations.json'
else:
    file_path1 = sys.argv[1]
    file_path2 = sys.argv[2]

print("Loading:", file_path1)
print("Loading:", file_path2)

## Load the conversations from the JSON file
try:
    # Open the JSON file
    with open(file_path1, 'r', encoding='utf-8') as json_file:
        data = json.load(json_file)
    
    # Open the JSON file
    with open(file_path2, 'r', encoding='utf-8') as json_file:
        data.extend(json.load(json_file))

    # Convert the date strings to datetime objects
    for conversation in data:
        conversation['Start'] = datetime.fromisoformat(conversation['Start'].replace('Z', '+00:00'))

except FileNotFoundError:
    print(f"Error: File '{file_path1}' not found.")
except Exception as e:
    print(f"Error: {e}")

# Create a DataFrame from the data
df = pd.DataFrame(data)
# Filter data for the years 2017-2019
df = df[(df['Start'].dt.year >= 2017) & (df['Start'].dt.year <= 2019)]

# Group data by week
df['Week'] = df['Start'].dt.to_period('W')
df['Conversations'] = df['ID']
df['JC Conversations'] = df['Participants'].apply(lambda x: x.get('3', 0) > 0)
df['JC Messages'] = df['Participants'].apply(lambda x: x.get('3', 0))
df['Participants'] = df['Participants'].apply(lambda x: set(x.keys()))
weekly_data = df.groupby('Week').agg({
    'Messages': 'sum', 'Conversations': 'size', 'FirstSeen': 'sum',
    'JC Messages': 'sum', 'JC Conversations': 'sum', 
    'Participants': lambda x: len(set.union(*x))}).reset_index()
weekly_data['Year'] = weekly_data['Week'].dt.year
weekly_data['Month'] = weekly_data['Week'].dt.month

# Export the data to a CSV file
output_file = file_path1.replace('Conversations.json', '../Weekly-Data.csv')
weekly_data.to_csv(output_file, index=False)

# Plot 1: Absolute number at a log scale
fig, ax1 = plt.subplots(figsize=(14, 7))
plt.xticks(rotation=45)

# Messages plot
color = 'tab:blue'
ax1.set_xlabel('Week')
ax1.set_ylabel('Messages', color=color)
ax1.bar(weekly_data['Week'].astype(str), weekly_data['FirstSeen'], label='Newcomers', color='cyan', alpha=0.8)
ax1.bar(weekly_data['Week'].astype(str), weekly_data['Messages'] - weekly_data['JC Messages'], label='Total Messages (-JC)', color=color, alpha=0.8, bottom=weekly_data['FirstSeen'])
ax1.tick_params(axis='y', labelcolor=color)
ax1.legend(loc='upper left')
ax1.set_yscale('log')
ax1.yaxis.set_major_locator(ticker.LogLocator(numticks=6))  # Adjust the number of ticks
ax1.set_ylim(0, 100000)
ax1.grid(True)

# Participation rate plot
ax2 = ax1.twinx()
color = 'tab:orange'
ax2.set_ylabel('% of John Participation', color=color)
ax2.plot(weekly_data['Week'].astype(str), weekly_data['JC Messages'] / weekly_data['Messages'] * 100, label='Message %', marker='o', color=color)
ax2.plot(weekly_data['Week'].astype(str), weekly_data['JC Conversations'] / weekly_data['Conversations'] * 100, label='Conversations %', marker='x', color=color)
ax2.tick_params(axis='y', labelcolor=color)
ax2.legend(loc='upper right')
ax2.yaxis.set_major_locator(ticker.LinearLocator(numticks=5))  # Adjust the number of ticks
ax2.set_ylim(0, 100)
ax2.grid(True)

plt.title('Participation and Messaging Trends (2017-2019)')
plt.legend()
plt.show()

# Plot 2: Relative number (Messages / Participants)
fig, ax1 = plt.subplots(figsize=(14, 7))
plt.xticks(rotation=45)

# Messages plot
color = 'tab:blue'
ax1.set_xlabel('Week')
ax1.set_ylabel('Messages', color=color)
ax1.bar(weekly_data['Week'].astype(str), (weekly_data['Messages'] - weekly_data['JC Messages']) / (weekly_data['Participants'] - 1), label='Messages / Participants (-JC)', color=color, alpha=0.8)
ax1.tick_params(axis='y', labelcolor=color)
ax1.legend(loc='upper left')
ax2.yaxis.set_major_locator(ticker.LinearLocator(numticks=11))  # Adjust the number of ticks
ax1.set_ylim(0, 100)
ax1.grid(True)

# Participation rate plot
ax2 = ax1.twinx()
color = 'tab:orange'
ax2.set_ylabel('% of John Participation', color=color)
ax2.plot(weekly_data['Week'].astype(str), weekly_data['JC Messages'] / weekly_data['Messages'] * 100, label='Message %', marker='o', color=color)
ax2.plot(weekly_data['Week'].astype(str), weekly_data['JC Conversations'] / weekly_data['Conversations'] * 100, label='Conversations %', marker='x', color=color)
ax2.tick_params(axis='y', labelcolor=color)
ax2.legend(loc='upper right')
ax2.yaxis.set_major_locator(ticker.LinearLocator(numticks=11))  # Adjust the number of ticks
ax2.set_ylim(0, 100)
ax2.grid(True)

plt.title('Participation and Messaging Trends (2017-2019)')
plt.legend()
plt.show()
