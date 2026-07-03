const { performance } = require("node:perf_hooks");

const baseUrl = process.env.PERF_SMOKE_BASE_URL || "http://127.0.0.1:3515";
const pageThresholdMs = Number(
	process.env.PERF_SMOKE_PAGE_THRESHOLD_MS || "800",
);
const apiThresholdMs = Number(process.env.PERF_SMOKE_API_THRESHOLD_MS || "800");
const timeoutMs = Number(process.env.PERF_SMOKE_TIMEOUT_MS || "30000");

const checks = [
	{ route: "/connectors", expectedStatus: 200, thresholdMs: pageThresholdMs },
	{ route: "/loops", expectedStatus: 200, thresholdMs: pageThresholdMs },
	{
		route: "/api/page-state/connectors",
		expectedStatus: [200, 401],
		thresholdMs: apiThresholdMs,
	},
	{
		route: "/api/page-state/loops",
		expectedStatus: [200, 401],
		thresholdMs: apiThresholdMs,
	},
	{
		route: "/api/runtime/status",
		expectedStatus: [200, 401],
		thresholdMs: apiThresholdMs,
	},
	{
		route: "/api/runtime/bootstrap",
		expectedStatus: [200, 401],
		thresholdMs: apiThresholdMs,
	},
];

function expectedStatusText(expectedStatus) {
	return Array.isArray(expectedStatus)
		? expectedStatus.join("/")
		: String(expectedStatus);
}

function isExpectedStatus(status, expectedStatus) {
	return Array.isArray(expectedStatus)
		? expectedStatus.includes(status)
		: status === expectedStatus;
}

async function fetchWithTiming(route) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const startedAt = performance.now();
	try {
		const response = await fetch(`${baseUrl}${route}`, {
			signal: controller.signal,
			headers: {
				Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
			},
		});
		const body = await response.text();
		return {
			route,
			status: response.status,
			elapsedMs: Math.round(performance.now() - startedAt),
			bytes: body.length,
		};
	} catch (error) {
		return {
			route,
			status: "ERR",
			elapsedMs: Math.round(performance.now() - startedAt),
			bytes: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timeout);
	}
}

async function runPass(label) {
	console.log(`[perf-smoke] ${label}`);
	const results = [];
	for (const check of checks) {
		const result = await fetchWithTiming(check.route);
		results.push({ ...check, ...result });
		console.log(
			`[perf-smoke] ${check.route} -> ${result.status} (${result.elapsedMs}ms, ${result.bytes} bytes)`,
		);
	}
	return results;
}

function validate(results) {
	const failures = [];
	for (const result of results) {
		if (!isExpectedStatus(result.status, result.expectedStatus)) {
			failures.push(
				`${result.route}: expected status ${expectedStatusText(
					result.expectedStatus,
				)}, got ${result.status}${result.error ? ` (${result.error})` : ""}`,
			);
			continue;
		}
		if (result.elapsedMs > result.thresholdMs) {
			failures.push(
				`${result.route}: expected <= ${result.thresholdMs}ms, got ${result.elapsedMs}ms`,
			);
		}
	}
	return failures;
}

async function main() {
	console.log(`[perf-smoke] baseUrl=${baseUrl}`);
	console.log(
		`[perf-smoke] thresholds: pages<=${pageThresholdMs}ms apis<=${apiThresholdMs}ms`,
	);
	await runPass("warmup pass");
	const measured = await runPass("measured hot-path pass");
	const failures = validate(measured);

	if (failures.length > 0) {
		console.error("[perf-smoke] failed:");
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		process.exit(1);
	}

	console.log("[perf-smoke] passed");
}

main().catch((error) => {
	console.error("[perf-smoke] fatal:", error);
	process.exit(1);
});
