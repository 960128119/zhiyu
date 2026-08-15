/**
 * Desktop auth compatibility stubs.
 *
 * The Tauri desktop shell is no longer part of the current product surface.
 * Keep these exports so the shared auth module can compile while always using
 * the standard web auth path.
 */

export function isTauriProductionEnv(): boolean {
  return false;
}

export function createTauriProductionAuthModule() {
  return {
    signIn: async () => ({
      ok: false,
      error: "Tauri desktop auth is disabled in the web-only build.",
    }),
    signOut: async () => {},
  };
}
