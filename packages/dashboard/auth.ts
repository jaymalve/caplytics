import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowedDomains, env } from "./lib/env";

/**
 * §8.6: Google sign-in only. No passwords, no RBAC — any permitted account sees all data, which is
 * sufficient for a single-team internal tool and explicitly out of scope to extend for v1.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: env().AUTH_SECRET,
  providers: [
    Google({
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    /**
     * Enforced here rather than in the UI: a domain check that only hides a button is not a check.
     */
    signIn({ profile }) {
      const domains = allowedDomains();
      if (domains.length === 0) return true;

      const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : "";
      // Google's own verification flag matters: an unverified address proves nothing about the
      // domain it claims.
      if (profile?.email_verified !== true) return false;

      return domains.some((domain) => email.endsWith(`@${domain}`));
    },
  },
  pages: { signIn: "/login" },
}));
