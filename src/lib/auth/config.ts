import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getDb, getMongoClient } from "@/lib/mongo/connection";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function createAuth(plugins: BetterAuthPlugin[] = []) {
  const baseURL = requireEnv("BETTER_AUTH_URL");
  return betterAuth({
    appName: "Campus360",
    baseURL,
    secret: requireEnv("BETTER_AUTH_SECRET"),
    trustedOrigins: [baseURL],
    database: mongodbAdapter(getDb(), { client: getMongoClient() }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
    },
    plugins,
  });
}
