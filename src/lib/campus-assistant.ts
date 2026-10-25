export type CampusRole = "student" | "teacher" | "admin" | "driver" | "finance";

export type AssistantReply = {
  text: string;
  links: Array<{ label: string; href: string }>;
};

export function answerCampusQuestion(question: string, roles: CampusRole[]): AssistantReply {
  const normalized = question.trim().toLowerCase();
  const isStudent = roles.includes("student");
  const isTeacher = roles.includes("teacher");
  const isAdmin = roles.includes("admin");

  if (/attendance|present|absent|mark/.test(normalized)) {
    if (isTeacher || isAdmin) {
      return {
        text: "Open Attendance, choose an assigned class and date, update the roster, then save. Summaries include saved marks only.",
        links: [{ label: "Open Attendance", href: "/attendance" }],
      };
    }
    if (isStudent) return { text: "Your saved attendance marks and summaries are available on the Attendance page.", links: [{ label: "View Attendance", href: "/attendance" }] };
  }

  if (/timetable|schedule|class|room/.test(normalized)) {
    return { text: "The Timetable page shows the schedule available to your account. Administrators can filter by section and subject.", links: [{ label: "Open Timetable", href: "/timetable" }] };
  }

  if (/assignment|homework|due/.test(normalized)) {
    return {
      text: isTeacher || isAdmin ? "Open Assignments to review or manage assignments for your assigned offerings." : "Assignments shows published work for offerings available to your account. This demo does not track student submissions.",
      links: [{ label: "Open Assignments", href: "/assignments" }],
    };
  }

  if (/student|directory|record/.test(normalized) && isAdmin) {
    return { text: "Use Student Directory to browse records. Create Student Record links an existing eligible account; it does not create a login account.", links: [{ label: "Student Directory", href: "/directory" }, { label: "Create Student Record", href: "/admin/students/new" }] };
  }

  if (/academic|subject|offering|term/.test(normalized) && isAdmin) {
    return { text: "Academic Structure provides a read-only overview of departments, programs, terms, subjects, offerings, and teaching assignments.", links: [{ label: "Academic Structure", href: "/admin/academics" }] };
  }

  if (/profile|name|account/.test(normalized)) {
    return { text: "You can review and update the profile details available to your account from Profile.", links: [{ label: "Open Profile", href: "/profile" }] };
  }

  const role = isAdmin ? "administrator" : isTeacher ? "teacher" : isStudent ? "student" : "Campus360";
  return { text: `I’m a demo guide for ${role} workflows. Ask about timetable, attendance, assignments, or your profile. I don’t access live records or provide personal data.`, links: [] };
}

export function assistantSuggestions(roles: CampusRole[]): string[] {
  const suggestions = ["Where can I see my timetable?", "How do I view assignments?", "How do I update my profile?"];
  if (roles.includes("teacher") || roles.includes("admin")) suggestions.splice(1, 0, "How do I record attendance?");
  if (roles.includes("admin")) suggestions.push("How do I find a student record?");
  return suggestions;
}
