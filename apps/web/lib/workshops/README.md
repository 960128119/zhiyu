# Workshops Internal Implementation

`apps/web/lib/workshops` is now an internal implementation area behind
`apps/web/lib/work-runtime`.

New product code should use the Work Runtime interface:

- queries: `listWorks`, `getWorkSnapshot`, `getWorkModelSnapshot`
- commands: `createWork`, `updateWork`, `deleteWork`, `startWorkRun`,
  `createWorkLoop`, `updateWorkLoopActivation`, `runWorkLoop`,
  `restoreWorkVersion`

Direct imports from `workshops/service.ts`, `workshops/runtime.ts`, and
`workshops/loop-service.ts` are legacy adapters unless the caller is part of
the runtime implementation itself.

This keeps the control loop explicit:

```text
Observation -> State -> Work Runtime -> Action -> Feedback
```
