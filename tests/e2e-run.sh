#!/bin/sh
# Entrypoint for the e2e Docker service. Runs the Playwright suite against
# the dev server. Lives in tests/ so it gets volume-mounted into the
# container at /e2e/tests/.
set -e

echo "Installing test deps…"
PLAYWRIGHT_VERSION=$(node -p "require('./tests/package.json').dependencies['@playwright/test'].replace(/^\^/, '')")
SUPABASE_VERSION=$(node -p "require('./tests/package.json').dependencies['@supabase/supabase-js'].replace(/^\^/, '')")
npm install --no-audit --no-fund --silent \
  "@playwright/test@${PLAYWRIGHT_VERSION}" \
  "@supabase/supabase-js@${SUPABASE_VERSION}"

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

echo "Running Playwright…"
npx --no-install playwright test "$@"
