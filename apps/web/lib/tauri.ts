/**
 * Browser-only compatibility helpers.
 *
 * The Tauri desktop shell has been removed from this project. These exports keep
 * older UI code compiling while desktop-only actions degrade to no-ops.
 */

export const isTauri = () => false;

export const getDataDirectory = async () => null;
export const getStorageDirectory = async () => null;
export const getMemoryDirectory = async () => null;
export const getSystemLocale = async (): Promise<string | null> => null;
export const getAppInfo = async () => null;
export const openDevTools = async () => {};

export const openUrl = async (url: string) => {
  if (typeof window !== "undefined") {
    window.open(url, "_blank");
    return;
  }
  return url;
};

export const openPathCustom = async (_path: string): Promise<boolean> => false;
export const pickFolderDialog = async (): Promise<string | null> => null;
export const readFileBinary = async (
  _path: string,
): Promise<Uint8Array | null> => null;
export const readFile = async (_path: string): Promise<string | null> => null;
export const fileStat = async (
  _path: string,
): Promise<{ size: number; isFile: boolean; isDir: boolean } | null> => null;
export const fileExists = async (_path: string): Promise<boolean> => false;
export const mkdirCustom = async (_dirPath: string): Promise<void> => {};
export const writeTextFileCustom = async (
  _filePath: string,
  _content: string,
): Promise<void> => {};
export const readTextFileCustom = async (
  _filePath: string,
): Promise<string | null> => null;
export const removeFileCustom = async (_filePath: string): Promise<void> => {};
export const revealItemInDir = async (_path: string): Promise<boolean> => false;
export const homeDirCustom = async (): Promise<string | null> => null;
export const getPlatform = () =>
  typeof window === "undefined" ? "unknown" : "browser";

export interface UpdateCheckResult {
  has_update: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
  release_url: string;
  file_size: number;
}

export interface UpdateInstallResult {
  auto_installed: boolean;
  message: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  done: boolean;
  error: string | null;
}

export const checkForUpdate =
  async (): Promise<UpdateCheckResult | null> => null;
export const startUpdateDownload = async (
  _downloadUrl: string,
  _fileSize: number,
): Promise<void> => {};
export const pollUpdateDownloadProgress =
  async (): Promise<DownloadProgress> => ({
    downloaded: 0,
    total: 0,
    percent: 0,
    done: false,
    error: null,
  });
export const finishUpdateDownload =
  async (): Promise<UpdateInstallResult | null> => null;
export const downloadAndInstallUpdate = async (
  _downloadUrl: string,
  _fileSize: number,
): Promise<UpdateInstallResult | null> => null;
export const restartForUpdate = async (): Promise<void> => {};

export interface ServerStatus {
  running: boolean;
  status: string;
  error_message: string | null;
  node_version: string | null;
}

export async function getServerStatus(): Promise<ServerStatus | null> {
  return null;
}

export async function restartServer(): Promise<void> {}

export interface DesktopRuntimeComponentStatus {
  available: boolean;
  install_dir: string | null;
  installed: boolean;
  downloading: boolean;
  reason: string | null;
  error_message: string | null;
}

export interface DesktopRenderRuntimeStatus {
  available: boolean;
  install_dir: string | null;
  installed: boolean;
  downloading: boolean;
  reason: string | null;
  error_message: string | null;
  soffice_binary_path: string | null;
  pdftoppm_binary_path: string | null;
}

export interface DesktopRenderEngineInstalled {
  version: string;
  installed_at: string;
  install_dir: string;
  soffice_path: string;
  pdftoppm_path: string;
  python_path?: string;
}

export interface DesktopRenderEngineStatus {
  available: boolean;
  install_dir: string | null;
  installed: boolean;
  downloading: boolean;
  reason: string | null;
  error_message: string | null;
}

export async function getRenderEngineStatus(): Promise<DesktopRenderEngineStatus | null> {
  return null;
}

export async function ensureRenderEngineDownloadStarted(): Promise<DesktopRenderEngineStatus | null> {
  return null;
}

export async function sendNotification(
  _title: string,
  _body: string,
): Promise<void> {}

export const tauriApi = {
  isTauri,
  getDataDirectory,
  getStorageDirectory,
  getMemoryDirectory,
  getAppInfo,
  openDevTools,
  openUrl,
  openPathCustom,
  readFile,
  readFileBinary,
  fileStat,
  fileExists,
  mkdirCustom,
  writeTextFileCustom,
  readTextFileCustom,
  removeFileCustom,
  revealItemInDir,
  homeDirCustom,
  getPlatform,
  getServerStatus,
  restartServer,
  checkForUpdate,
  downloadAndInstallUpdate,
  restartForUpdate,
  getRenderEngineStatus,
  sendNotification,
};
