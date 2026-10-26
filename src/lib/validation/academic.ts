import { z } from "zod";

// MongoDB ObjectId (24 hex characters).
const objectId = (message = "Invalid id.") => z.string().regex(/^[0-9a-f]{24}$/i, message);

export const directorySearchSchema = z.object({
  q: z.string().trim().max(120).optional().or(z.literal("")).transform((value) => value || undefined),
  program: objectId().optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["active", "inactive", "graduated"]).optional().or(z.literal("")).transform((value) => value || undefined),
  offering: objectId().optional().or(z.literal("")).transform((value) => value || undefined),
});

export const createStudentRecordSchema = z.object({
  userId: objectId("Select a student account."),
  registrationNumber: z.string().trim()
    .min(1, "Registration number is required.")
    .max(40, "Registration number is too long."),
  programId: objectId("Select a program."),
});

export type DirectorySearch = z.infer<typeof directorySearchSchema>;
export type CreateStudentRecordInput = z.infer<typeof createStudentRecordSchema>;
