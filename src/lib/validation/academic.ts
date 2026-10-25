import { z } from "zod";

export const directorySearchSchema = z.object({
  q: z.string().trim().max(120).optional().or(z.literal("")).transform((value) => value || undefined),
  program: z.string().uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["active", "inactive", "graduated"]).optional().or(z.literal("")).transform((value) => value || undefined),
  offering: z.string().uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});

export const createStudentRecordSchema = z.object({
  userId: z.string().uuid({ message: "Select a student account." }),
  registrationNumber: z.string().trim()
    .min(1, "Registration number is required.")
    .max(40, "Registration number is too long."),
  programId: z.string().uuid({ message: "Select a program." }),
});

export type DirectorySearch = z.infer<typeof directorySearchSchema>;
export type CreateStudentRecordInput = z.infer<typeof createStudentRecordSchema>;
