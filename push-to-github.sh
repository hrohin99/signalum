#!/bin/bash
git add -A
git commit -m "deploy $(date '+%Y-%m-%d %H:%M')"
git push
