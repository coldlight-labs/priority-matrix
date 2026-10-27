import { describe, expect, it } from "vitest";
import {
  emptyAccounts,
  findAccount,
  type AccountsFile,
} from "../../server/accounts";
import { runAdmin } from "../../server/admin";

const NOW = new Date("2026-10-27T09:00:00.000Z");

function setup() {
  let file: AccountsFile = emptyAccounts();
  const added = new Map<string, string[]>();
  const run = (...args: string[]) =>
    runAdmin(args, {
      readAccounts: () => Promise.resolve(file),
      writeAccounts: (next) => {
        file = next;
        return Promise.resolve();
      },
      addLabels: (accountId, list) => {
        added.set(
          accountId,
          list.map((l) => l.name),
        );
        return Promise.resolve();
      },
      now: () => NOW,
      baseUrl: "https://matrix.example.com",
    });
  return { run, file: () => file, added };
}

describe("account command (#62)", () => {
  it("creates an account and prints its link once", async () => {
    const { run, file } = setup();
    const out = await run("create", "tester-a");
    expect(out.code).toBe(0);
    const link =
      /https:\/\/matrix\.example\.com\/#key=([A-Za-z0-9_-]{43})/.exec(out.text);
    expect(link).not.toBeNull();
    expect((await findAccount(file(), link?.[1] ?? ""))?.name).toBe("tester-a");
  });

  it("lists accounts with dates, never keys or hashes", async () => {
    const { run, file } = setup();
    await run("create", "owner");
    const out = await run("list");
    expect(out.text).toContain("owner");
    expect(out.text).toContain("2026-10-27");
    expect(out.text).not.toContain(file().accounts[0]?.keyHash ?? "x");
  });

  it("revokes an account so its link stops working", async () => {
    const { run, file } = setup();
    const created = await run("create", "tester-b");
    const key = /#key=([A-Za-z0-9_-]+)/.exec(created.text)?.[1] ?? "";
    expect((await run("revoke", "tester-b")).code).toBe(0);
    expect(await findAccount(file(), key)).toBeUndefined();
    expect((await run("list")).text).toContain("revoked");
  });

  it("explains bad input and changes nothing", async () => {
    const { run, file } = setup();
    expect((await run("create", "Bad Name")).code).toBe(1);
    expect((await run("revoke", "nobody")).code).toBe(1);
    expect((await run("nonsense")).code).toBe(1);
    expect((await run()).text).toContain("Usage");
    expect(file().accounts).toEqual([]);
  });

  it("gives a new account the starter labels (#64)", async () => {
    const { run, file, added } = setup();
    await run("create", "tester-a");
    const id = file().accounts[0]?.id ?? "";
    expect(added.get(id)).toEqual([
      "Work",
      "Home",
      "Personal",
      "Health",
      "Money",
    ]);
  });

  it("creates an empty account with --empty (the owner's, before the import)", async () => {
    const { run, file, added } = setup();
    expect((await run("create", "owner", "--empty")).code).toBe(0);
    expect(file().accounts).toHaveLength(1);
    expect(added.size).toBe(0);
  });
});
