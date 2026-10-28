// The report bundle, loaded once per compile. The path arrives as an input and
// is resolved against `--root` (a leading slash is root-relative, never
// filesystem-absolute). The service passes `/report.json` inside its temp root;
// the local watch loop passes `/.local/report/report.json` with the repo as root.

#let bundle = json(sys.inputs.at("bundle", default: "/report.json"))

// The renderer reads only bundles at the format it was written against: older
// ones lack the display blocks or columns the sections address. Refuse with the
// version in the message rather than a missing-key panic inside a table.
#let bundle-format = 6
#let actual-format = bundle.at("bundle_format", default: none)
#if actual-format != bundle-format {
  panic(
    "report bundle format " + str(actual-format) + " is not supported; this "
    + "renderer needs format " + str(bundle-format) + " (download a fresh "
    + "bundle, or fork and re-freeze a frozen batch)",
  )
}

#let batch = bundle.batch
#let state = bundle.state
#let catalog = bundle.catalog
#let display-values = bundle.formatted
#let display-tables = bundle.formatted_tables
#let display-summaries = bundle.formatted_summaries

#let is-frozen = batch.frozen_at != none
