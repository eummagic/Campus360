import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unit tests never connect to a database. These placeholders only satisfy
// module-level configuration (the Mongo client connects lazily).
process.env.BETTER_AUTH_SECRET ??= "test-secret-must-be-at-least-32-characters-long";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB ??= "campus360_test";

afterEach(() => {
  cleanup();
});
