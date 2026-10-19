import { BracketButton } from "@/components/bracket-button";

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-16 md:px-10 md:py-20">
      <h2 className="max-w-xl text-3xl leading-tight font-bold text-primary md:text-5xl">
        Tokens are the new spend.
        <br />
        Treat them like it.
      </h2>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <BracketButton asChild>
          <a href="https://github.com/jaymalve/caplytics">Get Started</a>
        </BracketButton>
        <code className="rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
          npm install caplytics
        </code>
      </div>
      <p className="mt-12 text-xs text-muted-foreground">
        Caplytics · dashboard ships as a Docker image, self-hosted
      </p>
    </footer>
  );
}
