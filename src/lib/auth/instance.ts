import { nextCookies } from "better-auth/next-js";
import { createAuth } from "./config";

export const auth = createAuth([nextCookies()]);
