/// <reference types="node" />
// The real disk for the store and the accounts file (ADR 0003). Files are written to a
// temporary file in the same folder, then renamed over the old one: a rename on the
// same disk is one step, so a crash leaves either the old file or the new one.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  emptyAccounts,
  parseAccountsFile,
  type AccountsFile,
} from "./accounts";
import type { Files } from "./store";

/** Files on disk, readable and writable by the server's own user only. */
export function diskFiles(): Files {
  return {
    async read(path) {
      try {
        return await readFile(path, "utf8");
      } catch (error: unknown) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async writeWhole(path, text) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temp, text, { encoding: "utf8", mode: 0o600 });
      await rename(temp, path);
    },
  };
}

/** Reads and writes `accounts.json` in the data folder. A missing file means no accounts. */
export function accountsOnDisk(files: Files, dataDir: string) {
  const path = join(dataDir, "accounts.json");
  return {
    async read(): Promise<AccountsFile> {
      const text = await files.read(path);
      return text === null
        ? emptyAccounts()
        : parseAccountsFile(JSON.parse(text));
    },
    write(file: AccountsFile): Promise<void> {
      return files.writeWhole(path, JSON.stringify(file, null, 2));
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
