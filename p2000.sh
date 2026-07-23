#!/usr/bin/env bash
#
# P2000 receiver — Dutch emergency services pager network (FLEX, 169.65 MHz)
#
# Usage:
#   ./p2000.sh              # live to terminal, with timestamps
#   ./p2000.sh -l out.log   # also append raw decodes to a logfile
#   ./p2000.sh -g 30        # override tuner gain (dB)
#   ./p2000.sh -p 5         # set frequency correction (ppm)
#
# The RTL-SDR can only be used by ONE process at a time. This script frees
# the dongle from any previous run before starting, and shows rtl_fm errors
# (e.g. "device busy") instead of silently exiting.
#
set -uo pipefail

FREQ="169.65M"
GAIN="42"
PPM="0"
LOGFILE=""

while getopts "g:p:l:h" opt; do
  case "$opt" in
    g) GAIN="$OPTARG" ;;
    p) PPM="$OPTARG" ;;
    l) LOGFILE="$OPTARG" ;;
    h) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option. Use -h for help." >&2; exit 1 ;;
  esac
done

RTL_FM="$(command -v rtl_fm || true)"
MULTIMON="$(command -v multimon-ng || true)"
if [[ -z "$RTL_FM" || -z "$MULTIMON" ]]; then
  echo "Missing rtl_fm and/or multimon-ng in PATH." >&2
  exit 1
fi

# Free the dongle from a previous run (leftover process holding the USB device
# is the #1 cause of an instant "device busy" exit).
if pgrep -f "rtl_fm" >/dev/null 2>&1; then
  echo "Freeing RTL-SDR from a previous rtl_fm process..." >&2
  pkill -f "rtl_fm" 2>/dev/null || true
  sleep 1
fi

echo "P2000 @ $FREQ  gain=${GAIN}dB  ppm=$PPM  — Ctrl-C to stop" >&2
[[ -n "$LOGFILE" ]] && echo "Logging to: $LOGFILE" >&2

# Kill the whole pipeline (rtl_fm keeps running otherwise) when we exit.
cleanup() { pkill -P $$ 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Prefix each decoded line with a local timestamp.
stamp() {
  while IFS= read -r line; do
    printf '%s | %s\n' "$(date '+%H:%M:%S')" "$line"
  done
}

# rtl_fm errors go to the terminal (NOT /dev/null) so failures are visible.
# multimon status chatter is dropped; only FLEX lines pass through.
run() {
  "$RTL_FM" -f "$FREQ" -M fm -s 22050 -g "$GAIN" -p "$PPM" - \
    | "$MULTIMON" -a FLEX_NEXT -t raw - 2>/dev/null \
    | grep --line-buffered '^FLEX' \
    | stamp
}

if [[ -n "$LOGFILE" ]]; then
  run | tee -a "$LOGFILE"
else
  run
fi
