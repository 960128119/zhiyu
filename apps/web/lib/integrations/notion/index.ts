export type NotionStoredCredentials = Record<string, unknown>;
export type NotionMetadata = Record<string, unknown>;
export type NotionUploadResult = Record<string, unknown>;

export async function getNotionContext() {
  return null;
}

export async function listNotionSources() {
  return [];
}

export async function uploadFileToNotion(..._args: unknown[]) {
  return {
    pageId: "",
    pageUrl: "",
    target: "",
  };
}

export async function pullNotionPages(..._args: unknown[]) {
  return [];
}

export function deriveNotionTextPreview(..._args: unknown[]) {
  return "";
}

export function mergeNotionMetadata(..._args: unknown[]) {
  return {};
}
