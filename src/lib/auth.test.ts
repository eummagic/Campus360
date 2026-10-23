import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./auth";

describe("requireUser", () => {
  it("returns the authenticated user", async () => {
    const user = { id: "user-1", email: "student1@example.com" };
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    } as never);

    await expect(requireUser()).resolves.toEqual(user);
  });

  it("redirects when there is no user", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("no session") }) },
    } as never);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
  });
});