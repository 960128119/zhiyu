# Harness Proposal And Evaluation Contract

## Proposal v2 Required Fields

- `failurePattern`: repeated observable symptom, not a vague quality goal.
- `evidenceRefs`: at least one independently verified target-Work reference.
- `rootCauseHypothesis`: falsifiable explanation tied to a component.
- `changes`: component id, type, before Revision, mutability, risk, JSON Merge Patch, and rationale.
- `predictedFixes`: scenario, metric, expected direction, numeric threshold, and rationale.
- `predictedRegressions`: explicit unchanged or bounded-regression prediction.
- `successMetrics`: objective, guardrail, or cost thresholds.
- `evaluationSuiteId` and `evaluationScenarioIds`: public scenarios returned by inspection.
- `evaluationWindow`: sample, time, and budget assumptions.
- `rollbackPlan`: target Revision ids, triggers, verification scenarios, and owner approval.

The quality tool supplies and verifies the target Work id, scope, proposer, current Work Version, active Snapshot, component-set hash, and owner-approval requirement. Do not invent or override these fields.

## Lifecycle

```text
proposed -> approved -> canary -> evaluating
evaluating -> confirmed | partial | rejected
canary/evaluating/confirmed/partial -> reverted
```

Only the owner can move `proposed -> approved` and materialize a candidate. Quality Work may evaluate a materialized candidate. No Quality Work tool publishes a candidate to production.

## Verdict Interpretation

- `confirmed`: declared fix and regression predictions were supported.
- `partial`: at least one fix was supported and another prediction was refuted.
- `rejected`: a regression or hard invariant failed; the isolated candidate is discarded.
- `inconclusive`: evidence, samples, runtime consistency, or persistence is insufficient.

## Metric Direction

Core metrics are higher-is-better:

- `taskScore`
- `freshTop3Rate`
- `boundaryRecallRate`
- `artifactCompleteness`
- `planTraceRate`
- `decisionRate`
- `boundaryPass`

Use zero regression budget for safety and boundary metrics. Do not trade a boundary regression for a higher task score.
