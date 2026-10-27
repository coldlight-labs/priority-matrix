import { describe, expect, it } from "vitest";
import {
  createAccount,
  emptyAccounts,
  findAccount,
  hashKey,
  newAccountId,
  newKey,
  parseAccountsFile,
  revokeAccount,
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
  });

  it("makes server account ids of 32 hex characters", () => {
    expect(newAccountId()).toMatch(/^[0-9a-f]{32}$/);
  });
});
