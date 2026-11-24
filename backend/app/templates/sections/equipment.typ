// Equipment: the rig's hardware constants, grouped by vessel. Every figure is
// the bundle's frozen display string; the identity supplies the rig's names.

#import "../lib/bundle.typ": batch
#import "../lib/format.typ": formatted-number, formatted-unit, opt, present-formatted

#let GROUPS = (
  (
    title: "Mash tun",
    rows: (
      ("Maximum volume", "equipment.max_mash_tun_volume_l"),
      ("Dead space", "equipment.mash_dead_space_l"),
      ("Transfer loss", "equipment.mash_transfer_loss_l"),
      ("Tun mass", "equipment.mash_tun_mass_kg"),
      ("Tun specific heat", "equipment.mash_tun_specific_heat"),
      ("Ramp rate", "equipment.mash_heating_rate_c_per_min"),
      ("Minimum liquor-to-grist", "equipment.min_lgr_l_per_kg"),
    ),
  ),
  (
    title: "Kettle",
    rows: (
      ("Maximum volume", "equipment.max_kettle_volume_l"),
      ("Dead space", "equipment.kettle_dead_space_l"),
      ("Transfer loss", "equipment.kettle_transfer_loss_l"),
      ("Trub", "equipment.trub_loss_l"),
    ),
  ),
  (
    title: "Hot liquor tank",
    rows: (
      ("Maximum volume", "equipment.max_hlt_volume_l"),
      ("Dead space", "equipment.hlt_dead_space_l"),
      ("Transfer loss", "equipment.hlt_transfer_loss_l"),
      ("Coil floor", "equipment.hlt_coil_floor_l"),
    ),
  ),
  (
    title: "Brewhouse",
    rows: (
      ("Boil-off rate", "equipment.nominal_boil_off_rate_l_per_hr"),
      ("Shrinkage", "equipment.shrinkage_pct"),
      ("Conversion efficiency", "equipment.nominal_conversion_efficiency"),
      ("Grain absorption", "equipment.grain_absorption_factor_l_per_kg"),
    ),
  ),
)

// The rig is sealed with the batch, and its name is what the card and the batch
// facts print; without it the section has no subject.
#let present-equipment() = present-formatted("equipment.name")

#let rig() = opt(batch.identity, "equipment")

#let rig-line() = {
  let name = opt(rig(), "name")
  let description = opt(rig(), "description")
  if name == none or name == "" { return none }
  if description == none or description == "" { return name }
  name + " — " + description
}

// Only constants the producer formatted: a legacy rig record prints the rows it
// has instead of a column of dashes.
#let rows-with-values(group) = group.rows.filter(row => present-formatted(row.at(1)))

#let equipment-row(row) = {
  let unit = formatted-unit(row.at(1))
  (row.at(0), formatted-number(row.at(1)), if unit == none { "" } else { unit })
}

#let render-equipment() = block(breakable: false, {
  let line = rig-line()
  if line != none {
    text(size: 9pt, fill: rgb("#6b6b6b"))[#line]
    v(4pt)
  }
  for group in GROUPS {
    let rows = rows-with-values(group)
    if rows.len() > 0 {
      text(size: 9pt, weight: "bold")[#group.title]
      v(2pt)
      table(
        columns: (1fr, auto, auto),
        align: (left, right, left),
        stroke: none,
        inset: (x: 3pt, y: 2pt),
        ..rows.map(equipment-row).flatten(),
      )
      v(6pt)
    }
  }
  text(size: 8pt, fill: rgb("#6b6b6b"))[
    Hardware constants are sealed with the batch's rig at creation. The volume
    ledger and the limit checks read these same values.
  ]
})
