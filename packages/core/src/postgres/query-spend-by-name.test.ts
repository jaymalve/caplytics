import { describe, expect, test } from "bun:test";
import { querySpendByName } from "./query-spend-by-name.js";
import type { SqlExecutor } from "./sql-executor.js";

/** Returns canned rows and records the statement, standing in for a driver. */
function fakeExecutor(rows: Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] | undefined }[] = [];

  const executor: SqlExecutor = {
    // biome-ignore lint/suspicious/noExplicitAny: the fake stands in for a driver's generic row type
    query: async (sql: string, params?: unknown[]): Promise<any> => {
      calls.push({ sql, params });
      return { rows };
    },
  };

  return { executor, calls };
}

describe("querySpendByName", () => {
  // pg returns BIGINT sums and COUNT(*) as strings; the boundary must narrow them to numbers.
  test("converts micro-dollar sums to dollars and counts to numbers", async () => {
    const { executor } = fakeExecutor([
      { name: "claude-opus", type: "model_call", total_cost: "2500000", call_count: "3" },
    ]);

    expect(await querySpendByName(executor)).toEqual([
      { name: "claude-opus", type: "model_call", totalCost: 2.5, callCount: 3 },
    ]);
  });

  test("passes the shared filter through as bound parameters", async () => {
    const { executor, calls } = fakeExecutor([]);

    await querySpendByName(executor, { agentId: ["a", "b"], from: "2026-07-01" });

    expect(calls[0]?.sql).toContain("WHERE timestamp >= $1 AND agent_id = ANY($2::text[])");
    expect(calls[0]?.params).toEqual(["2026-07-01", ["a", "b"]]);
  });

  test("groups by type as well as name, so a tool and a model never merge", async () => {
    const { executor, calls } = fakeExecutor([]);

    await querySpendByName(executor);

    expect(calls[0]?.sql).toContain("GROUP BY name, type");
  });

  test("rejects a row with an unknown call type rather than passing it inward", async () => {
    const { executor } = fakeExecutor([
      { name: "x", type: "sub_agent_call", total_cost: "1", call_count: "1" },
    ]);

    await expect(querySpendByName(executor)).rejects.toThrow();
  });

  test("returns an empty list when nothing matches", async () => {
    expect(await querySpendByName(fakeExecutor([]).executor)).toEqual([]);
  });
});
