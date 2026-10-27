/// <reference types="node" />
// Connects the API handler to Node's web server (ADR 0003). It reads at most
// MAX_BODY_BYTES of a body, works out the caller's address for the rate limits, and
// sends JSON with no caching. Everything else is the handler's job.

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { ServerConfig } from "./config";
import { accountsOnDisk, diskFiles } from "./disk";
import { createHandler, MAX_BODY_BYTES, type ApiRequest } from "./handler";
import { createRateLimiter } from "./limits";
import { createStore } from "./store";

/** Requests per minute allowed per address and per account. */
const REQUESTS_PER_MINUTE = 300;
/** Wrong keys per minute allowed per address. */
const FAILED_KEYS_PER_MINUTE = 10;
const MINUTE_MS = 60_000;

/** A running server: its port, and a way to stop it (used by the end-to-end test). */
export interface RunningServer {
  readonly port: number;
  close(): Promise<void>;
}

/** Starts the server with `config`; resolves once it is listening. */
export function startServer(config: ServerConfig): Promise<RunningServer> {
  const files = diskFiles();
  const accounts = accountsOnDisk(files, config.dataDir);
  const now = () => new Date();
  const handle = createHandler({
    // Read on every request, so a revoke on the VPS takes effect at once.
    loadAccounts: () => accounts.read(),
    store: createStore(files, config.dataDir),
    limits: {
      request: createRateLimiter({
        limit: REQUESTS_PER_MINUTE,
        windowMs: MINUTE_MS,
        now,
      }),
      failedKey: createRateLimiter({
        limit: FAILED_KEYS_PER_MINUTE,
        windowMs: MINUTE_MS,
        now,
      }),
    },
    now,
    log: (entry) => {
      console.log(JSON.stringify(entry));
    },
  });

  const server: Server = createServer((req, res) => {
    // A caller can drop the connection mid-request; that must never stop the server.
    handleRequest(req, res).catch(() => {
      console.log(JSON.stringify({ event: "request_aborted" }));
      res.destroy();
    });
  });

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const send = (status: number, json: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(json === undefined ? "" : JSON.stringify(json));
    };
    const body = await readBody(req);
    if (body === null) {
      send(413, { error: "too_large" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://server");
    const request: ApiRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      search: url.search,
      authorization: req.headers.authorization,
      body,
      ip: callerAddress(req, config.behindProxy),
    };
    const response = await handle(request);
    send(response.status, response.json);
  }

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

/**
 * The body as text, or null if it passes MAX_BODY_BYTES. Past the limit the rest is
 * read and dropped rather than cut off, so the caller still gets the 413 answer
 * (Caddy also caps body size in front of the server).
 */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(
        size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString("utf8"),
      );
    });
    req.on("error", reject);
  });
}

/** The caller's address: Caddy's last X-Forwarded-For entry when behind it. */
function callerAddress(req: IncomingMessage, behindProxy: boolean): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (behindProxy && typeof forwarded === "string") {
    const last = forwarded.split(",").at(-1)?.trim();
    if (last !== undefined && last !== "") return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}
