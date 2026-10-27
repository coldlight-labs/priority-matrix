#!/usr/bin/env bash
# Blocks personal details from the repo (#74). The words to block are never committed:
# locally they live in .private-words (git-ignored, one word or phrase per line, "#" for
# comments); in CI they come from the PRIVATE_WORDS repository secret. Matches ignore
# case, match whole words only (so a short word never matches inside a longer one), and are
# listed by file and count only, so the words never reach a log.
set -euo pipefail

words="$(mktemp)"
trap 'rm -f "$words"' EXIT
if [[ -n "${PRIVATE_WORDS:-}" ]]; then
  printf '%s\n' "$PRIVATE_WORDS" > "$words"
elif [[ -f .private-words ]]; then
  cat .private-words > "$words"
else
  echo "private words: no .private-words file or PRIVATE_WORDS secret; check skipped."
  exit 0
fi
# Drop comments and blank lines; an empty pattern would match everything.
grep -v -E '^[[:space:]]*(#|$)' "$words" > "$words.clean" || true
mv "$words.clean" "$words"
if [[ ! -s "$words" ]]; then
  echo "private words: the list is empty; check skipped."
  exit 0
fi

if git grep -I -i -w -F -c -f "$words" -- .; then
  echo "Personal details found in the files above (file:count). Replace them before committing."
  exit 1
fi
echo "private words: none found."
