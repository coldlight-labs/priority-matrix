import { describe, expect, it } from "vitest";
import {
  createAccount,
  createReadOnlyKey,
  createTaskWriterKey,
  emptyAccounts,
  findAccount,
  findCredential,
  hashKey,
  newAccountId,
  newKey,
  newReadOnlyKeyId,
  newTaskWriterKeyId,
  parseAccountsFile,
  revokeAccount,
  revokeReadOnlyKey,
  revokeTaskWriterKey,
  sameHash,
} from "../../server/accounts";

const NOW = new Date("2026-10-27T09:00:00.000Z");

async function withAccount(name: string) {
  const key = newKey();
  const result = createAccount(emptyAccounts(), {
    name,
    id: newAccountId(),
    keyHash: await hashKey(key),
    now: NOW,
  });
  if (!result.ok) throw new Error("setup");
  return { key, file: result.value };
}

describe("account keys (#62)", () => {
  it("makes long random keys that are safe in a URL", () => {
    const a = newKey();
    const b = newKey();
    expect(a).not.toBe(b);
    // 32 bytes in base64url: 43 characters, no padding.
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores a SHA-256 hash, never the key", async () => {
    const { key, file } = await withAccount("owner");
    const stored = JSON.stringify(file);
    expect(stored).not.toContain(key);
    expect(file.accounts[0]?.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compares hashes of equal length, and refuses different lengths", () => {
    expect(sameHash("ab12", "ab12")).toBe(true);
    expect(sameHash("ab12", "ab13")).toBe(false);
    expect(sameHash("ab12", "ab1")).toBe(false);
  });
});

describe("finding an account by key (#62)", () => {
  it("finds the account for its key, and nothing for another key", async () => {
    const { key, file } = await withAccount("owner");
    expect((await findAccount(file, key))?.name).toBe("owner");
    expect(await findAccount(file, newKey())).toBeUndefined();
    expect(await findAccount(file, "")).toBeUndefined();
  });

  it("stops finding a revoked account at once", async () => {
    const { key, file } = await withAccount("tester-a");
    const revoked = revokeAccount(file, "tester-a", NOW);
    if (!revoked.ok) throw new Error("revoke");
    expect(await findAccount(revoked.value, key)).toBeUndefined();
  });
});

describe("task-writer keys (#9)", () => {
  it("stores only the hash and finds the account with task-write access", async () => {
    const { file } = await withAccount("owner");
    const key = newKey();
    const id = newTaskWriterKeyId();
    const added = createTaskWriterKey(file, {
      name: "owner",
      id,
      keyHash: await hashKey(key),
      now: NOW,
    });
    if (!added.ok) throw new Error("create task-writer key");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(added.value)).not.toContain(key);
    expect(added.value.accounts[0]?.taskWriterKeys?.[0]?.keyHash).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(await findCredential(added.value, key)).toMatchObject({
      account: { name: "owner" },
      access: "task-writer",
    });
  });

  it("revokes one key idempotently without affecting other account keys", async () => {
    const { key: accountKey, file } = await withAccount("owner");
    const writerKey = newKey();
    const id = newTaskWriterKeyId();
    const added = createTaskWriterKey(file, {
      name: "owner",
      id,
      keyHash: await hashKey(writerKey),
      now: NOW,
    });
    if (!added.ok) throw new Error("create task-writer key");
    const revoked = revokeTaskWriterKey(added.value, "owner", id, NOW);
    if (!revoked.ok) throw new Error("revoke task-writer key");
    expect(await findCredential(revoked.value, writerKey)).toBeUndefined();
    expect((await findCredential(revoked.value, accountKey))?.access).toBe(
      "full",
    );
    expect(revokeTaskWriterKey(revoked.value, "owner", id, NOW)).toEqual({
      ok: true,
      value: revoked.value,
    });
  });

  it("keeps legacy account records valid without either scoped-key list", async () => {
    const { file } = await withAccount("owner");
    expect(parseAccountsFile(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });
});

describe("read-only account keys (#7)", () => {
  it("adds a hashed key scoped to one active account", async () => {
    const { file } = await withAccount("owner");
    const key = newKey();
    const added = createReadOnlyKey(file, {
      name: "owner",
      id: newReadOnlyKeyId(),
      keyHash: await hashKey(key),
      now: NOW,
    });
    if (!added.ok) throw new Error("add read-only key");
    const credential = await findCredential(added.value, key);
    expect(credential).toMatchObject({
      account: { name: "owner" },
      access: "read-only",
    });
    expect(JSON.stringify(added.value)).not.toContain(key);
    expect(added.value.accounts[0]?.readOnlyKeys?.[0]?.keyHash).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(await findAccount(added.value, key)).toMatchObject({
      name: "owner",
    });
  });

  it("preserves legacy account records without read-only keys", async () => {
    const { file } = await withAccount("owner");
    const parsed = parseAccountsFile(JSON.parse(JSON.stringify(file)));
    expect(parsed).toEqual(file);
    expect(parsed.accounts[0]).not.toHaveProperty("readOnlyKeys");
  });

  it("revokes one read-only key without revoking the account's browser key", async () => {
    const { key: fullKey, file } = await withAccount("owner");
    const readOnlyKey = newKey();
    const keyId = newReadOnlyKeyId();
    const added = createReadOnlyKey(file, {
      name: "owner",
      id: keyId,
      keyHash: await hashKey(readOnlyKey),
      now: NOW,
    });
    if (!added.ok) throw new Error("add read-only key");
    const revoked = revokeReadOnlyKey(added.value, "owner", keyId, NOW);
    if (!revoked.ok) throw new Error("revoke read-only key");
    expect(await findCredential(revoked.value, readOnlyKey)).toBeUndefined();
    expect((await findCredential(revoked.value, fullKey))?.access).toBe("full");
    expect(revokeReadOnlyKey(revoked.value, "owner", keyId, NOW)).toEqual({
      ok: true,
      value: revoked.value,
    });
  });

  it("refuses to add a key for a missing or revoked account", async () => {
    const { file } = await withAccount("owner");
    const revoked = revokeAccount(file, "owner", NOW);
    if (!revoked.ok) throw new Error("revoke account");
    const input = {
      name: "owner",
      id: newReadOnlyKeyId(),
      keyHash: await hashKey(newKey()),
      now: NOW,
    };
    expect(createReadOnlyKey(file, { ...input, name: "missing" }).ok).toBe(
      false,
    );
    expect(createReadOnlyKey(revoked.value, input).ok).toBe(false);
  });
});

describe("account names (#62)", () => {
  it("accepts short lowercase names and refuses others", async () => {
    const hash = await hashKey(newKey());
    const make = (name: string) =>
      createAccount(emptyAccounts(), {
        name,
        id: newAccountId(),
        keyHash: hash,
        now: NOW,
      }).ok;
    expect(make("tester-a")).toBe(true);
    expect(make("Tester A")).toBe(false);
    expect(make("")).toBe(false);
    expect(make("a".repeat(33))).toBe(false);
  });

  it("refuses a name an active account already has", async () => {
    const { file } = await withAccount("owner");
    const again = createAccount(file, {
      name: "owner",
      id: newAccountId(),
      keyHash: await hashKey(newKey()),
      now: NOW,
    });
    expect(again.ok).toBe(false);
  });

  it("allows reusing the name of a revoked account (a new link)", async () => {
    const { file } = await withAccount("owner");
    const revoked = revokeAccount(file, "owner", NOW);
    if (!revoked.ok) throw new Error("revoke");
    const again = createAccount(revoked.value, {
      name: "owner",
      id: newAccountId(),
      keyHash: await hashKey(newKey()),
      now: NOW,
    });
    expect(again.ok).toBe(true);
  });

  it("refuses to revoke a name with no active account", () => {
    expect(revokeAccount(emptyAccounts(), "nobody", NOW).ok).toBe(false);
  });
});

describe("the accounts file (#62)", () => {
  it("reads back what was written", async () => {
    const { file } = await withAccount("owner");
    expect(parseAccountsFile(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  it("refuses a malformed file rather than guessing", () => {
    expect(() => parseAccountsFile({ version: 1, accounts: [{}] })).toThrow();
    expect(() => parseAccountsFile("nope")).toThrow();
    expect(() =>
      parseAccountsFile({
        version: 1,
        accounts: [
          {
            id: "0".repeat(32),
            name: "owner",
            keyHash: "0".repeat(64),
            createdAt: NOW.toISOString(),
            revokedAt: null,
            readOnlyKeys: [{ id: "bad", keyHash: "bad" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("makes server account ids of 32 hex characters", () => {
    expect(newAccountId()).toMatch(/^[0-9a-f]{32}$/);
  });
});
