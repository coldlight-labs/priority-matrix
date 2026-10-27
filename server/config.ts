// Server settings, read once at start from environment variables (set in deploy/) and
// checked, so a missing or wrong value stops the server with a clear message.

/** The server's settings. */
export interface ServerConfig {
  /** Port the server listens on inside its container. */
  readonly port: number;
  /** Folder holding accounts.json and accounts/<id>.json. */
  readonly dataDir: string;
  /** Site address links start with, for example https://matrix.example.com. */
  readonly baseUrl: string;
  /**
   * Whether requests come through Caddy, so the caller's address is the last entry
   * of X-Forwarded-For rather than the connection's (which would be Caddy's).
   */
  readonly behindProxy: boolean;
}

/** Reads the settings from `env`; throws with the variable's name if one is wrong. */
export function readConfig(
  env: Record<string, string | undefined>,
): ServerConfig {
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a whole number from 1 to 65535.");
  }
  const dataDir = env.DATA_DIR ?? "";
  if (!dataDir.startsWith("/")) {
    throw new Error("DATA_DIR must be an absolute folder path.");
  }
  const baseUrl = (env.BASE_URL ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(baseUrl)) {
    throw new Error(
      "BASE_URL must be the site address, for example https://matrix.example.com.",
    );
  }
  return {
    port,
    dataDir,
    baseUrl,
    behindProxy: env.BEHIND_PROXY === "true",
  };
}
