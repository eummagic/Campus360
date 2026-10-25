import { describe, expect, it } from "vitest";
import { createStudentRecordSchema, directorySearchSchema } from "./academic";

describe("directorySearchSchema", () => {
  it("accepts bounded search and known filters", () => {
    const parsed = directorySearchSchema.safeParse({
      q: "  Student One  ",
      program: "30000000-0000-0000-0000-000000000001",
      status: "active",
      offering: "60000000-0000-0000-0000-000000000001",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.q).toBe("Student One");
  });

  it("rejects unknown status, malformed ids, and oversized queries", () => {
    expect(directorySearchSchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(directorySearchSchema.safeParse({ program: "not-a-uuid" }).success).toBe(false);
    expect(directorySearchSchema.safeParse({ q: "x".repeat(121) }).success).toBe(false);
  });
});

describe("createStudentRecordSchema", () => {
  it("accepts a valid record and trims its registration number", () => {
    const result = createStudentRecordSchema.parse({
      userId: "10000000-0000-0000-0000-000000000008",
      registrationNumber: "  CSE2023003  ",
      programId: "30000000-0000-0000-0000-000000000001",
    });
    expect(result.registrationNumber).toBe("CSE2023003");
  });

  it("rejects empty and overlong registration numbers", () => {
    expect(createStudentRecordSchema.safeParse({
      userId: "10000000-0000-0000-0000-000000000008",
      registrationNumber: "   ",
      programId: "30000000-0000-0000-0000-000000000001",
    }).success).toBe(false);
    expect(createStudentRecordSchema.safeParse({
      userId: "10000000-0000-0000-0000-000000000008",
      registrationNumber: "x".repeat(41),
      programId: "30000000-0000-0000-0000-000000000001",
    }).success).toBe(false);
  });
});
