type HarnessEvolutionEnvironment = Record<string, string | undefined>;

export function isWorkHarnessEvolutionEnabled(
  environment: HarnessEvolutionEnvironment = process.env,
) {
  const value =
    environment.WORK_HARNESS_EVOLUTION_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

export function getHarnessPlatformVersion(
  environment: HarnessEvolutionEnvironment = process.env,
) {
  return (
    environment.OPENZHIYU_BUILD_VERSION?.trim() ||
    environment.VERCEL_GIT_COMMIT_SHA?.trim() ||
    environment.GIT_COMMIT_SHA?.trim() ||
    "development"
  );
}
