#!/usr/bin/env bash
# Pull the latest code, rebuild and restart the game server. Run on the VM.
set -euo pipefail
sudo git -C /opt/ibt pull --ff-only
sudo chown -R ibt:ibt /opt/ibt
sudo -u ibt -H bash -c "cd /opt/ibt/server && npm ci --no-audit --no-fund && npm run build"
sudo systemctl restart ibt-server
sleep 2 && systemctl --no-pager status ibt-server | head -5
