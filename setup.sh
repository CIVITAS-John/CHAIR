#!/usr/bin/env bash

echo "Setting up Python environment..."
if ! /usr/bin/env bash scripts/setup-python.sh; then
    echo "Python environment setup failed. Exiting..."
    exit 1
fi

echo "Setting up Node.js environment..."
if ! /usr/bin/env bash scripts/setup-node.sh; then
    echo "Node.js environment setup failed. Exiting..."
    exit 1
fi

echo "Setting up environment variables..."
if ! /usr/bin/env bash scripts/setup-env.sh; then
    echo "Environment variables setup failed. Exiting..."
    exit 1
fi
