import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { RUN_ID_CONTEXT_KEY } from "./run-identity.js";

export const METADATA_CONTEXT_KEY = "caplytics.metadata";

/**
 * Stored as one JSON string under a single namespaced key rather than as loose entries.
 *
 * Mastra rebuilds the request context per model call and copies caller entries across, so reading
 * back requires knowing exactly which keys are ours — impossible with arbitrary user-chosen keys
 * (§6.1 puts no constraints on them) and unsafe besides, since a user key could collide with
 * Mastra's own.
 */
const metadataSchema = z.record(z.string(), z.string());

/**
 * Builds the value a caller passes as `requestContext`, carrying per-call metadata and the run
 * identity that groups the call (§6.1, and architecture/run-scoping-api.md).
 */
export function createRequestContext(
  metadata: Record<string, string>,
  runId: string,
): RequestContext {
  const context = new RequestContext();
  context.set(RUN_ID_CONTEXT_KEY, runId);
  context.set(METADATA_CONTEXT_KEY, JSON.stringify(metadata));
  return context;
}

/** Narrowed at the boundary (§9.2): anything malformed yields no metadata rather than junk. */
export function readCallMetadata(requestContext: unknown): Record<string, string> {
  if (typeof requestContext !== "object" || requestContext === null) return {};

  const get = Reflect.get(requestContext, "get");
  if (typeof get !== "function") return {};

  const raw: unknown = get.call(requestContext, METADATA_CONTEXT_KEY);
  if (typeof raw !== "string") return {};

  try {
    const parsed = metadataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * §6.1: the two levels merge rather than replace, with the more specific winning.
 *
 * Agent-level is the default set once at `attach()`; run-level comes from `caplytics.run()`;
 * per-call is the caller's `requestContext`. A per-call `customerId` must override an agent-level
 * `category` default without erasing it — merging is the whole point of having two levels.
 */
export function mergeMetadata(
  agentLevel: Readonly<Record<string, string>> | undefined,
  runLevel: Readonly<Record<string, string>> | undefined,
  perCall: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...agentLevel, ...runLevel, ...perCall };
}
