const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const wechatDir = path.join(rootDir, "tools", "wechat-desktop-service");
const wechatHost = process.env.WECHAT_DESKTOP_HOST || "127.0.0.1";
const wechatPort = Number(process.env.WECHAT_DESKTOP_PORT || "8765");
const pgHost = process.env.OPENZHIYU_PG_HOST || "127.0.0.1";
const pgPort = Number(process.env.OPENZHIYU_PG_PORT || "5432");
const pgContainer = process.env.OPENZHIYU_PG_CONTAINER || "openzhiyu-postgres";
const pgImage = process.env.OPENZHIYU_PG_IMAGE || "postgres:16";
function unique(items) {
	return [...new Set(items.filter(Boolean))];
}

function firstExistingPath(candidates) {
	return (
		unique(candidates).find((candidate) => fs.existsSync(candidate)) || null
	);
}

function findOnPath(command) {
	try {
		const output = execFileSync("where.exe", [command], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		});
		return output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean);
	} catch {
		return null;
	}
}

function findDockerCli() {
	return (
		process.env.DOCKER_CLI_PATH ||
		findOnPath("docker.exe") ||
		firstExistingPath([
			"C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
			"C:\\Program Files\\Docker\\Docker\\Docker\\resources\\bin\\docker.exe",
			"C:\\Windows\\System32\\docker.exe",
			path.join(
				process.env.PROGRAMFILES || "",
				"Docker",
				"Docker",
				"resources",
				"bin",
				"docker.exe",
			),
			path.join(
				process.env["PROGRAMFILES(X86)"] || "",
				"Docker",
				"Docker",
				"resources",
				"bin",
				"docker.exe",
			),
			path.join(
				process.env.LOCALAPPDATA || "",
				"Docker",
				"resources",
				"bin",
				"docker.exe",
			),
		]) ||
		"docker"
	);
}

function findDockerDesktopPath() {
	return firstExistingPath([
		process.env.DOCKER_DESKTOP_PATH,
		"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
		"C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe",
		path.join(
			process.env.PROGRAMFILES || "",
			"Docker",
			"Docker",
			"Docker Desktop.exe",
		),
		path.join(
			process.env["PROGRAMFILES(X86)"] || "",
			"Docker",
			"Docker",
			"Docker Desktop.exe",
		),
		path.join(process.env.LOCALAPPDATA || "", "Docker", "Docker Desktop.exe"),
		"D:\\Docker\\Docker\\Docker Desktop.exe",
		"D:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
	]);
}

const dockerCommand = findDockerCli();
const dockerDesktopPath = findDockerDesktopPath();

function log(message) {
	console.log(`[deps] ${message}`);
}

function warn(message) {
	console.warn(`[deps] ${message}`);
}

function run(command, args, options = {}) {
	const output = execFileSync(command, args, {
		cwd: options.cwd || rootDir,
		encoding: "utf8",
		stdio: options.stdio || ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});
	return typeof output === "string" ? output.trim() : "";
}

function tryRun(command, args) {
	try {
		return run(command, args);
	} catch {
		return null;
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(host, port, timeoutMs = 1000) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host, port });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve(false);
		}, timeoutMs);

		socket.once("connect", () => {
			clearTimeout(timer);
			socket.end();
			resolve(true);
		});
		socket.once("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
}

async function waitForPort(label, host, port, timeoutMs = 30000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await canConnect(host, port)) {
			log(`${label} is reachable at ${host}:${port}`);
			return true;
		}
		await sleep(1000);
	}
	throw new Error(`${label} did not become reachable at ${host}:${port}`);
}

function dockerInfo() {
	return tryRun(dockerCommand, ["info", "--format", "{{.ServerVersion}}"]);
}

async function waitForDocker(timeoutMs = 120000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const version = dockerInfo();
		if (version) {
			log(`Docker Engine is ready (${version})`);
			return;
		}
		await sleep(2000);
	}
	throw new Error(
		"Docker Desktop started, but Docker Engine was not ready in time.",
	);
}

async function ensureDockerReady() {
	const version = dockerInfo();
	if (version) {
		log(`Docker Engine already ready (${version})`);
		return;
	}

	if (process.env.OPENZHIYU_SKIP_DOCKER_DESKTOP_START === "1") {
		throw new Error(
			"Docker is not running or docker CLI is unavailable. Start Docker Desktop, then run pnpm dev again.",
		);
	}

	if (!dockerDesktopPath) {
		throw new Error(
			`Docker is not running. docker CLI tried: ${dockerCommand}. Docker Desktop was not found in common locations. Set DOCKER_DESKTOP_PATH to your Docker Desktop.exe path, set DOCKER_CLI_PATH to docker.exe, or start Postgres yourself and set OPENZHIYU_SKIP_POSTGRES=1.`,
		);
	}

	log(
		`Docker Engine is not ready. Starting Docker Desktop from ${dockerDesktopPath}`,
	);
	const child = spawn(dockerDesktopPath, [], {
		detached: true,
		stdio: "ignore",
		windowsHide: false,
	});
	child.unref();

	log("Waiting for Docker Engine to become ready...");
	await waitForDocker();
}

