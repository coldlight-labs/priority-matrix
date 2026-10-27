// The account command, run by the owner over SSH on the VPS (ADR 0003): create, list and
// revoke accounts. There is no admin page on the web. A new link is printed once and
// never stored; only its key's hash is kept. cli.ts connects this to the disk.

import { starterLabels, type Label } from "../src/core";
import {
  createAccount,
  hashKey,
  newAccountId,
  newKey,
  revokeAccount,
  type AccountsFile,
} from "./accounts";

/** What the command needs. */
export interface AdminDeps {
  readonly readAccounts: () => Promise<AccountsFile>;
  readonly writeAccounts: (file: AccountsFile) => Promise<void>;
  /** Stores labels in a new account's data file (the starter labels, #64). */
  readonly addLabels: (
    accountId: string,
    labels: readonly Label[],
  ) => Promise<void>;
  readonly now: () => Date;
  /** The site address links start with, for example https://matrix.example.com. */
  readonly baseUrl: string;
}

/** The command's output and exit code. */
export interface AdminOutput {
  readonly code: number;
  readonly text: string;
}

const USAGE = [
  "Usage:",
  "  create <name> [--empty]   new account with starter labels (--empty: none);",
  "                            prints its link once",
  "  list            accounts, created and revoked dates",
  "  revoke <name>   turn an account's link off",
  "Names: 1 to 32 lowercase letters, digits or dashes.",
].join("\n");

/** Runs one command, for example ["create", "tester-a"]. */
export async function runAdmin(
  args: readonly string[],
  deps: AdminDeps,
): Promise<AdminOutput> {
  const [command, name] = args;
  if (command === "list" && args.length === 1) {
    const file = await deps.readAccounts();
    if (file.accounts.length === 0)
      return { code: 0, text: "No accounts yet." };
    const lines = file.accounts.map(
      (a) =>
        `${a.name}  created ${a.createdAt.slice(0, 10)}  ${
          a.revokedAt === null
            ? "active"
            : `revoked ${a.revokedAt.slice(0, 10)}`
        }`,
    );
    return { code: 0, text: lines.join("\n") };
  }
  const empty = args[2] === "--empty";
  if (
    command === "create" &&
    name !== undefined &&
    (args.length === 2 || (args.length === 3 && empty))
  ) {
    const key = newKey();
    const id = newAccountId();
    const result = createAccount(await deps.readAccounts(), {
      name,
      id,
      keyHash: await hashKey(key),
      now: deps.now(),
    });
    if (!result.ok) return { code: 1, text: messageOf(result.errors) };
    // Labels first: a failure here leaves no account behind with a half-made start.
    if (!empty) {
      await deps.addLabels(
        id,
        starterLabels(deps.now(), () => crypto.randomUUID()),
      );
    }
    await deps.writeAccounts(result.value);
    return {
      code: 0,
      text: [
        `Created ${name}. Send this link privately; it is shown only once:`,
        `${deps.baseUrl}/#key=${key}`,
      ].join("\n"),
    };
  }
  if (command === "revoke" && name !== undefined && args.length === 2) {
    const result = revokeAccount(await deps.readAccounts(), name, deps.now());
    if (!result.ok) return { code: 1, text: messageOf(result.errors) };
    await deps.writeAccounts(result.value);
    return {
      code: 0,
      text: `Revoked ${name}. Their link no longer works; their data stays until deleted.`,
    };
  }
  return { code: 1, text: USAGE };
}

function messageOf(errors: readonly { message: string }[]): string {
  return errors[0]?.message ?? "Refused.";
}
