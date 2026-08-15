import { Skeleton } from "@openzhiyu/ui";

function SkeletonLine({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export function WorkshopLoadingShell() {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#F8FAF9]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-px w-6 bg-[var(--product-amber)]"
                aria-hidden="true"
              />
              <SkeletonLine className="h-3 w-20" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <SkeletonLine className="h-8 w-48" />
              <SkeletonLine className="h-6 w-16 rounded-full" />
            </div>
            <SkeletonLine className="mt-3 h-4 w-full max-w-xl" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonLine className="h-9 w-28 rounded-md" />
            <SkeletonLine className="h-9 w-24 rounded-md" />
          </div>
        </header>

        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="flex h-[min(720px,calc(100vh-2rem))] min-h-0 flex-col rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <SkeletonLine className="h-4 w-16" />
                <SkeletonLine className="h-3 w-6" />
              </div>
              <SkeletonLine className="mt-3 h-3 w-full" />
            </div>
            <div className="min-h-0 flex-1 divide-y divide-border overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed loading skeleton rows
                  key={index}
                  className="px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <SkeletonLine className="h-4 w-28" />
                    <SkeletonLine className="h-5 w-14 rounded-full" />
                  </div>
                  <SkeletonLine className="mt-3 h-3 w-full" />
                  <SkeletonLine className="mt-2 h-3 w-4/5" />
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3">
              <SkeletonLine className="h-9 w-full rounded-md" />
            </div>
          </aside>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="flex h-[min(720px,calc(100vh-2rem))] min-h-0 min-w-0 flex-col gap-4">
              <div className="space-y-3">
                <div className="px-1 py-1">
                  <SkeletonLine className="h-4 w-20" />
                  <SkeletonLine className="mt-3 h-3 w-64" />
                </div>

                <div className="grid divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed loading metric slots
                      key={index}
                      className="px-4 py-4"
                    >
                      <SkeletonLine className="h-4 w-20" />
                      <SkeletonLine className="mt-4 h-7 w-16" />
                      <SkeletonLine className="mt-3 h-3 w-28" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                  <SkeletonLine className="h-4 w-24" />
                  <SkeletonLine className="h-8 w-28 rounded-md" />
                </div>
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed loading activity rows
                      key={index}
                      className="rounded-md border border-border/70 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <SkeletonLine className="h-4 w-40" />
                        <SkeletonLine className="h-5 w-16 rounded-full" />
                      </div>
                      <SkeletonLine className="mt-3 h-3 w-full" />
                      <SkeletonLine className="mt-2 h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <aside className="flex h-[min(720px,calc(100vh-2rem))] min-h-0 flex-col rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <SkeletonLine className="h-4 w-24" />
                <SkeletonLine className="h-8 w-20 rounded-md" />
              </div>
              <div className="mt-4 flex gap-2 overflow-hidden">
                {Array.from({ length: 4 }).map((_, index) => (
                  <SkeletonLine
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed loading tabs
                    key={index}
                    className="h-8 w-20 shrink-0 rounded-md"
                  />
                ))}
              </div>
              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-hidden">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed loading side rows
                    key={index}
                    className="rounded-md border border-border/70 p-3"
                  >
                    <SkeletonLine className="h-4 w-3/4" />
                    <SkeletonLine className="mt-3 h-3 w-full" />
                    <SkeletonLine className="mt-2 h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
