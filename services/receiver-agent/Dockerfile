# syntax=docker/dockerfile:1
#
# P2000 receiver-agent runtime image. The Zig agent binary is CROSS-COMPILED on
# the host (see build.sh) as a static musl executable and copied in — no Zig in
# the container (avoids translate-c cache issues on Synology's classic builder
# and keeps builds fast). multimon-ng is built from source (not packaged in
# Alpine); rtl_fm comes from the rtl-sdr package.
#
# Build:  ./build.sh amd64   (or arm64)  — cross-compiles then docker build
# Run (self-test, no dongle):
#   docker run --rm -e P2000_CMD='printf "FLEX_NEXT|1600/2|00.001.A|0000000001|SS|5|ALN|3.0.K|A1 test\n"' p2000-receiver-agent
# Run (real, with dongle + logfile):
#   docker run -d --name p2000 --restart unless-stopped --device=/dev/bus/usb \
#     -e P2000_LOG=/logs/p2000.jsonl -v ~/p2000/logs:/logs p2000-receiver-agent

ARG ALPINE=alpine:3.21

# --- Build multimon-ng from source (not in Alpine repos) ---
FROM ${ALPINE} AS mm-build
RUN apk add --no-cache build-base cmake git
RUN git clone --depth 1 https://github.com/EliasOenal/multimon-ng /mm \
    && cmake -S /mm -B /mm/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /mm/build -j \
    && strip /mm/build/multimon-ng

# --- Runtime ---
FROM ${ALPINE} AS runtime
RUN apk add --no-cache rtl-sdr libusb curl
# Prebuilt static musl agent binary (must match the image arch; see build.sh).
COPY dist/receiver-agent /usr/local/bin/receiver-agent
COPY --from=mm-build /mm/build/multimon-ng /usr/local/bin/multimon-ng
ENTRYPOINT ["/usr/local/bin/receiver-agent"]
