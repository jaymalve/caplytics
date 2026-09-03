import { auth, signOut } from "../auth";

/**
 * The shell only. §8.2's filter bar and data table arrive with the query wiring; this PR proves the
 * app boots, authenticates, and knows who is signed in.
 */
export default async function DashboardPage() {
  const session = await auth();

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Caplytics</h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              color: "var(--muted-foreground)",
              fontSize: "0.875rem",
            }}
          >
            Agent spend, by run and by call.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <span
            style={{
              marginRight: "0.75rem",
              color: "var(--muted-foreground)",
              fontSize: "0.875rem",
            }}
          >
            {session?.user?.email}
          </span>
          <button type="submit">Sign out</button>
        </form>
      </header>

      <p style={{ color: "var(--muted-foreground)" }}>Filters and the event table land next.</p>
    </main>
  );
}
