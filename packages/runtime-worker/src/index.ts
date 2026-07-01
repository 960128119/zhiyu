export * from "./jobs";
export * from "./file-queue";
export * from "./worker-loop";

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  console.log(
    "@openzhiyu/runtime-worker is installed. Import runRuntimeWorkerLoop() from a host package and provide handlers.",
  );
}
