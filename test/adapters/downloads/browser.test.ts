// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createBrowserFileSaver } from "../../../src/adapters/downloads/browser";

describe("browser download (#64)", () => {
  it("offers the file with its name and frees the temporary address", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      created.push("blob:x");
      return "blob:x";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((u) => {
      revoked.push(u);
    });
    const clicks: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ download: this.download, href: this.href });
    });
    const outcome = await createBrowserFileSaver(document).save(
      "tasks.csv",
      "a,b\n",
    );
    expect(outcome).toBe("saved");
    expect(clicks).toEqual([{ download: "tasks.csv", href: "blob:x" }]);
    expect(revoked).toEqual(["blob:x"]);
    expect(document.querySelector("a[download]")).toBeNull();
    vi.restoreAllMocks();
  });

  it("reports a failure instead of throwing", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("no blobs");
    });
    expect(await createBrowserFileSaver(document).save("x.csv", "")).toBe(
      "failed",
    );
    vi.restoreAllMocks();
  });
});
