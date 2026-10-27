#!/usr/bin/env bash
# Concatenate the report-renderer reference set into one Markdown document, and
# optionally describe a real bundle into a second, small one.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"

usage() {
  cat <<'TXT'
usage: scripts/seed-report-notebook.sh [--bundle PATH] [OUT]

Writes the sources for a report-renderer notebook:

  OUT          the master concatenation — design record, renderer contract,
               authoring checklist, bundle contract, Typst notes, the generated
               path glossary, the template sources, and the format-parity test.
               Default: .local/report-notebook-seed.md
  OUT-values   one line per resolved path in a real bundle, produced by
               scripts/describe-report-bundle.mjs. Written only with --bundle;
               the path is OUT with "-values.txt" replacing ".md"
               (default .local/report-notebook-seed-values.txt).

options:
  --bundle PATH   describe a downloaded report bundle into the -values file
  -h, --help      show this text

environment:
  OUT             alternative to the positional output path
  BUNDLE          alternative to --bundle
TXT
}

with_values=""
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --bundle)
      [ "$#" -ge 2 ] || { echo "--bundle needs a path" >&2; usage >&2; exit 1; }
      with_values=$2
      shift
      ;;
    --bundle=*) with_values=${1#--bundle=} ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 1 ;;
    *) out="$1" ;;
  esac
  shift
done
out=${out:-${OUT:-.local/report-notebook-seed.md}}
with_values=${with_values:-${BUNDLE:-}}

# Prose and reference first, then the code that consumes them.
documents=(
  plans/report-renderer.md
  docs/report-renderer.md
  docs/adding-a-section.md
  docs/report-bundle.md
  docs/typst-notes.md
  docs/report-bundle-glossary.md
)

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
if [ -n "$with_values" ] && [ ! -f "$with_values" ]; then
  echo "missing bundle: $with_values" >&2
  missing=1
fi
[ "$missing" -eq 0 ] || { echo "refusing to write a partial seed document" >&2; exit 1; }

values_out="${out%.md}-values.txt"
if [ -n "$with_values" ] && [ "$values_out" = "$out" ]; then
  values_out="${out}-values.txt"
fi

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
for f in "${code[@]}"; do emit_file "$f" "$f"; done

printf 'master: %s sources -> %s (%s bytes)\n' \
  "$emitted" "$out" "$(wc -c < "$out" | tr -d ' ')"

if [ -n "$with_values" ]; then
  node scripts/describe-report-bundle.mjs "$with_values" > "$values_out"
  printf 'values: %s -> %s (%s bytes)\n' \
    "$(basename "$with_values")" "$values_out" "$(wc -c < "$values_out" | tr -d ' ')"
elif [ -f "$values_out" ]; then
  echo "note: $values_out is from a previous run; regenerate with --bundle" >&2
fi
