import { describe, expect, it } from "vitest";
import { displayNameSchema, updateProfileSchema } from "./profile";

describe("display name validation", () => {
  it("trims whitespace and accepts names up to 120 characters", () => {
    expect(displayNameSchema.parse("  Asha Nair  ")).toBe("Asha Nair");
    expect(displayNameSchema.safeParse("a".repeat(120)).success).toBe(true);
  });

  it("rejects empty and overlong values", () => {
    expect(updateProfileSchema.safeParse({ displayName: "   " }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects non-string form input", () => {
    expect(updateProfileSchema.safeParse({ displayName: null }).success).toBe(false);
  });
});
