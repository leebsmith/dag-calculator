# Vision — a solver, not a recipe log

This document states **why** the calculator is built the way it is. It is not a spec:
`grammar.md` says what the artifact may contain, `semantics.md` says what it means,
`engine.md` says how it is interpreted. This says what the whole thing is *for*, and
gives reviewers a way to tell whether a change serves that purpose or erodes it.

---

## 1. The inversion

Traditional recipe software assumes the grain bill is the free variable. You pick
malts and quantities, then iterate — by hand — toward the numbers you wanted. The
target is an end state you converge on, and the bill is where the iteration happens.

This calculator inverts that. A recipe is authored as:

- **proportions** — relative parts across the grist, and the same for hops and salts;
- **intensity** — how concentrated the mash is (L:G, or a runoff ratio);
- **targets** — ABV, IBU, ion concentrations, batch volume.

The solver root-finds the **size**. `m_grist` is a boundary output, not an input. Hop
masses are solved from IBU targets and hop shares; salt and acid doses are solved from
pinned ion targets. You state where you want to end up; the engine computes how much.

That is the novel part, and it is the part to protect. Anything that makes a quantity
an input again — or that requires the user to iterate by hand to hit a target the
engine could have solved — is moving backwards.

---

## 2. Three layers

Defined in `semantics.md` §1.2, restated here because every design argument reduces to it:

| Layer | Contents | Mutability |
|---|---|---|
| **Logic** | `data/artifact.json` — nodes, dimensions, constants, functions, relations | static, authoritative, view-independent |
| **State** | roots, choices, collections, selections, identity | user-set; the only mutable thing |
| **Derived** | computed values | never stored; a pure function of state |

Two consequences follow, and they are not negotiable:

- **Nothing derived is persisted.** If a value can be recomputed, storing it creates a
  second truth that can drift.
- **Absence is not zero.** Unset means unset (`undefined` in the engine, `null` in
  payloads). Rendering absence as zero is a bug, not a convenience.

---

## 3. Why a boundary is where it is

Most values are computed forward: inputs and ancestors determine them, so they belong
in the artifact as `derived` nodes, in a language that can be inspected, unit-checked
and inventoried.

Some questions run the other way: *given the target, what input satisfies it?* That is
an inversion, and it **cannot** be expressed as a derived node — writing it out would
require `m_grist ← sg_post_boil ← … ← m_grist`, a cycle. So it is packaged as a
`boundary`: the artifact declares the contract (inputs, outputs, resolution, domain
codes) and a host implementation owns the interior.

The rule, therefore, is not "use boundaries for hard things":

> **Declare what runs forward. Box what runs backward.**

Everything else follows from that. The three boundaries exist because three
quantities are inverted (batch size, bitterness, water treatment). The 37 derived
nodes exist because the rest is ordinary forward arithmetic — and they stay declarative
precisely so units, dimensions, and provenance remain checkable. Making everything a
black box would buy implementation freedom at the cost of every guarantee the artifact
currently provides, for the ~9% of artifact bytes that are actually arithmetic.

A boundary contract is also where **infeasibility is declared**. A solver that cannot
reach a target says so with a code (`ABV_UNREACHABLE`, `MASH_TOO_THIN`,
`SALT_SOLVE_FAILED`) rather than approximating. "No answer exists" is a first-class
result.

---

## 4. What determinism means here

Given the roots, every derived value is a pure function of its ancestors. The engine is
synchronous, DOM-free, and has no read-tracking or reactivity: dependencies exist only
where the artifact declares them.

- **Arrival order never changes values** — only *freshness* (whether a remote result is
  current), which is a runtime concern.
- **Boundaries must be idempotent** — same inputs, same outputs. Their interiors may
  iterate; the contract may not vary.
- **Lazy + memoised** — a node is evaluated when pulled and recomputed when a declared
  ancestor changes. Never eagerly, never on a hunch.

Determinism is not a performance property. It is what makes a recipe reproducible, a
report bundle meaningful, and a bug report actionable.

---

## 5. What the tool refuses to do

These are boundaries of the product, not gaps:

1. **Clamp an authored value.** If the user sets 5.5 L/kg and the solve uses 4.0, the
   root is fiction and the user learns the wrong model. A declared numeric bound may be
   enforced at entry; a policy preference may not be applied silently.
2. **Clamp a derived value.** In an inverted topology the derived value is not a free
   variable. "Clamping" it means rewriting the input the user did author.
3. **Auto-switch a choice.** Changing the topology or the method to make a number
   acceptable changes *intent*, not a value. Offer it; never do it.
4. **Optimise the discrete dimensions.** Which malts, which hops, which rests, which
   schedule — those are taste, and they are what a brewer is actually deciding. The
   solver's job is the continuous arithmetic around them. A Pareto search over
   composition is a different product, and it needs a stated preference model the
   artifact cannot honestly contain.
5. **Report numbers for a batch that cannot exist.** A mash that cannot hold its own
   water has no valid cascade. (Capacity overruns are different: those batches *can* be
   calculated, and are reported critically rather than hidden.)
6. **Hold a rule in one layer only.** If the artifact declares an error code, something
   must be able to emit it. If a bound is declared in the domain, the wire should not
   invent a different one.

---

## 6. Review checklist

Ask these of any change to the engine, artifact, or solvers:

1. **Declare or hide?** Does the change put the rule where it can be inspected, or
   behind code that happens to work?
2. **Arrow check.** Is any inversion being expressed as forward arithmetic (or vice
   versa) instead of crossing a declared boundary?
3. **Accountability.** After this change, can a user still see why a number is what it
   is? A value that appears without a path — a clamp, a hidden default, an optimistic
   fallback — fails this.
4. **Policy or physics?** If a limit is a convention, it is a policy constant and it
   warns. If it is a physical impossibility, it is a capability limit and it fails.
   Do not dress one as the other.
5. **Truth location.** Is the rule enforced where the truth lives — artifact for
   declaration, core for solvability, transport for shape?
6. **Guard or reviewer?** Will a fixture, dimension check, or guard catch a regression,
   or does it depend on someone remembering? Prefer the former.

A change that satisfies all six is probably right. One that fails 2, 3, or 5 usually
looks fine in tests and rots within a release.

---

## 7. Where the pieces live

| Question | Document |
|---|---|
| What may the artifact contain? | `docs/dag-artifacts/grammar.md` |
| What does it mean? | `docs/dag-artifacts/semantics.md` |
| What are the domain formulas? | `docs/dag-artifacts/domain-equations.md` |
| How is it interpreted? | `docs/engine.md` |
| How do I add a value? | `docs/adding-a-node.md` |
| Why these batch-solver rules? | `plans/batch-solver-correctness.md` |
| Current work queue | `TODO.md` |
