#!/bin/sh
# Entrypoint for the e2e Docker service. Runs the Playwright suite against
# the dev server. Lives in tests/ so it gets volume-mounted into the
# container at /e2e/tests/.
set -e

echo "Waiting for web at ${E2E_BASE_URL}…"
ATTEMPTS=60
i=0
while [ $i -lt $ATTEMPTS ]; do
  if wget -q -O- "$E2E_BASE_URL" > /dev/null 2>&1; then
    echo "web is up"
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ $i -eq $ATTEMPTS ]; then
  echo "web never came up at $E2E_BASE_URL" >&2
  exit 1
fi

echo "Seeding test dataset…"
node tests/seed.mjs > tests/.seed.json
cat tests/.seed.json
echo

# playwright is provided by the e2e_node_modules volume (kept in sync
# with the project by `npm install --no-save @playwright/test`).
# We use the binary in node_modules/.bin so we don't depend on npx's
# download cache.
echo "Running Playwright…"
./node_modules/.bin/playwright test "$@"
