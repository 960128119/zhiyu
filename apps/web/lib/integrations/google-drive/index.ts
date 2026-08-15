export const GOOGLE_DRIVE_SCOPES: string[] = [];

export type GoogleDriveStoredCredentials = Record<string, unknown>;
export type UploadedGoogleDriveFile = Record<string, unknown>;

export async function listGoogleDriveFiles() {
  return [];
}

export async function getGoogleDriveFile() {
  return null;
}

export async function uploadFileToGoogleDrive(_input?: unknown) {
  return {
    id: "",
    name: "",
    mimeType: "",
    sizeBytes: 0,
    webViewLink: "",
    webContentLink: "",
    iconLink: "",
  };
}

export async function deleteGoogleDriveFile(_input?: unknown) {
  return;
}
