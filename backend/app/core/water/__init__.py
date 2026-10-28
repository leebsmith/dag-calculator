"""The sealed water-chemistry solver (ADSCO), split along its phase boundaries.

This package is the sealed boundary supernode in the application's logic graph:
its interior is opaque to callers; only ``orchestration.solve_water_chemistry``
is invoked from outside.

Design constraints:

* Every computational step is a pure function: same inputs -> same outputs,
  no I/O, no mutation of arguments, no hidden state.
* Composite constants are computed exactly once, in ``constants``, and composed
  by the phase functions. No phase re-derives them.
* Findings are one stream. Each finding is a factory in ``telemetry``; the
  boundary's ``warnings`` and ``notes`` are projections of those events, never a
  second wording of the same fact.

Black-box boundary contract:

* Nature: pure and deterministic — same inputs, same outputs; no I/O, no
  mutation of arguments, no hidden state.
* Signature: ``solve_water_chemistry(WaterChemistryInput) -> WaterChemistryOutput``.
* Resolution mode: optimization (HiGHS linear programs and SLSQP least squares),
  followed by a bounded mash-pH inversion.
* Domain: inputs failing a physical or numerical gate raise
  ``SolverValidationError`` (a ``ValueError`` subclass) carrying a ``code``.
* Provenance: ``docs/adsco/`` (frozen specs) reconciled in
  ``plans/adsco-contract.md``; the mash-pH model in
  ``plans/archive/mash-ph-buffer-capacity.md``.

Module map, in pipeline order:

===============  =======================================================
``constants``    physical constants and table lookups
``telemetry``    ``TelemetryEvent``, one factory per finding code, projections
``inputs``       ``GrainEntry``; ``WaterChemistryInput``
``chemistry``    grist acidity, residual alkalinity, mash pH, acid/base dosing
``salts``        ``SaltDose``; dose-to-ion stoichiometry
``router``       the AUTO intent classifier (mode resolution)
``engines``      the LP minimalists, the least-squares cloner, the sparse LP
``dosing``       ``solve_salt_dose`` — routed mode to one per-litre dose
``orchestration`` ``WaterChemistryOutput``, the phases, ``solve_water_chemistry``
===============  =======================================================
"""
