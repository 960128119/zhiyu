---
name: harness-quality-control
description: Audit Zhiyu Work Harness quality from structured run evidence, diagnose recurring failures, run isolated baseline-versus-candidate evaluations, and submit owner-reviewable Harness Change Proposal v2 records. Use for scheduled Harness quality audits, repeated Work or Loop failures, candidate regression checks, and evidence-backed prompt, skill, loop, memory-profile, context-policy, or artifact-policy improvements. Never use it to publish changes, alter permissions or grants, weaken denied rules, expose cross-Work memory, or execute real-world actions.
---

# Harness Quality Control

Treat a Work Harness as a versioned controller. Improve it only through an observable, falsifiable loop:

```text
run evidence -> diagnosis -> narrow hypothesis -> proposal -> owner approval
-> isolated candidate -> matched evaluation -> verdict -> owner decision
```

## Audit Workflow

1. Call `workshopInspectHarnessQuality` for one target Work.
2. Check evidence completeness before interpreting failures. Treat partial capture as uncertainty.
3. Separate data, access, tool, context, memory, planning, verification, artifact, and external-dependency symptoms.
4. Look for a recurring pattern across at least two independent Evidence Bundles. A deterministic configuration defect may be proposed from one verified case.
5. If evidence is insufficient, write an observation and request more capture. Do not create a speculative proposal.
6. Select one primary Harness component type. Set `attributionLimited=true` only when a coupled change is unavoidable and explain why attribution will be weaker.
7. Create a falsifiable Proposal v2 with `workshopCreateHarnessProposal`.
8. Stop. The owner must approve and materialize the candidate.
9. After owner materialization, call `workshopCreateHarnessEvaluationCampaign`, then `workshopRunHarnessEvaluation`.
10. Report the scenario-level verdict and leave production publishing to the owner.

Read [references/proposal-contract.md](references/proposal-contract.md) before constructing a proposal or interpreting a campaign.

## Evidence Rules

- Cite only `verifiedEvidenceRef` values returned by the inspection tool as verified Harness evidence.
- Use event or run references only when the target Work can independently resolve them.
- Do not copy raw event bodies, memory content, credentials, user messages, or hidden evaluation fixtures into a proposal.
- A denied candidate count normally proves policy enforcement. It does not prove a missing grant.
- Missing context logs mean unobserved execution, not a dormant or broken Work.
- Correlation across runs is a root-cause candidate, not proof. Keep confidence and alternative causes explicit.

## Change Rules

- Never target `system_protected`, `observe_only`, or risk `protected` components.
- Never remove denied actions, change permission or grant policy, disable audit, weaken protected verifiers, or expand real-world action powers.
- Prefer a JSON Merge Patch that changes the smallest useful surface.
- Keep the base Work Version, Snapshot ID, component hash, and before Revision exactly as returned by inspection.
- Include at least one predicted fix, one regression guard, measurable success criteria, and a component or Work-version rollback plan.
- Use numeric prediction thresholds so attribution can confirm or refute them.

## Evaluation Rules

- Compare baseline and candidate under the same runtime contract and budget.
- Run only built-in deterministic replay, dry-run, or simulation fixtures.
- Treat external send, real funds, deletion, payment, permission changes, and grant changes as forbidden.
- Let hard-invariant failures dominate aggregate scores.
- Treat missing runs, timeouts, runtime-contract drift, and insufficient samples as inconclusive.
- Do not inspect, rewrite, or optimize against hidden holdout fixtures.
- A confirmed candidate is still not published. It remains an owner decision.

## Finish Each Run

Record:

- observation window and Evidence Bundle ids;
- failure pattern and confidence;
- whether a proposal was created or withheld;
- proposal, campaign, and verdict ids when present;
- hard-invariant failures and regressions;
- the next checkpoint or owner action.

Never claim that production changed unless a separate owner-controlled publish event exists.
