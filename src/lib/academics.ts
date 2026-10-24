import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DirectoryFilters = {
  q?: string;
  programId?: string;
  status?: "active" | "inactive" | "graduated";
  offeringId?: string;
};

export type DirectoryRow = {
  student_record_id: string;
  user_id: string;
  registration_number: string;
  record_status: "active" | "inactive" | "graduated";
  display_name: string;
  contact_email: string | null;
  program_id: string;
  program_code: string;
  program_name: string;
  department_code: string;
  department_name: string;
};

const directorySelection =
  "student_record_id, user_id, registration_number, record_status, display_name, contact_email, program_id, program_code, program_name, department_code, department_name";

export async function listDirectory(filters: DirectoryFilters) {
  const supabase = await createClient();
  const queryText = filters.q?.trim();
  const normalizedFilters = { ...filters, q: queryText || undefined };
  let allowedIds: string[] | null = null;

  if (filters.offeringId) {
    const { data, error } = await supabase
      .from("enrolments")
      .select("student_record_id")
      .eq("offering_id", filters.offeringId)
      .limit(500);
    if (error) return { rows: [] as DirectoryRow[], error };
    allowedIds = [...new Set((data ?? []).map((row) => row.student_record_id))];
    if (allowedIds.length === 0) return { rows: [] as DirectoryRow[], error: null };
  }

  const buildQuery = (searchColumn?: "display_name" | "registration_number") => {
    let query = supabase
      .from("student_directory")
      .select(directorySelection)
      .order("registration_number", { ascending: true })
      .limit(200);
    if (normalizedFilters.programId) query = query.eq("program_id", normalizedFilters.programId);
    if (normalizedFilters.status) query = query.eq("record_status", normalizedFilters.status);
    if (allowedIds) query = query.in("student_record_id", allowedIds);
    if (normalizedFilters.q && searchColumn) {
      const pattern = `%${normalizedFilters.q.replace(/[\\%_]/g, "\\$&")}%`;
      query = query.ilike(searchColumn, pattern);
    }
    return query;
  };

  if (!normalizedFilters.q) {
    const { data, error } = await buildQuery();
    return { rows: (data ?? []) as DirectoryRow[], error };
  }

  // Keep the user value as a query parameter instead of interpolating it into
  // PostgREST's raw `.or()` grammar. RLS scopes both requests independently.
  const [byName, byRegistration] = await Promise.all([
    buildQuery("display_name"),
    buildQuery("registration_number"),
  ]);
  const error = byName.error ?? byRegistration.error;
  if (error) return { rows: [] as DirectoryRow[], error };

  const rows = new Map<string, DirectoryRow>();
  for (const row of [...(byName.data ?? []), ...(byRegistration.data ?? [])]) {
    const directoryRow = row as DirectoryRow;
    const searchText = `${directoryRow.display_name} ${directoryRow.registration_number}`.toLocaleLowerCase();
    const normalizedQuery = normalizedFilters.q!.toLocaleLowerCase();
    if (normalizedQuery && searchText.includes(normalizedQuery)) {
      rows.set(directoryRow.student_record_id, directoryRow);
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.registration_number.localeCompare(b.registration_number)).slice(0, 200),
    error: null,
  };
}

export async function getDirectoryEntry(studentRecordId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_directory")
    .select(directorySelection)
    .eq("student_record_id", studentRecordId)
    .maybeSingle();
  return { row: data as DirectoryRow | null, error };
}

export async function listEnrolmentsForRecord(studentRecordId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select("id, enrolled_at, offering:course_offerings(id, section_code, term:academic_terms(id, name), subject:subjects(id, code, name, credits), teaching:teaching_assignments(teacher_user_id))")
    .eq("student_record_id", studentRecordId)
    .order("enrolled_at", { ascending: true });
  return { rows: data ?? [], error };
}

export async function listReferenceData() {
  const supabase = await createClient();
  const [departments, programs, terms] = await Promise.all([
    supabase.from("departments").select("id, code, name, status").order("code"),
    supabase.from("programs").select("id, code, name, status, department_id").order("code"),
    supabase.from("academic_terms").select("id, name, status, starts_on, ends_on").order("name"),
  ]);
  return {
    departments: departments.data ?? [],
    programs: programs.data ?? [],
    terms: terms.data ?? [],
    error: departments.error ?? programs.error ?? terms.error,
  };
}
