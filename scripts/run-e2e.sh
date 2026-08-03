#!/usr/bin/env bash
set -euo pipefail

log_file="${TMPDIR:-/tmp}/split-patel-expo-e2e.log"
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true CI=1 npx expo start --web --port 19006 >"$log_file" 2>&1 &
expo_pid=$!
cleanup() {
  kill "$expo_pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:19006 >/dev/null; then
    npx playwright test
    exit $?
  fi
  sleep 1
done

echo "Expo did not start. Log follows:" >&2
tail -n 100 "$log_file" >&2
exit 1
