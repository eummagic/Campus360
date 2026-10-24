import { describe, expect, it } from "vitest";
import { answerCampusQuestion, assistantSuggestions } from "./campus-assistant";

describe("Campus360 demo assistant", () => {
  it("returns deterministic, role-appropriate attendance guidance", () => {
    expect(answerCampusQuestion("How do I mark attendance?", ["teacher"])).toEqual({
      text: "Open Attendance, choose an assigned class and date, update the roster, then save. Summaries include saved marks only.",
      links: [{ label: "Open Attendance", href: "/attendance" }],
    });
    expect(answerCampusQuestion("How do I see attendance?", ["student"]).links).toEqual([{ label: "View Attendance", href: "/attendance" }]);
  });

  it("does not claim student submission tracking and limits admin links to existing routes", () => {
    expect(answerCampusQuestion("Where is my homework?", ["student"]).text).toContain("does not track student submissions");
    expect(answerCampusQuestion("How do I find a student record?", ["admin"]).links).toEqual([
      { label: "Student Directory", href: "/directory" },
      { label: "Create Student Record", href: "/admin/students/new" },
    ]);
  });

  it("offers role-aware prompts and a transparent fallback", () => {
    expect(assistantSuggestions(["teacher"])).toContain("How do I record attendance?");
    expect(assistantSuggestions(["student"])).not.toContain("How do I record attendance?");
    expect(answerCampusQuestion("Tell me something", ["student"]).text).toContain("I don’t access live records");
  });
});
