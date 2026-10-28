// Accounts and their secret keys (ADR 0003). A key is 32 random bytes, sent by the app
// as a bearer token; only its SHA-256 hash is stored. An account is found from the key
// alone, never from anything else in a request. Uses Web Crypto, built into Node 24.

import type { Result } from "../src/core";

/** One account. `name` is for the owner only (the account command); `id` names its data file. */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly keyHash: string;
  readonly readOnlyKeys?: readonly ReadOnlyKey[];
  readonly taskWriterKeys?: readonly TaskWriterKey[];
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** A separately revocable bearer key that can read, but never change, one account. */
export interface ReadOnlyKey {
  readonly id: string;
  readonly keyHash: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** A separately revocable bearer key that can create and checked-update tasks only. */
export interface TaskWriterKey {
  readonly id: string;
  readonly keyHash: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface AccountCredential {
  readonly account: Account;
  readonly access: "full" | "read-only" | "task-writer";
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

/** A new identifier for a read-only key, as 32 lowercase hexadecimal characters. */
export function newReadOnlyKeyId(): string {
  return hex(crypto.getRandomValues(new Uint8Array(ID_BYTES)));
}

/** A new identifier for a task-writer key, as 32 lowercase hexadecimal characters. */
export function newTaskWriterKeyId(): string {
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

/** Finds the active account and access level for a key, checking every account. */
export async function findCredential(
  file: AccountsFile,
  key: string,
): Promise<AccountCredential | undefined> {
  if (key === "") return undefined;
  const hash = await hashKey(key);
  let found: AccountCredential | undefined;
  for (const account of file.accounts) {
    if (account.revokedAt !== null) continue;
    if (sameHash(account.keyHash, hash)) {
      found = { account, access: "full" };
    }
    for (const readOnlyKey of account.readOnlyKeys ?? []) {
      if (
        readOnlyKey.revokedAt === null &&
        sameHash(readOnlyKey.keyHash, hash)
      ) {
        found = { account, access: "read-only" };
      }
    }
    for (const taskWriterKey of account.taskWriterKeys ?? []) {
      if (
        taskWriterKey.revokedAt === null &&
        sameHash(taskWriterKey.keyHash, hash)
      ) {
        found = { account, access: "task-writer" };
      }
    }
  }
  return found;
}

/** Adds a separately revocable task-writer key to an active account. */
export function createTaskWriterKey(
  file: AccountsFile,
  input: { name: string; id: string; keyHash: string; now: Date },
): Result<AccountsFile> {
  const account = file.accounts.find(
    (candidate) =>
      candidate.name === input.name && candidate.revokedAt === null,
  );
  if (account === undefined) {
    return {
      ok: false,
      errors: [{ field: "name", message: "No active account has this name." }],
    };
  }
  const taskWriterKeys = account.taskWriterKeys ?? [];
  if (taskWriterKeys.some((candidate) => candidate.id === input.id)) {
    return {
      ok: false,
      errors: [{ field: "id", message: "Refused." }],
    };
  }
  const updatedAccount: Account = {
    ...account,
    taskWriterKeys: [
      ...taskWriterKeys,
      {
        id: input.id,
        keyHash: input.keyHash,
        createdAt: input.now.toISOString(),
        revokedAt: null,
      },
    ],
  };
  return {
    ok: true,
    value: {
      ...file,
      accounts: file.accounts.map((candidate) =>
        candidate.id === account.id ? updatedAccount : candidate,
      ),
    },
  };
}

/** Revokes one task-writer key. Repeating a successful revoke is harmless. */
export function revokeTaskWriterKey(
  file: AccountsFile,
  name: string,
  keyId: string,
  now: Date,
): Result<AccountsFile> {
  const account = file.accounts.find(
    (candidate) => candidate.name === name && candidate.revokedAt === null,
  );
  if (account === undefined) {
    return {
      ok: false,
      errors: [{ field: "name", message: "No active account has this name." }],
    };
  }
  const keys = account.taskWriterKeys ?? [];
  const key = keys.find((candidate) => candidate.id === keyId);
  if (key === undefined) {
    return {
      ok: false,
      errors: [{ field: "keyId", message: "No task-writer key has this id." }],
    };
  }
  if (key.revokedAt !== null) return { ok: true, value: file };
  const updatedAccount: Account = {
    ...account,
    taskWriterKeys: keys.map((candidate) =>
      candidate.id === keyId
        ? { ...candidate, revokedAt: now.toISOString() }
        : candidate,
    ),
  };
  return {
    ok: true,
    value: {
      ...file,
      accounts: file.accounts.map((candidate) =>
        candidate.id === account.id ? updatedAccount : candidate,
      ),
    },
  };
}

/** The active account for any of its keys, or undefined. */
export async function findAccount(
  file: AccountsFile,
  key: string,
): Promise<Account | undefined> {
  return (await findCredential(file, key))?.account;
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

/** Adds a separately revocable read-only key to an active account. */
export function createReadOnlyKey(
  file: AccountsFile,
  input: { name: string; id: string; keyHash: string; now: Date },
): Result<AccountsFile> {
  const account = file.accounts.find(
    (candidate) =>
      candidate.name === input.name && candidate.revokedAt === null,
  );
  if (account === undefined) {
    return {
      ok: false,
      errors: [{ field: "name", message: "No active account has this name." }],
    };
  }
  const readOnlyKeys = account.readOnlyKeys ?? [];
  if (readOnlyKeys.some((candidate) => candidate.id === input.id)) {
    return {
      ok: false,
      errors: [{ field: "id", message: "Refused." }],
    };
  }
  const updatedAccount: Account = {
    ...account,
    readOnlyKeys: [
      ...readOnlyKeys,
      {
        id: input.id,
        keyHash: input.keyHash,
        createdAt: input.now.toISOString(),
        revokedAt: null,
      },
    ],
  };
  return {
    ok: true,
    value: {
      ...file,
      accounts: file.accounts.map((candidate) =>
        candidate.id === account.id ? updatedAccount : candidate,
      ),
    },
  };
}

/** Revokes one read-only key. Repeating a successful revoke is harmless. */
export function revokeReadOnlyKey(
  file: AccountsFile,
  name: string,
  keyId: string,
  now: Date,
): Result<AccountsFile> {
  const account = file.accounts.find(
    (candidate) => candidate.name === name && candidate.revokedAt === null,
  );
  if (account === undefined) {
    return {
      ok: false,
      errors: [{ field: "name", message: "No active account has this name." }],
    };
  }
  const keys = account.readOnlyKeys ?? [];
  const key = keys.find((candidate) => candidate.id === keyId);
  if (key === undefined) {
    return {
      ok: false,
      errors: [{ field: "keyId", message: "No read-only key has this id." }],
    };
  }
  if (key.revokedAt !== null) return { ok: true, value: file };
  const updatedAccount: Account = {
    ...account,
    readOnlyKeys: keys.map((candidate) =>
      candidate.id === keyId
        ? { ...candidate, revokedAt: now.toISOString() }
        : candidate,
    ),
  };
  return {
    ok: true,
    value: {
      ...file,
      accounts: file.accounts.map((candidate) =>
        candidate.id === account.id ? updatedAccount : candidate,
      ),
    },
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
    const readOnlyKeys = parseReadOnlyKeys(a.readOnlyKeys);
    const taskWriterKeys = parseTaskWriterKeys(a.taskWriterKeys);
    return {
      id: a.id,
      name: a.name,
      keyHash: a.keyHash,
      ...(readOnlyKeys === undefined ? {} : { readOnlyKeys }),
      ...(taskWriterKeys === undefined ? {} : { taskWriterKeys }),
      createdAt: a.createdAt,
      revokedAt: a.revokedAt,
    };
  });
  return { version: 1, accounts };
}

function parseTaskWriterKeys(
  value: unknown,
): readonly TaskWriterKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("Accounts file has malformed task-writer keys.");
  }
  return value.map((key: unknown): TaskWriterKey => {
    if (
      !isRecord(key) ||
      typeof key.id !== "string" ||
      !ID_PATTERN.test(key.id) ||
      typeof key.keyHash !== "string" ||
      !HASH_PATTERN.test(key.keyHash) ||
      typeof key.createdAt !== "string" ||
      !(key.revokedAt === null || typeof key.revokedAt === "string")
    ) {
      throw new Error("Accounts file has a malformed task-writer key.");
    }
    return {
      id: key.id,
      keyHash: key.keyHash,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
    };
  });
}

function parseReadOnlyKeys(value: unknown): readonly ReadOnlyKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("Accounts file has malformed read-only keys.");
  }
  return value.map((key: unknown): ReadOnlyKey => {
    if (
      !isRecord(key) ||
      typeof key.id !== "string" ||
      !ID_PATTERN.test(key.id) ||
      typeof key.keyHash !== "string" ||
      !HASH_PATTERN.test(key.keyHash) ||
      typeof key.createdAt !== "string" ||
      !(key.revokedAt === null || typeof key.revokedAt === "string")
    ) {
      throw new Error("Accounts file has a malformed read-only key.");
    }
    return {
      id: key.id,
      keyHash: key.keyHash,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
    };
  });
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
