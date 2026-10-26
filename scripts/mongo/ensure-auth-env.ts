import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

const path = ".env.local";
const text = readFileSync(path, "utf8");
const lines: string[] = [];
if (!/^BETTER_AUTH_SECRET=/m.test(text)) lines.push(`BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}`);
if (!/^BETTER_AUTH_URL=/m.test(text)) lines.push("BETTER_AUTH_URL=http://localhost:3000");
if (lines.length > 0) appendFileSync(path, `\n# Better Auth (local)\n${lines.join("\n")}\n`);
console.log(lines.length > 0 ? `Added ${lines.length} Better Auth setting(s) to .env.local (values not printed).` : "Better Auth settings already present.");
