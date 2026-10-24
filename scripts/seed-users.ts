import { createClient } from "@supabase/supabase-js";

// Node reads the ignored local file before this module evaluates.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SeedUser = {
  email: string;
  password: string;
  displayName: string;
  roles: Array<{ role: "student" | "teacher" | "admin" | "driver" | "finance"; scope: string }>;
};

const users: SeedUser[] = [
  { email: "admin1@example.com", password: "password123", displayName: "Admin One", roles: [{ role: "admin", scope: "demo" }] },
  { email: "student1@example.com", password: "password123", displayName: "Student One", roles: [{ role: "student", scope: "demo" }] },
  { email: "student2@example.com", password: "password123", displayName: "Student Two", roles: [{ role: "student", scope: "demo" }] },
  { email: "student3@example.com", password: "password123", displayName: "Student Three (unlinked)", roles: [{ role: "student", scope: "demo" }] },
  { email: "student4@example.com", password: "password123", displayName: "Student Four (unlinked test)", roles: [{ role: "student", scope: "demo" }] },
  { email: "adminstudent1@example.com", password: "password123", displayName: "Admin Student (multi-role)", roles: [{ role: "admin", scope: "demo" }, { role: "student", scope: "demo" }] },
  { email: "teacher1@example.com", password: "password123", displayName: "Teacher One", roles: [{ role: "teacher", scope: "demo" }] },
  { email: "teacher2@example.com", password: "password123", displayName: "Teacher Two (unassigned)", roles: [{ role: "teacher", scope: "demo" }] },
];

async function upsertUser(user: SeedUser): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.displayName },
  });

  let userId: string;
  if (error && /already been registered|already exists/i.test(error.message)) {
    const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = listed.users.find((candidate) => candidate.email === user.email);
    if (!existing) throw error;
    userId = existing.id;
  } else if (error) {
    throw new Error(`Failed to create ${user.email}: ${error.message}`);
  } else {
    userId = data.user.id;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    display_name: user.displayName,
    contact_email: user.email,
  });
  if (profileError) throw new Error(`Profile upsert failed for ${user.email}: ${profileError.message}`);

  for (const role of user.roles) {
    const { error: roleError } = await supabase.from("user_roles").upsert(
      { user_id: userId, role: role.role, scope: role.scope },
      { onConflict: "user_id,role,scope" },
    );
    if (roleError) throw new Error(`Role upsert failed for ${user.email}: ${roleError.message}`);
  }
  console.log(`Seeded ${user.email}`);
  return userId;
}

async function seedDomain(ids: { student1: string; student2: string; student3: string; student4: string; adminStudent: string; teacher1: string }) {
  const { data: department, error: departmentError } = await supabase
    .from("departments")
    .upsert({ code: "CSE", name: "Computer Science" }, { onConflict: "code" })
    .select("id")
    .single();
  if (departmentError) throw departmentError;

  const { data: program, error: programError } = await supabase
    .from("programs")
    .upsert({ department_id: department.id, code: "BTECH_CSE", name: "B.Tech Computer Science" }, { onConflict: "department_id,code" })
    .select("id")
    .single();
  if (programError) throw programError;

  const { data: term, error: termError } = await supabase
    .from("academic_terms")
    .upsert({ name: "2026 Fall", starts_on: "2026-08-01", ends_on: "2026-12-15", status: "active" }, { onConflict: "name" })
    .select("id")
    .single();
  if (termError) throw termError;

  const subjects: Array<{ id: string }> = [];
  for (const subject of [
    { code: "CS101", name: "Data Structures", credits: 4 },
    { code: "CS102", name: "Algorithms", credits: 4 },
  ]) {
    const { data, error } = await supabase.from("subjects")
      .upsert({ ...subject, program_id: program.id }, { onConflict: "program_id,code" })
      .select("id").single();
    if (error) throw error;
    subjects.push(data);
  }

  const offerings: Array<{ id: string }> = [];
  for (const subject of subjects) {
    const { data, error } = await supabase.from("course_offerings")
      .upsert({ subject_id: subject.id, term_id: term.id, section_code: "A" }, { onConflict: "subject_id,term_id,section_code" })
      .select("id").single();
    if (error) throw error;
    offerings.push(data);
  }

  for (const offering of offerings) {
    const { error } = await supabase.from("teaching_assignments").upsert(
      { teacher_user_id: ids.teacher1, offering_id: offering.id },
      { onConflict: "teacher_user_id,offering_id" },
    );
    if (error) throw error;
  }

  const students = [
    { user_id: ids.student1, registration_number: "CSE2023001" },
    { user_id: ids.student2, registration_number: "CSE2023002" },
    { user_id: ids.adminStudent, registration_number: "CSE2023099" },
  ];
  for (const student of students) {
    const { data: record, error } = await supabase.from("student_records")
      .upsert({ ...student, program_id: program.id }, { onConflict: "user_id" })
      .select("id").single();
    if (error) throw error;
    for (const offering of offerings) {
      const { error: enrolmentError } = await supabase.from("enrolments").upsert(
        { student_record_id: record.id, offering_id: offering.id },
        { onConflict: "student_record_id,offering_id" },
      );
      if (enrolmentError) throw enrolmentError;
    }
  }

  const { data: staleUnlinkedRecord, error: unlinkedLookupError } = await supabase
    .from("student_records")
    .select("id")
    .eq("user_id", ids.student3)
    .maybeSingle();
  if (unlinkedLookupError) throw unlinkedLookupError;
  if (staleUnlinkedRecord) {
    await supabase.from("enrolments").delete().eq("student_record_id", staleUnlinkedRecord.id);
    await supabase.from("student_records").delete().eq("id", staleUnlinkedRecord.id);
  }

  const { error: unlinkedRecordError } = await supabase
    .from("student_records")
    .delete()
    .eq("user_id", ids.student3);
  if (unlinkedRecordError) throw unlinkedRecordError;
  const { error: testCandidateCleanupError } = await supabase
    .from("student_records")
    .delete()
    .eq("user_id", ids.student4);
  if (testCandidateCleanupError) throw testCandidateCleanupError;
  console.log("Seeded academic structure and student enrolments.");
}

async function main() {
  const ids = new Map<string, string>();
  for (const user of users) ids.set(user.email, await upsertUser(user));
  await seedDomain({
    student1: ids.get("student1@example.com")!,
    student2: ids.get("student2@example.com")!,
    student3: ids.get("student3@example.com")!,
    student4: ids.get("student4@example.com")!,
    adminStudent: ids.get("adminstudent1@example.com")!,
    teacher1: ids.get("teacher1@example.com")!,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
