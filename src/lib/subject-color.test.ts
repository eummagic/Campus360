import { describe, expect, it } from "vitest";
import { getSubjectColorIndex } from "./subject-color";

describe("getSubjectColorIndex", () => {
  it("returns the same palette index regardless of code casing or surrounding spaces", () => {
    expect(getSubjectColorIndex(" PCITT501 ")).toBe(getSubjectColorIndex("pcitt501"));
  });

  it("always selects one of the available subject accents", () => {
    for (const code of ["", "ML", "PCITT502", "PBITT504WAD", "🎓"]) {
      expect(getSubjectColorIndex(code)).toBeGreaterThanOrEqual(0);
      expect(getSubjectColorIndex(code)).toBeLessThan(8);
    }
  });
});
