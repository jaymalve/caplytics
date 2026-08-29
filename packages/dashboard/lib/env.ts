import { z } from "zod";

/**
 * Environment is an external boundary, so it is narrowed once here rather than read ad hoc (§9.2).
 *
 * A dashboard that boots with a missing secret and fails on the first sign-in is worse than one
 * that refuses to start: the failure surfaces to a user instead of to whoever deployed it.
 */
const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see §8.7's docker run example."),
  AUTH_SECRET: z
    .string()
    .min(1, "AUTH_SECRET is required. Generate one with `openssl rand -base64 32`."),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /**
   * Comma-separated Google Workspace domains permitted to sign in (§10 item 6).
   *
   * Unset means any Google account may sign in, which §8.6 accepts for a single-team internal tool.
   * Setting it is the difference between "our team" and "anyone with a Google account".
   */
  ALLOWED_EMAIL_DOMAINS: z.string().optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

let cached: Environment | undefined;

export function env(): Environment {
  if (cached !== undefined) return cached;

  // Each key is read explicitly rather than handing the schema `process.env`. Next inlines only
  // statically-referenced keys, and the edge runtime middleware runs in exposes a limited proxy
  // rather than the real object — parsing it wholesale yields undefined for everything, which threw
  // at module load and left the middleware with nothing to export.
  const parsed = environmentSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`caplytics-dashboard is misconfigured:\n${problems.join("\n")}`);
  }

  cached = parsed.data;
  return cached;
}

export function allowedDomains(): readonly string[] {
  const configured = env().ALLOWED_EMAIL_DOMAINS;
  if (configured === undefined) return [];

  return configured
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}
