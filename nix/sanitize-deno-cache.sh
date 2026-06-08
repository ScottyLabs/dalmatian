#!/usr/bin/env bash
set -euo pipefail

# Deno's DENO_DIR cache is not reproducible as-is: node_analysis_cache_v2 is
# ephemeral, and registry.json key ordering varies between runs.
rm -rf "$1/node_analysis_cache_v2"

find "$1" -name registry.json -print0 | while IFS= read -r -d '' registry; do
  jq -S -c . "$registry" > "$registry.tmp"
  mv "$registry.tmp" "$registry"
done
