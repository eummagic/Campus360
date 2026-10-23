import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "./profile";

describe("updateProfileSchema", () => {
  it("accepts a valid display name", () => {
    const result = updateProfileSchema.safeParse({ displayName: "Asha Nair" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty display name", () => {
    const result = updateProfileSchema.safeParse({ displayName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects names over 120 characters", () => {
    const result = updateProfileSchema.safeParse({
      displayName: "a".repeat(121),
    });
    expect(result.success).toBe(false);
  });
});