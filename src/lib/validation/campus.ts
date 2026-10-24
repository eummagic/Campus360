import { z } from "zod";

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.");

export const timetableEntrySchema = z.object({
  offeringId: z.string().uuid("Select a course offering."),
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: timeSchema,
  endTime: timeSchema,
  location: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || null),
}).refine((value) => value.endTime > value.startTime, {
  message: "End time must be after start time.",
  path: ["endTime"],
});

const localUtcDateTime = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid UTC date and time.")
  .refine((value) => Number.isFinite(Date.parse(`${value}:00Z`)), "Enter a real calendar date.");

export const assignmentSchema = z.object({
  offeringId: z.string().uuid("Select an assigned offering."),
  title: z.string().trim().min(1, "Title is required.").max(160, "Title must be 160 characters or fewer."),
  instructions: z.string().max(10000, "Instructions must be 10,000 characters or fewer."),
  dueAt: localUtcDateTime,
  status: z.enum(["draft", "published"]),
});

export const updateAssignmentSchema = assignmentSchema.extend({
  assignmentId: z.string().uuid("Invalid assignment."),
});

export const attendanceSubmissionSchema = z.object({
  timetableEntryId: z.string().uuid(),
  sessionDate: z.string().date(),
  records: z.array(z.object({
    studentRecordId: z.string().uuid(),
    status: z.enum(["present", "absent", "late"]),
  })).min(1).max(200),
}).refine((value) => new Set(value.records.map((record) => record.studentRecordId)).size === value.records.length, {
  message: "Each student can appear only once.",
  path: ["records"],
});

export type TimetableEntryInput = z.infer<typeof timetableEntrySchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
