/// <reference types="node" />
// Account command entry (ADR 0003), run on the VPS, for example:
//   docker compose exec server node cli.js create tester-a

import { runAdmin } from "./admin";
import { readConfig } from "./config";
import { accountsOnDisk, diskFiles } from "./disk";
import { createStore } from "./store";

const config = readConfig(process.env);
const files = diskFiles();
const accounts = accountsOnDisk(files, config.dataDir);
const store = createStore(files, config.dataDir);
const output = await runAdmin(process.argv.slice(2), {
  readAccounts: () => accounts.read(),
  writeAccounts: (file) => accounts.write(file),
  addLabels: (accountId, labels) =>
    store.update(accountId, (data) => {
      for (const label of labels) data.labels[label.id] = label;
      return { changed: labels.length > 0, value: undefined };
    }),
  now: () => new Date(),
  baseUrl: config.baseUrl,
});
console.log(output.text);
process.exitCode = output.code;
