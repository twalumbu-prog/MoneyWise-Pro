#!/bin/bash


# Supabase Access Token provided by user
export SUPABASE_ACCESS_TOKEN="sbp_12cfd0b0f1db6bd6313a253fbcd65abad001dbf2"

# Ensure global binaries are in PATH
export PATH="$HOME/.local/bin:$PATH"

# Execute Supabase MCP via global CLI
exec supabase mcp "$@"
