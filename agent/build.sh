#!/usr/bin/env sh
# Cross-compile the Zig agent (static musl) for the target arch into dist/, so
# the Dockerfile can just COPY it. Usage: ./build.sh [amd64|arm64]
set -eu

ARCH="${1:-amd64}"
case "$ARCH" in
  amd64) ZTARGET=x86_64-linux-musl ;;
  arm64) ZTARGET=aarch64-linux-musl ;;
  *) echo "usage: $0 [amd64|arm64]" >&2; exit 1 ;;
esac

cd "$(dirname "$0")"
mkdir -p dist
echo "cross-compiling agent for $ARCH ($ZTARGET)..."
zig build-exe src/main.zig -target "$ZTARGET" -lc -O ReleaseSafe -fstrip \
  --name receiver-agent -femit-bin=dist/receiver-agent
echo "built dist/receiver-agent:"
file dist/receiver-agent
