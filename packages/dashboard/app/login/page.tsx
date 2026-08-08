import { signIn } from "../../auth";

export default function LoginPage() {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100dvh",
        padding: "1.5rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "24rem" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Caplytics</h1>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          Sign in with the Google account your team uses.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit">Continue with Google</button>
        </form>
      </div>
    </main>
  );
}
