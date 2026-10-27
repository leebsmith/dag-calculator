#!/usr/bin/env bash
# Concatenate the report-renderer seed set into one Markdown document for a
# notebook/LLM context. Documents come through as-is, code sources are fenced.
#
#   scripts/seed-report-notebook.sh [--glossary] [--bundle PATH] [OUT]
#   OUT=/tmp/seed.md scripts/seed-report-notebook.sh
#
# --glossary    append the generated path index (labels, units, decimals)
# --bundle P    append `scripts/describe-report-bundle.mjs` output for a bundle
#               (also honoured as the BUNDLE environment variable)
#
# Default output is .local/report-notebook-seed.md (gitignored).
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

with_glossary=0
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --glossary) with_glossary=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    --bundle)
      [ "$#" -ge 2 ] || { echo "--bundle needs a path" >&2; exit 1; }
      BUNDLE=$2
      shift
      ;;
    --bundle=*) BUNDLE=${1#--bundle=} ;;
    *) out="$1" ;;
  esac
  shift
done
out=${out:-${OUT:-.local/report-notebook-seed.md}}

# Prose and reference first, then the data, then the code that consumes it.
documents=(
  plans/report-renderer.md
  docs/report-renderer.md
  docs/adding-a-section.md
  docs/report-bundle.md
  docs/typst-notes.md
)
[ "$with_glossary" -eq 1 ] && documents+=(docs/report-bundle-glossary.md)

code=(
  backend/app/templates/report.typ
  backend/app/templates/lib/format.typ
  backend/app/templates/lib/bundle.typ
  tests/backend/test_report_format_parity.py
)

missing=0
for f in "${documents[@]}" "${code[@]}"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; missing=1; }
done
if [ -n "${BUNDLE:-}" ] && [ ! -f "$BUNDLE" ]; then
  echo "missing bundle: $BUNDLE" >&2
  missing=1
fi
[ "$missing" -eq 0 ] || { echo "refusing to write a partial seed document" >&2; exit 1; }

mkdir -p "$(dirname "$out")"
: > "$out"

printf '# Report renderer — seed set\n\n' >> "$out"

emitted=0
emit_file() { # $1 = source path, $2 = display label
  if [ "$emitted" -gt 0 ]; then
    # Blank lines matter: a "---" touching text becomes a setext heading.
    printf '\n---\n\n' >> "$out"
  fi
  emitted=$((emitted + 1))

  printf '**Source:** `%s` (%s bytes)\n\n' "$2" "$(wc -c < "$1" | tr -d ' ')" >> "$out"

  case "$1" in
    *.typ|*.py)
      if grep -q '^```' "$1"; then
        echo "error: $1 already contains a code fence; fencing it corrupts the output" >&2
        exit 1
      fi
      case "${1##*.}" in
        typ) printf '```typst\n' >> "$out" ;;
        *) printf '```python\n' >> "$out" ;;
      esac
      cat "$1" >> "$out"
      # The closing fence must start on its own line even if the source lacks
      # a trailing newline.
      [ -n "$(tail -c 1 "$1")" ] && printf '\n' >> "$out"
      printf '```\n' >> "$out"
      ;;
    *.md)
      # Strip a leading YAML frontmatter block: mid-document it renders as a
      # horizontal rule plus a setext heading, and Pandoc would not read it as
      # metadata anyway.
      if [ "$(head -n 1 "$1")" = "---" ]; then
        awk 'NR == 1 { next } !done { if ($0 == "---") done = 1; next } { print }' "$1" >> "$out"
        printf '\n' >> "$out"
      else
        cat "$1" >> "$out"
      fi
      ;;
    *)
      cat "$1" >> "$out"
      ;;
  esac
}

for f in "${documents[@]}"; do emit_file "$f" "$f"; done

if [ -n "${BUNDLE:-}" ]; then
  described=.local/report-notebook-describe.txt
  node scripts/describe-report-bundle.mjs "$BUNDLE" > "$described"
  emit_file "$described" "report bundle $(basename "$BUNDLE") — scripts/describe-report-bundle.mjs"
  rm -f "$described"
fi

for f in "${code[@]}"; do emit_file "$f" "$f"; done

printf 'seed: %s sources -> %s (%s bytes)\n' \
  "$emitted" "$out" "$(wc -c < "$out" | tr -d ' ')"
