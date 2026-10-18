import "server-only";
import { z } from "zod";

/**
 * Server environment validation. Variables are read lazily (at request time),
 * so `next build` works without credentials. Errors name the missing/invalid
 * variables but never include their values.
 */

export class MissingConfigurationError extends Error {
  constructor(readonly variables: string[]) {
    super(`Missing or invalid server environment variables: ${variables.join(", ")}`);
    this.name = "MissingConfigurationError";
  }
}

const SupabaseEnvSchema = z.object({
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(20)
    .refine((key) => !key.startsWith("sb_publishable_"), "Use the secret (server) key, not the publishable key"),
});

const DemoSessionEnvSchema = z.object({
  DEMO_ACCESS_CODE: z.string().min(8),
  DEMO_SESSION_SECRET: z.string().min(32),
});

function parseEnv<T extends z.ZodType>(schema: T): z.output<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new MissingConfigurationError(names);
  }
  return result.data;
}

export function getSupabaseEnv() {
  return parseEnv(SupabaseEnvSchema);
}

export function getDemoSessionEnv() {
  return parseEnv(DemoSessionEnvSchema);
}
