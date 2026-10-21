#!/bin/bash

INPUT_FILE="Bitcoin_addresses_LATEST.txt.gz"
TEMP_FILE="Bitcoin_addresses_LATEST.txt"
OUTPUT_DIR="12_26_2025/"
OUTPUT_SUBSTR="database_"
FILE_SIZE="30MB"

# 1. Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

# 2. Decompress
echo "Decompressing $INPUT_FILE..."
if gunzip -c "$INPUT_FILE" > "$TEMP_FILE"; then
    echo "Decompression successful."
else
    echo "Error: Failed to decompress file."
    exit 1
fi

# 3. Prepare output directory
if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
fi

echo "Cleaning old database files..."
rm -f "$OUTPUT_DIR/$OUTPUT_SUBSTR"*

# 4. Split file
echo "Splitting database..."
if split --bytes=$FILE_SIZE "$TEMP_FILE" "$OUTPUT_DIR/$OUTPUT_SUBSTR"; then
    echo "Split successful."
else
    echo "Error: Failed to split file."
    rm "$TEMP_FILE"
    exit 1
fi

# Cleanup large temp file
rm "$TEMP_FILE"
rm "$INPUT_FILE"

echo "Success! Database ready."