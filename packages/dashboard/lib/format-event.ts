/** UTC, to the second: events from agents in several timezones must line up in one column. */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 19);
}

/** Absent is different from zero: a tool call has no tokens of its own to report. */
export function formatTokens(tokens: number | undefined): string {
  return tokens === undefined ? "—" : tokens.toLocaleString("en-US");
}
