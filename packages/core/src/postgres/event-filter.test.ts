import { describe, expect, test } from "bun:test";
import { buildWhere } from "./event-filter.js";

describe("building the WHERE clause", () => {
  test("matches everything when nothing is filtered", () => {
    expect(buildWhere({})).toEqual({ sql: "TRUE", params: [] });
  });

  test("bounds a time range, upper bound exclusive", () => {
    const where = buildWhere({ from: "2026-07-01", to: "2026-08-01" });

    expect(where.sql).toBe("timestamp >= $1 AND timestamp < $2");
    expect(where.params).toEqual(["2026-07-01", "2026-08-01"]);
  });

  // Adjacent months must neither double-count an event nor drop one between them.
  test("an exclusive upper bound makes adjacent ranges tile exactly", () => {
    expect(buildWhere({ to: "2026-08-01" }).sql).toContain("<");
    expect(buildWhere({ to: "2026-08-01" }).sql).not.toContain("<=");
  });

  test("filters by agent and run", () => {
    const where = buildWhere({ agentId: "support-agent", runId: "run_1" });

    expect(where.sql).toBe("agent_id = $1 AND run_id = $2");
    expect(where.params).toEqual(["support-agent", "run_1"]);
  });

  // Containment is one indexable predicate the GIN index serves; per-key equality would be N.
  test("uses jsonb containment for metadata", () => {
    const where = buildWhere({ metadata: { customerId: "cus_18213" } });

    expect(where.sql).toBe("metadata @> $1::jsonb");
    expect(where.params).toEqual(['{"customerId":"cus_18213"}']);
  });

  test("requires every metadata pair to match", () => {
    const where = buildWhere({ metadata: { customerId: "cus_1", channel: "chat" } });

    expect(JSON.parse(String(where.params[0]))).toEqual({ customerId: "cus_1", channel: "chat" });
  });

  test("ignores an empty metadata object rather than emitting a no-op predicate", () => {
    expect(buildWhere({ metadata: {} })).toEqual({ sql: "TRUE", params: [] });
  });

  test("combines every filter with AND", () => {
    const where = buildWhere({
      from: "2026-07-01",
      to: "2026-08-01",
      agentId: "support-agent",
      metadata: { channel: "chat" },
    });

    expect(where.sql).toBe(
      "timestamp >= $1 AND timestamp < $2 AND agent_id = $3 AND metadata @> $4::jsonb",
    );
    expect(where.params).toHaveLength(4);
  });
});

/**
 * Metadata keys and values are arbitrary user data (§6.1). Interpolating either would be an
 * injection; everything must be bound.
 */
describe("injection safety", () => {
  test.each([
    ["'; DROP TABLE caplytics_events; --", "a value"],
    ["key", "'; DELETE FROM caplytics_events; --"],
  ])("binds hostile metadata rather than interpolating it (%p)", (key, value) => {
    const where = buildWhere({ metadata: { [key]: value } });

    expect(where.sql).toBe("metadata @> $1::jsonb");
    expect(where.sql).not.toContain("DROP");
    expect(where.sql).not.toContain("DELETE");
  });

  test("binds a hostile agent id", () => {
    const where = buildWhere({ agentId: "'; DROP TABLE caplytics_events; --" });

    expect(where.sql).toBe("agent_id = $1");
    expect(where.params[0]).toContain("DROP");
  });
});

// The listing appends its cursor placeholders after the filter's, so numbering must be shiftable.
test("placeholder numbering can start beyond $1", () => {
  const where = buildWhere({ agentId: "a", runId: "b" }, 5);

  expect(where.sql).toBe("agent_id = $5 AND run_id = $6");
});
