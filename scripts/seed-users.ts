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

const users = [
  {
    email: "student1@example.com",
    password: "password123",
    role: "student" as const,
    displayName: "Student One",
  },
  {
    email: "student2@example.com",
    password: "password123",
    role: "student" as const,
    displayName: "Student Two",
  },
  {
    email: "teacher1@example.com",
    password: "password123",
    role: "teacher" as const,
    displayName: "Teacher One",
  },
];

async function main() {
  for (const user of users) {
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

    const { error: roleError } = await supabase.from("user_roles").upsert({
      user_id: userId,
      role: user.role,
      scope: "demo",
    });

    if (roleError) throw new Error(`Role upsert failed for ${user.email}: ${roleError.message}`);

    console.log(`Seeded ${user.email}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
