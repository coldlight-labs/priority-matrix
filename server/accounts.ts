// Accounts and their secret keys (ADR 0003). A key is 32 random bytes, sent by the app
// as a bearer token; only its SHA-256 hash is stored. An account is found from the key
// alone, never from anything else in a request. Uses Web Crypto, built into Node 24.

import type { Result } from "../src/core";

/** One account. `name` is for the owner only (the account command); `id` names its data file. */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly keyHash: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** The accounts file, `accounts.json` in the data folder. */
export interface AccountsFile {
  readonly version: 1;
  readonly accounts: readonly Account[];
}

const KEY_BYTES = 32;
const ID_BYTES = 16;
/** Lowercase letters, digits and dashes, 1 to 32 characters (for example "tester-a"). */
const NAME_PATTERN = /^[a-z0-9-]{1,32}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[0-9a-f]{32}$/;

/** An accounts file with no accounts. */
export function emptyAccounts(): AccountsFile {
  return { version: 1, accounts: [] };
}

/** A new secret key, as base64url text (43 characters). */
export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A new account id: 16 random bytes as lowercase hex. */
export function newAccountId(): string {
  return hex(crypto.getRandomValues(new Uint8Array(ID_BYTES)));
}

/** The SHA-256 hash of a key, as lowercase hex. */
export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return hex(new Uint8Array(digest));
}

/**
 * Compares two hashes without stopping at the first difference, so the time taken
 * does not hint at how much of a guess was right.
 */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The active account whose key this is, or undefined. Checks every account. */
export async function findAccount(
  file: AccountsFile,
  key: string,
): Promise<Account | undefined> {
  if (key === "") return undefined;
  const hash = await hashKey(key);
  let found: Account | undefined;
  for (const account of file.accounts) {
    if (sameHash(account.keyHash, hash) && account.revokedAt === null) {
      found = account;
    }
  }
  return found;
}

/** Adds an account. Refused for a malformed name or one an active account has. */
export function createAccount(
  file: AccountsFile,
  input: { name: string; id: string; keyHash: string; now: Date },
): Result<AccountsFile> {
  if (!NAME_PATTERN.test(input.name)) {
    return {
      ok: false,
      errors: [
        {
          field: "name",
          message: "Use 1 to 32 lowercase letters, digits or dashes.",
        },
      ],
    };
  }
  if (active(file).some((a) => a.name === input.name)) {
    return {
      ok: false,
      errors: [{ field: "name", message: "An active account has this name." }],
    };
  }
  const account: Account = {
    id: input.id,
    name: input.name,
    keyHash: input.keyHash,
    createdAt: input.now.toISOString(),
    revokedAt: null,
  };
  return {
    ok: true,
    value: { ...file, accounts: [...file.accounts, account] },
  };
}

/** Turns off the active account with this name; its data file stays until deleted. */
export function revokeAccount(
  file: AccountsFile,
  name: string,
  now: Date,
): Result<AccountsFile> {
  if (!active(file).some((a) => a.name === name)) {
    return {
      ok: false,
      errors: [{ field: "name", message: "No active account has this name." }],
    };
  }
  return {
    ok: true,
    value: {
      ...file,
      accounts: file.accounts.map((a) =>
        a.name === name && a.revokedAt === null
          ? { ...a, revokedAt: now.toISOString() }
          : a,
      ),
    },
  };
}

/** Checks the accounts file read from disk. Throws on anything unexpected. */
export function parseAccountsFile(doc: unknown): AccountsFile {
  if (!isRecord(doc) || doc.version !== 1 || !Array.isArray(doc.accounts)) {
    throw new Error("Accounts file is not version 1.");
  }
  const accounts = doc.accounts.map((a: unknown): Account => {
    if (
      !isRecord(a) ||
      typeof a.id !== "string" ||
      !ID_PATTERN.test(a.id) ||
      typeof a.name !== "string" ||
      !NAME_PATTERN.test(a.name) ||
      typeof a.keyHash !== "string" ||
      !HASH_PATTERN.test(a.keyHash) ||
      typeof a.createdAt !== "string" ||
      !(a.revokedAt === null || typeof a.revokedAt === "string")
    ) {
      throw new Error("Accounts file has a malformed account.");
    }
    return {
      id: a.id,
      name: a.name,
      keyHash: a.keyHash,
      createdAt: a.createdAt,
      revokedAt: a.revokedAt,
    };
  });
  return { version: 1, accounts };
}

function active(file: AccountsFile): readonly Account[] {
  return file.accounts.filter((a) => a.revokedAt === null);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