async function ensurePostgres() {
	if (process.env.OPENZHIYU_SKIP_POSTGRES === "1") {
		log("Postgres startup skipped by OPENZHIYU_SKIP_POSTGRES=1");
		return;
	}

	if (await canConnect(pgHost, pgPort)) {
		log(`Postgres already listening at ${pgHost}:${pgPort}`);
		ensureLocalPostgresSchema();
		return;
	}

	await ensureDockerReady();

	const exists = tryRun(dockerCommand, [
		"inspect",
		"-f",
		"{{.Name}}",
		pgContainer,
	]);
	if (exists) {
		const running = tryRun(dockerCommand, [
			"inspect",
			"-f",
			"{{.State.Running}}",
			pgContainer,
		]);
		if (running !== "true") {
			log(`Starting Docker container ${pgContainer}`);
			run(dockerCommand, ["start", pgContainer], { stdio: "inherit" });
		} else {
			log(`Docker container ${pgContainer} is already running`);
		}
	} else {
		log(`Creating Docker container ${pgContainer}`);
		run(
			dockerCommand,
			[
				"run",
				"-d",
				"--name",
				pgContainer,
				"-e",
				"POSTGRES_USER=openzhiyu",
				"-e",
				"POSTGRES_PASSWORD=openzhiyu",
				"-e",
				"POSTGRES_DB=openzhiyu",
				"-p",
				`${pgPort}:5432`,
				"-v",
				"openzhiyu-postgres-data:/var/lib/postgresql/data",
				pgImage,
			],
			{ stdio: "inherit" },
		);
	}

	await waitForPort("Postgres", pgHost, pgPort, 45000);
	ensureLocalPostgresSchema();
}

function ensureLocalPostgresSchema() {
	if (process.env.OPENZHIYU_SKIP_POSTGRES_SCHEMA_REPAIR === "1") {
		log(
			"Postgres schema repair skipped by OPENZHIYU_SKIP_POSTGRES_SCHEMA_REPAIR=1",
		);
		return;
	}

	const exists = tryRun(dockerCommand, [
		"inspect",
		"-f",
		"{{.Name}}",
		pgContainer,
	]);
	if (!exists) {
		return;
	}

	const running = tryRun(dockerCommand, [
		"inspect",
		"-f",
		"{{.State.Running}}",
		pgContainer,
	]);
	if (running !== "true") {
		return;
	}

	try {
		run(
			dockerCommand,
			[
				"exec",
				pgContainer,
				"psql",
				"-U",
				"openzhiyu",
				"-d",
				"openzhiyu",
				"-v",
				"ON_ERROR_STOP=1",
				"-c",
				[
					'ALTER TABLE "rss_subscriptions" ADD COLUMN IF NOT EXISTS "last_error_code" varchar(32);',
					'ALTER TABLE "rss_subscriptions" ADD COLUMN IF NOT EXISTS "last_error_message" text;',
				].join(" "),
			],
			{ stdio: "ignore" },
		);
		log("Postgres local schema repair complete");
	} catch (error) {
		warn(
			`Postgres local schema repair failed. Run migrations manually if RSS APIs fail. ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

async function checkWechatHealth() {
	try {
		const response = await fetch(`http://${wechatHost}:${wechatPort}/health`);
		return response.ok;
	} catch {
		return false;
	}
}

function ensureWechatVenv() {
	const venvPython = path.join(wechatDir, ".venv", "Scripts", "python.exe");
	if (fs.existsSync(venvPython)) {
		return venvPython;
	}

	log("Creating WeChat service Python virtual environment");
	try {
		run("py", ["-3.12", "-m", "venv", ".venv"], {
			cwd: wechatDir,
			stdio: "inherit",
		});
	} catch {
		run("python", ["-m", "venv", ".venv"], {
			cwd: wechatDir,
			stdio: "inherit",
		});
	}

	return venvPython;
}

async function ensureWechatService() {
	if (process.env.OPENZHIYU_SKIP_WECHAT === "1") {
		log("WeChat desktop service startup skipped by OPENZHIYU_SKIP_WECHAT=1");
		return;
	}

	if (await checkWechatHealth()) {
		log(
			`WeChat desktop service already healthy at ${wechatHost}:${wechatPort}`,
		);
		return;
	}

	const python = ensureWechatVenv();
	log("Installing WeChat service Python dependencies");
	run(python, ["-m", "pip", "install", "-r", "requirements.txt"], {
		cwd: wechatDir,
		stdio: "inherit",
	});

	log(`Starting WeChat desktop service at ${wechatHost}:${wechatPort}`);
	const child = spawn(
		python,
		[
			"server.py",
			"--host",
			wechatHost,
			"--port",
			String(wechatPort),
			"--backend",
			process.env.WECHAT_DESKTOP_BACKEND || "window",
		],
		{
			cwd: wechatDir,
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		},
	);
	child.unref();

	const startedAt = Date.now();
	while (Date.now() - startedAt < 15000) {
		if (await checkWechatHealth()) {
			log(`WeChat desktop service is healthy at ${wechatHost}:${wechatPort}`);
			return;
		}
		await sleep(1000);
	}

	warn(
		"WeChat desktop service did not report healthy within 15s. The web app can still start, but WeChat sending may fail.",
	);
}

async function main() {
	await ensurePostgres();
	await ensureWechatService();
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[deps] ${message}`);
	process.exit(1);
});
