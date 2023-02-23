#! /bin/bash
set -ex

npm install --include=dev
pkg -t node18-linux-x64,node18-macos-x64,node18-win-x64 -o find-duplicate-audio-files main.js
