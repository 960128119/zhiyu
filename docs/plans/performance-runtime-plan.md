# Performance Runtime Plan

This plan captures the target architecture for shrinking the Next.js runtime
surface and moving long-lived work into dedicated services.

## Current Hot Spots

- `apps/web` owns UI, API routes, listener initialization, loop execution, RAG
  ingestion, vector search, and desktop bridge work in one compilation/runtime
  unit.
- API routes import deep application modules directly, so cold starts and dev
  compilation pull in integrations, RAG, database adapters, and agent runtime
  code even when a route only needs a narrow gateway operation.
- RAG has multiple vector backends and now exposes a capability contract, but
  callers still need to migrate from backend-specific environment branches to
  capability-driven selection.

## Target Shape

1. `apps/web`: UI, auth/session entrypoints, and thin HTTP request gateway.
2. `packages/runtime-api`: domain handlers for chat, insights, files, memory,
   loops, integrations, and RAG. Next routes call these handlers instead of
   importing domain internals directly.
3. `packages/runtime-worker`: long-lived process host for integration
   listeners, loop runtime, scheduled jobs, and RAG indexing queues.
4. `packages/ai/rag`: backend-independent RAG and vector contracts, benchmarked
   independently from Next.
5. `packages/integrations/*`: connector-specific adapters with no direct Next
   imports.

## Migration Order

1. Move RAG and vector benchmarking into `benchmark/rag` and make sqlite-vec,
   Chroma, and pgvector advertise explicit capabilities.
2. Rename the stale `packages/rag` workspace package to
   `@openzhiyu/rag-legacy`; keep `packages/ai/rag` as the only active
   `@openzhiyu/rag` package.
3. Introduce `packages/runtime-api` and move one low-risk route family first,
   preferably `/api/memory/*` or `/api/rag/*`, behind a handler interface.
   Initial progress: `/api/rag/search`, `/api/rag/documents`, and
   `/api/rag/documents/[documentId]` now delegate to injected runtime handlers.
4. Introduce `packages/runtime-worker` with a command entrypoint and move RAG
   indexing off request paths before moving listener runtimes. Initial progress:
   `packages/runtime-worker` defines a `rag.index-document` job contract and
   handler runner; `/api/rag/upload/complete` now invokes indexing through this
   worker job contract. The next step is replacing the synchronous adapter with
   a durable queue-backed worker process.
5. Move integration listeners and loop execution into the worker, leaving Next
   routes to enqueue work, stream status, and expose control-plane operations.

## Verification Gates

- `pnpm --filter web tsc`
- RAG/vector unit tests for sqlite-vec, Chroma, unified vector service, and
  unified memory search.
- `pnpm --filter @openzhiyu/benchmark-rag bench:sqlite-vec` with tracked
  p50/p95 for batch upsert, top-k search, filtered search, and retention delete.
- Route migration must prove smaller imports with a route-level dependency scan
  before and after each domain move.
