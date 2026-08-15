# Domain Glossary

## Work

A Work is a versionable, observable, auditable workshop unit. It combines a mission, control contract, skill bindings, tool policy, loops, memory policy, artifacts, feedback, and change proposals.

## Workshop

A Workshop is the existing runtime container stored in the database. A Workshop becomes a Work when the system derives a complete Work model from its persisted configuration and runtime state.

## Control Contract

A Control Contract defines the controlled object, observation inputs, allowed actions, approval-required actions, denied actions, boundary mode, and feedback signals for a Work.

## Loop

A Loop is a durable recurring or manual task inside a Work. It is not an independent cron job; it belongs to a Work's control objective and must expose scheduling, execution, verification, and failure state.

## Skill Binding

A Skill Binding connects a Work or a specific Loop to a Skill that provides the method used by the agent before it collects mission data or acts.

## Work Change Proposal

A Work Change Proposal is an owner-reviewable change to a Work's mission, tools, skills, loops, verifier, memory policy, or boundary. It is the product equivalent of a pull request for an agent.

## Memory Usage Contract

The Memory Usage Contract is the stable, domain-neutral protocol that tells an agent when and how to recall, verify, interpret, and write memory. It does not grant access and does not contain domain vocabulary.

## Recall Profile

A Recall Profile is a versioned set of ranking hints bound to one Work. It may contain domain terms and memory-type boosts, but it cannot change access policy, memory truth, or global recall behavior.

## Recall Feedback

Recall Feedback is an append-only observation that records whether a context pack was used, irrelevant, missing, stale, incorrect, or conflicting. It is evidence for evaluation, not an automatic policy update.

## Memory Quality Work

A Memory Quality Work observes recall logs, feedback, and index health; runs stable evaluations; performs low-risk index maintenance; and proposes reviewed changes. It does not own other Works' memories and cannot directly rewrite global policy.

## Work Harness

A Work Harness is the versioned executable support around one Work: prompt and context assembly, Skill bindings, tool contracts and gates, Loop specifications, memory profile, verifier, and artifact policy. It excludes business facts, memories, messages, positions, credentials, and model-provider secrets.

## Harness Component

A Harness Component is one independently identifiable and comparable part of a Work Harness. Component types are `prompt`, `skill`, `tool_contract`, `tool_implementation`, `middleware_policy`, `loop_spec`, `memory_profile`, `verifier`, `context_policy`, and `artifact_policy`.

## Harness Revision

A Harness Revision is an immutable, checksummed version of one Harness Component. A candidate creates a new Revision and never overwrites the active Revision.

## Work Harness Snapshot

A Work Harness Snapshot fixes the Work Version, model runtime contract, policy summary, Component Revisions, and component-set hash used by a Run or evaluation cohort.

## Run Evidence Bundle

A Run Evidence Bundle is a layered, desensitized index for one Work Run or Loop Run. It references existing Events, Runs, Context Logs, verifier results, and artifacts without copying or rewriting their raw bodies.

## Evaluation Scenario

An Evaluation Scenario is a versioned replay, dry-run, simulation, shadow, or manual case with fixed preconditions, expected artifacts, metrics, forbidden actions, and hard invariants.

## Evaluation Campaign

An Evaluation Campaign compares an active baseline and an isolated candidate under the same Scenario set, runtime contract, and budget. It cannot execute external, destructive, access-changing, or real-funds actions.

## Harness Change Proposal v2

A Harness Change Proposal v2 is an owner-reviewable, evidence-backed component patch. It must state the failure pattern, root-cause hypothesis, predicted fixes and regressions, success metrics, Evaluation plan, and rollback plan. Quality Work may submit it but cannot approve or publish it.

## Evolution Verdict

An Evolution Verdict records whether a candidate is `confirmed`, `partial`, `rejected`, or `inconclusive` based on matched Scenario outcomes. Hard-invariant failures dominate aggregate scores.

## Harness Quality Work

A Harness Quality Work reads desensitized evidence, diagnoses recurring failures, evaluates isolated candidates, and submits proposals. At Level 1 it has no approval, publishing, permission, grant, protected-verifier, external-send, destructive, or real-funds capability.
