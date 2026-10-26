
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { getOptionalUser, getUserRoles } from "@/lib/auth";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
You are the friendly AI assistant built into Campus360, a college
campus management and student self-service demo.

ABOUT THE SITE
Campus360 helps users navigate academic and campus information.
The interface includes role-aware dashboards and the following areas:

- Dashboard: an overview based on the signed-in user's role.
- Timetable: view available class schedules. Administrators can filter
  by section and subject.
- Attendance: students can view their saved attendance marks.
  Teachers and administrators can manage attendance where authorized.
- Assignments: view published assignments. Teachers and administrators
  can manage assignments for their permitted academic offerings.
  This demo does not track student submissions.
- Calendar: view academic events and deadlines available in the app.
- Student Directory: browse student records when the user's role allows it.
- Academic Structure: administrators can inspect departments, programs,
  terms, subjects, offerings, and teaching assignments.
- Profile: review or update profile details available to the signed-in user.

ROLES AND PERMISSIONS
Campus360 supports student, teacher, admin, driver, and finance roles.
Available pages and actions depend on the user's assigned role.
Never tell users they can perform an action unless their role permits it.

BEHAVIOUR
- Answer naturally and conversationally, like a helpful campus guide.
- Explain where features are and how to use them.
- Keep answers concise, friendly, and easy to understand.
- Use numbered steps when explaining a process.
- If you do not know a detail, say so instead of inventing it.
- Do not claim to have opened pages, changed records, sent messages,
  or performed actions.
- You cannot access live database records, attendance values, private
  student information, or actual assignment data through this chat.
- Do not ask for passwords, API keys, or other sensitive credentials.
- Do not invent pages, buttons, settings, or capabilities.
- If asked about something outside Campus360, you may still help briefly.
`;

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;

export async function POST(request: Request) {
  try {
    const user = await getOptionalUser();

    if (!user) {
      return NextResponse.json(
        { error: "Please sign in to use the assistant." },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("message" in body) ||
      typeof body.message !== "string"
    ) {
      return NextResponse.json(
        { error: "Please enter a message." },
        { status: 400 },
      );
    }

    const message = body.message.trim();

    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: "Messages must be between 1 and 1000 characters." },
        { status: 400 },
      );
    }

    const rawHistory =
      "history" in body && Array.isArray(body.history)
        ? body.history
        : [];

    const history: ChatMessage[] = rawHistory
      .filter(
        (item): item is ChatMessage =>
          !!item &&
          typeof item === "object" &&
          "role" in item &&
          "text" in item &&
          (item.role === "user" || item.role === "model") &&
          typeof item.text === "string",
      )
      .slice(-MAX_HISTORY_MESSAGES)
      .map((item) => ({
        role: item.role,
        text: item.text.slice(0, MAX_MESSAGE_LENGTH),
      }));

    const roles = await getUserRoles(user.id);
    const roleNames = [...new Set(roles.map((item) => item.role))];

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: [
        ...history.map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        })),
        {
          role: "user",
          parts: [
            {
              text: `The signed-in user's roles are: ${
                roleNames.join(", ") || "none assigned"
              }.\n\nTheir question is:\n${message}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 400,
      },
    });

    const answer = response.text?.trim();

    if (!answer) {
      return NextResponse.json(
        { error: "I couldn't generate a reply. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ answer });
  } catch (error) {
    // Do not log the user's message, conversation, or API key.
    console.error(
      "Campus360 assistant failed:",
      error instanceof Error ? error.name : "UnknownError",
    );

    return NextResponse.json(
      {
        error:
          "The assistant is temporarily unavailable. Please try again shortly.",
      },
      { status: 502 },
    );
  }
}
