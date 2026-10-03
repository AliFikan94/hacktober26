#!/usr/bin/env bash
# One-click start for macOS/Linux.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js from https://nodejs.org first."; exit 1; }
[ -d node_modules ] || { echo "Installing TeachBack for the first time..."; npm install; }
(sleep 2; (open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1) &
npm start
