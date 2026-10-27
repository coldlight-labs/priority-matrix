// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { dateFields, scoreSlider } from "../../src/ui";

const IDS = { date: "d", time: "t", followUp: "f" } as const;

describe("dateFields (#58)", () => {
  it("builds date, time and follow-up controls with the given ids", () => {
    const parts = dateFields(IDS);
    expect([parts.date.type, parts.time.type, parts.followUp.type]).toEqual([
      "date",
      "time",
      "checkbox",
    ]);
    expect([parts.date.id, parts.time.id, parts.followUp.id]).toEqual([
      "d",
      "t",
      "f",
    ]);
    expect(parts.followUpWrap.className).toBe("follow-up");
    expect(parts.followUpWrap.querySelector("label")?.htmlFor).toBe("f");
    expect(parts.followUpWrap.textContent).toBe(
      "Follow-up date (not a firm deadline)",
    );
  });

  it("keeps time and follow-up off until a date is picked", () => {
    const parts = dateFields(IDS);
    expect(parts.time.disabled).toBe(true);
    expect(parts.followUp.disabled).toBe(true);
    parts.date.value = "2026-10-30";
    parts.date.dispatchEvent(new Event("input"));
    expect(parts.time.disabled).toBe(false);
    expect(parts.followUp.disabled).toBe(false);
  });

  it("clears time and follow-up when the date is cleared", () => {
    const parts = dateFields(IDS, {
      date: "2026-10-30",
      time: "10:30",
      followUp: true,
    });
    expect(parts.time.value).toBe("10:30");
    expect(parts.followUp.checked).toBe(true);
    parts.date.value = "";
    parts.date.dispatchEvent(new Event("change"));
    expect(parts.time.value).toBe("");
    expect(parts.followUp.checked).toBe(false);
    expect(parts.time.disabled).toBe(true);
  });

  it("re-checks after a value is set from code (a reset)", () => {
    const parts = dateFields(IDS, {
      date: "2026-10-30",
      time: "",
      followUp: false,
    });
    parts.date.value = "";
    parts.sync();
    expect(parts.time.disabled).toBe(true);
  });
});

describe("scoreSlider (#58)", () => {
  it("is a 0 to 100 range showing its value next to it", () => {
    const s = scoreSlider("imp", 70);
    expect(s.wrap.className).toBe("slider");
    expect([s.input.type, s.input.min, s.input.max, s.input.step]).toEqual([
      "range",
      "0",
      "100",
      "1",
    ]);
    const shown = s.wrap.querySelector("output");
    expect(shown?.getAttribute("for")).toBe("imp");
    expect(shown?.textContent).toBe("70");
  });

  it("updates the shown value while sliding, and on set", () => {
    const s = scoreSlider("imp", 50);
    s.input.value = "83";
    s.input.dispatchEvent(new Event("input"));
    expect(s.wrap.querySelector("output")?.textContent).toBe("83");
    s.set(50);
    expect(s.input.value).toBe("50");
    expect(s.wrap.querySelector("output")?.textContent).toBe("50");
  });
});
