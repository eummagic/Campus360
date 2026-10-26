import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

try {
  process.loadEnvFile(".env.local");
} catch {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-must-be-at-least-32-characters-long";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.MONGODB_URI ??= "mongodb://localhost:27017";
  process.env.MONGODB_DB ??= "campus360";
}

afterEach(() => {
  cleanup();
});