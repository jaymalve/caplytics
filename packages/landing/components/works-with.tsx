// Where foglamp.dev shows customer logos. Caplytics has no customers to show, so the
// strip names what it works with: Mastra, and the providers Mastra's model router reaches,
// all priced from LiteLLM's feed.
const names = ["Mastra", "Anthropic", "OpenAI", "Google", "Mistral", "xAI", "DeepSeek"];

export function WorksWith() {
  return (
    <div className="mx-auto mt-14 w-full max-w-7xl px-5 sm:mt-20 sm:px-8">
      <p className="text-center text-[13px] text-muted-foreground">
        Works with Mastra and the providers it routes to
      </p>
      <ul className="mt-6 flex w-full flex-wrap items-center justify-between gap-y-5">
        {names.map((name) => (
          <li
            key={name}
            className="flex min-w-24 flex-1 justify-center text-lg font-semibold tracking-tight text-muted-foreground/60 sm:min-w-30"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
