import { describe, expect, it } from "vitest";
import { hasRole, isStaff, type AppRole } from "./auth";

describe("role helpers", () => {
  it("handles multiple roles without forcing a single role priority", () => {
    const roles: AppRole[] = [
      { role: "admin", scope: "demo" },
      { role: "student", scope: "demo" },
    ];
    expect(hasRole(roles, "admin")).toBe(true);
    expect(hasRole(roles, "student")).toBe(true);
    expect(isStaff(roles)).toBe(true);
  });

  it("does not treat students or non-staff roles as staff", () => {
    expect(isStaff([{ role: "student", scope: "demo" }])).toBe(false);
    expect(isStaff([{ role: "driver", scope: "demo" }])).toBe(false);
  });
});
