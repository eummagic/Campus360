import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/instance", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/mongo/connection", () => ({ getDb: vi.fn() }));

import { auth } from "@/lib/auth/instance";
import { requireUser } from "./auth";

describe("requireUser", () => {
  it("returns the authenticated user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "665f1c2b9a1e4b0012345678", email: "student1@example.com" },
      session: {},
    } as never);
    await expect(requireUser()).resolves.toEqual({ id: "665f1c2b9a1e4b0012345678", email: "student1@example.com" });
  });

  it("redirects when there is no user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
  });
});