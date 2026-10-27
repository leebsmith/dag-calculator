// The report bundle, loaded once per compile. The path arrives as an input and
// is resolved against `--root` (a leading slash is root-relative, never
// filesystem-absolute). The service passes `/report.json` inside its temp root;
// the local watch loop passes `/.local/report/report.json` with the repo as root.

#let bundle = json(sys.inputs.at("bundle", default: "/report.json"))
#let batch = bundle.batch
#let state = bundle.state
#let catalog = bundle.catalog
#let display-values = bundle.formatted
#let display-tables = bundle.formatted_tables

#let is-frozen = batch.frozen_at != none
