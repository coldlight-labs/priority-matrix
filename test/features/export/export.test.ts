import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import type { FileSaver, Label, SaveOutcome, Task } from "../../../src/core";
import {
  buildCsv,
  buildJson,
  csvCell,
  exportFile,
  exportFilenames,
  exportMessage,
} from "../../../src/features/export";

const NOW = new Date("2026-10-23T09:00:00.000Z");
const STAMP = NOW.toISOString();
const BOM = "﻿";

const JOBS: Label = {
  id: "l1",
  name: "Jobs",
  archived: false,
  color: "teal",
  createdAt: STAMP,
  updatedAt: STAMP,
  schemaVersion: 2,
};
const OLD: Label = { ...JOBS, id: "l2", name: "Old, closed", archived: true };

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    text: "Send invoice",
    importance: 60,
    labelId: "l1",
    // Exactly 7 days after NOW (20:00 in Sydney), so urgency 50.
    date: "2026-10-30",
    time: "20:00",
    followUp: false,
    status: "open",
    createdAt: STAMP,
    updatedAt: STAMP,
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

describe("csvCell", () => {
  it.each([
    ["plain", "plain"],
    [42, "42"],
    ["=SUM(A1:A9)", "'=SUM(A1:A9)"],
    ["+1 call", "'+1 call"],
    ["-call mom", "'-call mom"],
    ["@client", "'@client"],
    ["\tindented", "'\tindented"],
    ["\rreturn", '"\'\rreturn"'],
    ["a, b", '"a, b"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
    ['=HYPERLINK("x")', '"\'=HYPERLINK(""x"")"'],
  ] as const)("%j -> %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});

describe("buildCsv", () => {
  it("writes a header and one row per task with label name and quadrant", () => {
    const csv = buildCsv(
      [
        task({}),
        task({
          id: "t2",
          text: "=1+1",
          date: null,
          time: null,
          importance: 90,
        }),
        task({
          id: "t3",
          labelId: "l2",
          status: "done",
          followUp: true,
          today: "2026-10-23",
        }),
        task({ id: "t4", labelId: "gone" }),
      ],
      [JOBS, OLD],
      NOW,
    );
    expect(csv).toBe(
      BOM +
        [
          "id,text,label,date,time,followUp,today,urgency,importance,quadrant,status,createdAt,updatedAt",
          `t1,Send invoice,Jobs,2026-10-30,20:00,no,,50,60,Do now,open,${STAMP},${STAMP}`,
          `t2,'=1+1,Jobs,,,no,,0,90,Make time,open,${STAMP},${STAMP}`,
          `t3,Send invoice,"Old, closed",2026-10-30,20:00,yes,2026-10-23,50,60,Do now,done,${STAMP},${STAMP}`,
          `t4,Send invoice,,2026-10-30,20:00,no,,50,60,Do now,open,${STAMP},${STAMP}`,
        ].join("\r\n") +
        "\r\n",
    );
  });

  it("writes only the header when there are no tasks", () => {
    expect(buildCsv([], [JOBS], NOW)).toBe(
      `${BOM}id,text,label,date,time,followUp,today,urgency,importance,quadrant,status,createdAt,updatedAt\r\n`,
    );
  });
});

describe("buildJson", () => {
  it("includes export time, schema versions, labels and stored tasks", () => {
    expect(JSON.parse(buildJson([task({})], [JOBS], NOW))).toEqual({
      exportedAt: STAMP,
      schemaVersions: { labels: 2, tasks: 4 },
      labels: [JOBS],
      tasks: [task({})],
    });
  });
});

describe("exportFilenames", () => {
  it("uses the viewer's local date", () => {
    expect(exportFilenames(new Date(2026, 0, 5, 23, 30))).toEqual({
      json: "priority-matrix-2026-01-05.json",
      csv: "priority-matrix-2026-01-05.csv",
    });
  });
});

function recordingSaver(outcomes: SaveOutcome[]) {
  const files: string[] = [];
  const saver: FileSaver = {
    save(filename) {
      files.push(filename);
      return Promise.resolve(outcomes.shift() ?? "saved");
    },
  };
  return { saver, files };
}

async function seeded() {
  const repos = createMemoryRepositories();
  await repos.labels.save(JOBS);
  await repos.tasks.save(task({}));
  return repos;
}

describe("exportFile (#40)", () => {
  it("offers only the CSV file for an export", async () => {
    const { saver, files } = recordingSaver([]);
    const result = await exportFile("csv", {
      ...(await seeded()),
      saver,
      now: NOW,
    });
    expect(result).toBe("saved");
    expect(files).toEqual([exportFilenames(NOW).csv]);
  });

  it("offers only the JSON file for a full backup", async () => {
    const { saver, files } = recordingSaver([]);
    await exportFile("json", { ...(await seeded()), saver, now: NOW });
    expect(files).toEqual([exportFilenames(NOW).json]);
  });

  it("passes on what the viewer did", async () => {
    const { saver } = recordingSaver(["declined"]);
    expect(
      await exportFile("csv", { ...(await seeded()), saver, now: NOW }),
    ).toBe("declined");
  });
});

describe("exportMessage (#40)", () => {
  it.each([
    ["csv", "saved", "Saved the CSV."],
    ["json", "saved", "Saved the full backup (JSON)."],
    ["csv", "declined", "Export cancelled."],
    ["json", "failed", "Couldn't save the file. Try again in a moment."],
    ["csv", "unavailable", "Saving files isn't available here."],
  ] as const)("%s %s -> %j", (kind, outcome, message) => {
    expect(exportMessage(kind, outcome)).toBe(message);
  });
});
