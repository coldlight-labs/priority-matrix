import { describe, expect, it } from "vitest";
import { createFileSaver } from "../../../src/adapters/downloads/downloads";
import type { DownloadsNamespace } from "../../../src/adapters/runtime";

/** Stand-in for the runtime's downloads namespace (contract 0.2.89). */
function fakeDownloads(failCode?: string) {
  const saved: { filename: string; data: string }[] = [];
  const downloads: DownloadsNamespace = {
    save(request) {
      if (failCode !== undefined) {
        return Promise.reject(
          Object.assign(new Error("no"), { code: failCode }),
        );
      }
      saved.push(request);
      return Promise.resolve({ status: "saved" });
    },
  };
  return { downloads, saved };
}

describe("createFileSaver", () => {
  it("passes the file to the runtime and reports saved", async () => {
    const { downloads, saved } = fakeDownloads();
    const saver = createFileSaver(downloads);
    expect(await saver.save("a.json", "{}")).toBe("saved");
    expect(saved).toEqual([{ filename: "a.json", data: "{}" }]);
  });

  it("reports unavailable when the capability is missing", async () => {
    expect(await createFileSaver(null).save("a.json", "{}")).toBe(
      "unavailable",
    );
  });

  it("reports declined when the viewer says no", async () => {
    const saver = createFileSaver(fakeDownloads("declined").downloads);
    expect(await saver.save("a.json", "{}")).toBe("declined");
  });

  it.each(["unavailable", "not_granted", "capability_disabled"])(
    "reports unavailable for %s",
    async (code) => {
      const saver = createFileSaver(fakeDownloads(code).downloads);
      expect(await saver.save("a.json", "{}")).toBe("unavailable");
    },
  );

  it.each(["rate_limited", "bad_request", "rejected_extension", "new_code"])(
    "reports failed and logs the code for %s",
    async (code) => {
      const warnings: string[] = [];
      const saver = createFileSaver(fakeDownloads(code).downloads, (m) =>
        warnings.push(m),
      );
      expect(await saver.save("a.csv", "x")).toBe("failed");
      expect(warnings).toEqual([`Saving a.csv failed: ${code}.`]);
    },
  );
});
