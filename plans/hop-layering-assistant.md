---
title: Hop layering assistant — composition and substitution
status: proposed
program: deterministic-dag-calculator
target_repo: ~/Development/dag-calculator
depends_on: []
blocks: []
gate: make check + make test; identical inputs produce an identical ranked list, and no absent fraction is scored as zero
---

# Hop layering assistant — composition and substitution

Level 3 of the hop roadmap. Two assistants that look similar and are not.

| | Question | Output |
|---|---|---|
| **Composition** | "which hops, in what ratio, for this oil profile?" | ranked pairs and triplets with a mass ratio |
| **Substitution** | "what replaces this hop?" | a candidate at a mass, plus the trade it accepts |

Both consume the oil facts the synthesis plan lands and the oil model in
`plans/hop-oil-model.md`. Neither may run before both exist: an objective
defined on absent data recommends well-documented hops, not good partners.

## 1. Architecture

- **A recommendation, never an authored value.** The output is a ranked list with
  a stated objective. The user's pick becomes state; the assistant writes
  nothing.
- **Deterministic.** The score is a declared function, the ordering is total
  (ties broken by record id, never by catalogue order), and nothing reads the
  clock or a random source. Same inputs, same list — this is the A9 invariant
  applied to a recommendation.
- **Where it lives.** A pure module over the seed catalogue, tested as such. It
  moves into the artifact only if it starts to *write* a batch value; a
  suggestion that changes a selection is domain, not presentation.

## 2. Composition scoring

The honest part is the input, not the arithmetic.

- **Similarity on shared fields only.** Score each candidate on the fractions it
  and the target both publish; never treat an absent fraction as zero. An absent
  fraction is *unknown*, and scoring it as zero is the same error as reading
  `0.00` as measured.
- **Completeness travels with the score.** "Matches 0.81 on 4 of 9 attributes"
  and "matches 0.78 on 9 of 9" are different claims, and the ranking should not
  hide which is which.
- **Weights are a declared choice.** Fractions are not equally informative:
  myrcene, humulene and linalool carry most of the aroma story; caryophyllene and
  farnesene are structural. The weighting is a decision with a stated basis, not
  a constant buried in a sort comparator.
- **Form and basis are constraints, not inputs.** A candidate with no oil figure
  cannot enter an oil allocation; an aggregator-only row is allowed but labelled,
  the way the seed labels it.

## 3. Substitution is two-dimensional

Preserving IBU and preserving oil dose are different equations. A 1:1
substitution holds both only when the alpha/oil ratios match, which is rare.

So the assistant reports a trade rather than an equivalence:

```
"Citra at 0.82× mass holds the IBU; oil dose falls 18 %."
```

and, where no single hop works, says so:

```
"No single hop holds both. Use X for bittering and Z for the whirlpool."
```

Form substitution is a separate axis: T-90 ↔ Cryo is 0.4–0.5 by mass with a
≈2.7× oil multiplier, so the candidate is (variety, form) pairs, not varieties.

## 4. Output shape

| Field | Why |
|---|---|
| candidates | ordered, total, stable |
| ratio | mass shares that sum to one, for composition |
| mass factor | what the substitution multiplies the charge by |
| trade | IBU delta, oil delta, form change — stated, never implied |
| completeness | matched attributes out of the available nine |
| basis | vendor / survey / aggregator, inherited from the seed rows used |

## 5. Tests

- **Determinism:** same inputs → byte-identical ranking.
- **No absent-as-zero:** removing an attribute from a candidate changes
  completeness, not its score on the remaining fields.
- **Tie-break:** equal scores order by id, not by iteration order.
- **Conservation:** a substitution preserves IBU within a stated epsilon, and the
  oil delta it reports matches the arithmetic.
- **Null exclusion:** a candidate without an oil figure never appears in an oil
  allocation.

## 6. Risks

- **Pseudo-precision.** A 70/20/10 split allocates oil mass; it does not predict
  a flavour. The copy and the docs must say "oil mass share" and stop.
- **Documentation bias.** Better-documented hops score better on more fields.
  Mitigated by completeness and by shared-field scoring, not eliminated.
- **Recommendation mistaken for prescription.** The assistant proposes; the
  brewer decides. No default selection, no auto-apply.

## 7. Open decisions

1. Metric: cosine on normalised fractions, or per-field distance with weights.
   Recommendation: per-field, because the fields have different meanings and a
   vector metric treats them as interchangeable.
2. Whether aggregator-basis rows may be candidates. Recommendation: yes, marked,
   because excluding them would silently halve the southern catalogue.
3. Whether the assistant may propose hops outside the picker's default filter.
   Recommendation: no; it ranks what the user can already see.
4. Where the score is declared: UI module first, artifact once it writes.

## 8. Checklist

- [ ] Define the similarity function and its weights in one place, with tests.
- [ ] Implement the composition ranking over pairs and triplets.
- [ ] Implement the substitution math, including the two-hop fallback.
- [ ] Carry completeness and basis into the output.
- [ ] Determinism and conservation tests.
- [ ] Surface in the hop card, marked as a suggestion.
- [ ] Run `make check` and `make test`.
