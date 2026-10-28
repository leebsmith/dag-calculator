"""The sealed batch-sparge solver, split along its phase boundaries.

This package is the sealed boundary supernode in the application's logic graph:
its interior is opaque to callers; only ``orchestration.solve_batch`` is invoked
from outside.

Design constraints (see ``docs/batch-math/implementation-plan.md`` §0):

* Every computational step is a pure function: same inputs -> same outputs,
  no I/O, no mutation of arguments, no hidden state.
* Composite constants are computed exactly once, in ``constants``/``helpers``,
  and composed by the phase functions. No phase re-derives them.

Black-box boundary contract:

* Nature: pure and deterministic — same inputs, same outputs; no I/O, no
  mutation of arguments, no hidden state.
* Signature: ``solve_batch(BatchSolverInput) -> BatchSolverResult``.
* Resolution mode: iterative (bracketed root-finding via
  ``scipy.optimize.brentq``).
* Domain: inputs failing a physical or numerical gate raise
  ``SolverValidationError`` (a ``ValueError`` subclass) carrying a ``code``.
* Provenance: the legacy ``docs/batch-math/`` treatment (not present in this
  repository), consolidated in ``docs/dag-artifacts/domain-equations.md``
  §2.4–2.6.
* Scope: imports nothing from ``app.*`` except the shared equation layer
  ``app.core.utils``, the shared error/capacity table ``app.core.errors``, and
  its own modules.

Module map, in pipeline order:

=================  ======================================================
``constants``      physical constants; the late-addition extract rule
``inputs``         ``GrainBillEntry``; ``BatchSolverInput``
``helpers``        composite aggregates and shared volumetric primitives
``composition``    Phase 1 gravity inversion; Phase 1b extract composition
``volumetric``     Phase 2 volumetric reversal and extract targeting
``grist``          Phase 3 grist mass root-finding
``cascade``        Phase 4 stage volume and gravity cascade
``hlt``            HLT water budget
``orchestration``  scale-pin resolution, pipeline, ``solve_batch``
``diagnostics``    capacity measurement and bracket diagnosis
=================  ======================================================
"""
