#!/usr/bin/env bash
# Concatenate the report-renderer seed set into one Markdown document for a
# notebook/LLM context. Code sources are fenced; documents are included as-is.
#
#   scripts/seed-report-notebook.sh [OUT]
#   OUT=/tmp/seed.md scripts/seed-report-notebook.sh
#
# Default output is .local/report-notebook-seed.md (gitignored).
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

files=(
  plans/report-renderer.md
  docs/report-renderer.md
  docs/adding-a-section.md
  docs/report-bundle.md
  docs/typst-notes.md
  backend/app/templates/report.typ
  backend/app/templates/lib/format.typ
  backend/app/templates/lib/bundle.typ
  tests/backend/test_report_format_parity.py
)

out=${1:-${OUT:-.local/report-notebook-seed.md}}

missing=0
for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "refusing to write a partial seed document" >&2; exit 1; }

mkdir -p "$(dirname "$out")"
: > "$out"

printf '# Report renderer — seed set\n\n' >> "$out"

first=1
for f in "${files[@]}"; do
  if [ "$first" -eq 1 ]; then
    first=0
  else
    # Blank lines matter: a "---" touching text becomes a setext heading.
    printf '\n---\n\n' >> "$out"
  fi

  printf '**Source:** `%s` (%s bytes)\n\n' "$f" "$(wc -c < "$f" | tr -d ' ')" >> "$out"

  case "$f" in
    *.typ|*.py)
      if grep -q '^```' "$f"; then
        echo "error: $f already contains a code fence; fencing it corrupts the output" >&2
        exit 1
      fi
      case "${f##*.}" in
        typ) printf '```typst\n' >> "$out" ;;
        *) printf '```python\n' >> "$out" ;;
      esac
      cat "$f" >> "$out"
      # The closing fence must start on its own line even if the source lacks
      # a trailing newline.
      [ -n "$(tail -c 1 "$f")" ] && printf '\n' >> "$out"
      printf '```\n' >> "$out"
      ;;
    *.md)
      # Strip a leading YAML frontmatter block: mid-document it renders as a
      # horizontal rule plus a setext heading, and Pandoc would not read it as
      # metadata anyway.
      if [ "$(head -n 1 "$f")" = "---" ]; then
        awk 'NR == 1 { next } !done { if ($0 == "---") done = 1; next } { print }' "$f" >> "$out"
        printf '\n' >> "$out"
      else
        cat "$f" >> "$out"
      fi
      ;;
    *)
      cat "$f" >> "$out"
      ;;
  esac
done

printf 'seed: %s files -> %s (%s bytes)\n' \
  "${#files[@]}" "$out" "$(wc -c < "$out" | tr -d ' ')"
