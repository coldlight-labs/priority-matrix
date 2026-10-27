/// <reference types="node" />
// Local testing only (#64): writes a fresh .dev-data folder with the two made-up test
// accounts in dev/dev-accounts.json, in the format server/accounts.ts reads. Run by
// `npm run dev:server` (Node runs this file directly); never used on the VPS.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

interface DevAccount {
  readonly name: string;
  readonly key: string;
}

const dir = ".dev-data";
const fixture = JSON.parse(readFileSync("dev/dev-accounts.json", "utf8")) as {
  accounts: DevAccount[];
};
rmSync(dir, { recursive: true, force: true });
mkdirSync(`${dir}/accounts`, { recursive: true });
const file = {
  version: 1,
  accounts: fixture.accounts.map((a) => ({
    id: randomBytes(16).toString("hex"),
    name: a.name,
    keyHash: createHash("sha256").update(a.key).digest("hex"),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  })),
};
writeFileSync(`${dir}/accounts.json`, JSON.stringify(file, null, 2));
console.log(`Wrote ${dir} with ${String(file.accounts.length)} test accounts.`);
