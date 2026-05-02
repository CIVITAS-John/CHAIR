#!/usr/bin/env bash

# Color codes for output
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DEV_MODE=false
FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev)
            DEV_MODE=true
            shift
            ;;
        *)
            FILE="$1"
            shift
            ;;
    esac
done

if [[ -z "$FILE" ]]; then
    echo -e "${RED}Usage: ./scripts/run.sh [--dev] <path-to-ts-file>${NC}"
    echo
    echo "Examples:"
    echo "  ./scripts/run.sh examples/example-automatic.ts"
    echo "  ./scripts/run.sh --dev examples/example-automatic.ts"
    echo
    echo "Options:"
    echo "  --dev    Rebuild the project before running (for development)"
    exit 1
fi

if [[ ! -f "$FILE" ]]; then
    echo -e "${RED}Error: File not found: $FILE${NC}"
    exit 1
fi

if $DEV_MODE; then
    echo -e "${YELLOW}[dev] Rebuilding project...${NC}"
    if ! npm run build; then
        echo -e "${RED}Build failed. Please check the error messages above.${NC}"
        exit 1
    fi
    echo -e "${GREEN}[dev] Build complete.${NC}"
    echo
fi

echo "Running $FILE..."
npx tsx "$FILE"
