/// <reference types="node" />
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAdmin } from "../../server/admin";
import { accountsOnDisk, diskFiles } from "../../server/disk";
import { startServer, type RunningServer } from "../../server/http";

const T0 = "2026-10-27T08:00:00.000Z";

/** A real server on a free port, with a fresh data folder and two accounts. */
let dataDir = "";
let server: RunningServer;
const keys: Record<string, string> = {};

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "pm-server-"));
  const accounts = accountsOnDisk(diskFiles(), dataDir);
  for (const name of ["owner", "tester"]) {
    const out = await runAdmin(["create", name], {
      readAccounts: () => accounts.read(),
      writeAccounts: (file) => accounts.write(file),
      addLabels: () => Promise.resolve(),
      now: () => new Date(T0),
      baseUrl: "https://matrix.example.com",
    });
    keys[name] = /#key=([A-Za-z0-9_-]+)/.exec(out.text)?.[1] ?? "";
  }
  server = await startServer({
    port: 0,
    dataDir,
    baseUrl: "https://matrix.example.com",
    behindProxy: false,
  });
});

afterAll(async () => {
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
});

function api(who: string, path: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${String(server.port)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${keys[who] ?? who}` },
  });
}

const aTask = {
  id: "t1",
  text: "Call the plumber",
  importance: 60,
  labelId: "l1",
  date: null,
  time: null,
  followUp: false,
  status: "open",
  createdAt: T0,
  updatedAt: T0,
  today: null,
  schemaVersion: 4,
};

describe("server end to end (#62)", () => {
  it("saves a task for one account, on disk, invisible to the other", async () => {
    const put = await api("owner", "/api/tasks/t1", {
      method: "PUT",
      body: JSON.stringify(aTask),
    });
    expect(put.status).toBe(200);
    expect(put.headers.get("cache-control")).toBe("no-store");

    const mine = (await (await api("owner", "/api/data")).json()) as {
      tasks: unknown[];
    };
    expect(mine.tasks).toEqual([aTask]);
    const theirs = (await (await api("tester", "/api/data")).json()) as {
      tasks: unknown[];
    };
    expect(theirs.tasks).toEqual([]);

    const files = await readdir(join(dataDir, "accounts"));
    expect(files).toHaveLength(1);
    const onDisk = await readFile(
      join(dataDir, "accounts", files[0] ?? ""),
      "utf8",
    );
    expect(JSON.parse(onDisk)).toMatchObject({ revision: 1 });
  });

  it("keeps data and accounts files private to the server's user", async () => {
    const accountsFile = await stat(join(dataDir, "accounts.json"));
    expect(accountsFile.mode & 0o077).toBe(0);
    const accountsText = await readFile(join(dataDir, "accounts.json"), "utf8");
    expect(accountsText).not.toContain(keys.owner);
  });

  it("refuses a wrong key and an oversized body", async () => {
    expect((await api("nope", "/api/data")).status).toBe(401);
    const big = await api("owner", "/api/tasks/t1", {
      method: "PUT",
      body: "x".repeat(70 * 1024),
    });
    expect(big.status).toBe(413);
  });

  it("keeps running when a caller cuts an upload short (found in the local Docker run)", async () => {
    await new Promise<void>((done) => {
      const socket = connect(server.port, "127.0.0.1", () => {
        socket.write(
          "PUT /api/tasks/t1 HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\n\r\nabc",
        );
        setTimeout(() => {
          socket.destroy();
          done();
        }, 50);
      });
    });
    await new Promise((r) => setTimeout(r, 100));
    expect((await api("owner", "/api/data")).status).toBe(200);
  });
});
