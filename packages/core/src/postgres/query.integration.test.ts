import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { CaplyticsEvent } from "../event/caplytics-event.js";
import { usdToMicroDollars } from "../money/micro-dollars.js";
import { insertEvents } from "./insert-events.js";
import { migrate } from "./migrate.js";
import { type EventCursor, listEvents } from "./query-events.js";
import { querySpend } from "./query-spend.js";
import { querySpendByName } from "./query-spend-by-name.js";
import { createTestPool, testNamespace } from "./test-database.js";

const pool = createTestPool();
const describeWithDatabase = pool === undefined ? describe.skip : describe;

// biome-ignore lint/style/noNonNullAssertion: the suite is skipped entirely when there is no pool
const sql = pool!;

/** Namespaced per run: nothing is deleted, and no sibling file's rows can be counted. */
const NS = testNamespace();
const SUITE = { suite: `query-${NS}` } as const;
const SUPPORT = `support-${NS}`;
const BILLING = `billing-${NS}`;
const PARALLEL = `parallel-${NS}`;
const SINK = `sink-${NS}`;

function event(overrides: Partial<CaplyticsEvent> = {}): CaplyticsEvent {
  return {
    id: crypto.randomUUID(),
    runId: `run-${NS}`,
    agentId: SUPPORT,
    type: "model_call",
    name: "claude-opus-4-8",
    costEstimate: usdToMicroDollars(0.01),
    costActual: usdToMicroDollars(0.01),
    priceUnknown: false,
    budgetRemaining: usdToMicroDollars(4.99),
    timestamp: "2026-07-15T10:00:00.000Z",
    ...overrides,
    metadata: { ...SUITE, ...overrides.metadata },
  };
}

afterAll(async () => {
  await pool?.end();
});

describeWithDatabase("the query layer against real data", () => {
  beforeAll(async () => {
    await migrate(sql);
    await insertEvents(sql, [
      event({
        timestamp: "2026-07-01T10:00:00.000Z",
        costActual: usdToMicroDollars(1),
        metadata: { customerId: "cus_1", channel: "chat" },
      }),
      event({
        timestamp: "2026-07-15T10:00:00.000Z",
        costActual: usdToMicroDollars(2),
        metadata: { customerId: "cus_1", channel: "email" },
      }),
      event({
        agentId: BILLING,
        timestamp: "2026-07-20T10:00:00.000Z",
        costActual: usdToMicroDollars(4),
        metadata: { customerId: "cus_2" },
      }),
      // Outside July, so every range filter below must exclude it.
      event({ timestamp: "2026-08-05T10:00:00.000Z", costActual: usdToMicroDollars(8) }),
      // Unpriced: contributes nothing to cost but must still be counted and flagged.
      event({
        timestamp: "2026-07-25T10:00:00.000Z",
        costActual: usdToMicroDollars(0),
        priceUnknown: true,
      }),
    ]);
  });

  describe("querySpend", () => {
    // §6.2's worked example: spend for one customer over one month.
    test("answers spend for a customer over a window", async () => {
      const spend = await querySpend(sql, {
        metadata: { ...SUITE, customerId: "cus_1" },
        from: "2026-07-01",
        to: "2026-08-01",
      });

      expect(spend.totalCost).toBe(3);
      expect(spend.callCount).toBe(2);
    });

    test("reports dollars, not micro-dollars", async () => {
      expect((await querySpend(sql, { agentId: BILLING })).totalCost).toBe(4);
    });

    test("breaks down by agent", async () => {
      const spend = await querySpend(sql, {
        metadata: SUITE,
        from: "2026-07-01",
        to: "2026-08-01",
      });

      expect(spend.byAgent).toEqual({ [SUPPORT]: 3, [BILLING]: 4 });
    });

    // An exclusive upper bound is what makes adjacent months tile without overlap.
    test("excludes events at the upper bound", async () => {
      const july = await querySpend(sql, {
        agentId: SUPPORT,
        from: "2026-07-01",
        to: "2026-08-01",
      });
      const august = await querySpend(sql, {
        agentId: SUPPORT,
        from: "2026-08-01",
        to: "2026-09-01",
      });

      expect(july.totalCost).toBe(3);
      expect(august.totalCost).toBe(8);
    });

    test("requires every metadata pair to match", async () => {
      const spend = await querySpend(sql, {
        metadata: { ...SUITE, customerId: "cus_1", channel: "chat" },
      });

      expect(spend.callCount).toBe(1);
      expect(spend.totalCost).toBe(1);
    });

    // A total that silently omits unpriced calls looks complete and is not (§4.2).
    test("counts unpriced calls separately rather than hiding them", async () => {
      const spend = await querySpend(sql, {
        metadata: SUITE,
        from: "2026-07-01",
        to: "2026-08-01",
      });

      expect(spend.unpricedCount).toBe(1);
      expect(spend.callCount).toBe(4);
    });

    test("returns zeroes rather than throwing when nothing matches", async () => {
      const spend = await querySpend(sql, { agentId: `absent-${NS}` });

      expect(spend).toEqual({ totalCost: 0, callCount: 0, byAgent: {}, unpricedCount: 0 });
    });

    test("matches any of several agents", async () => {
      const spend = await querySpend(sql, {
        metadata: SUITE,
        agentId: [SUPPORT, BILLING],
        from: "2026-07-01",
        to: "2026-08-01",
      });

      expect(spend.totalCost).toBe(7);
    });
  });

  describe("querySpendByName", () => {
    test("totals each name, most expensive first", async () => {
      const byName = await querySpendByName(sql, {
        metadata: SUITE,
        from: "2026-07-01",
        to: "2026-08-01",
      });

      expect(byName).toEqual([
        { name: "claude-opus-4-8", type: "model_call", totalCost: 7, callCount: 4 },
      ]);
    });

    test("applies the same filter as querySpend, so the two never disagree", async () => {
      const filter = { metadata: SUITE, agentId: BILLING };
      const byName = await querySpendByName(sql, filter);

      expect(byName.reduce((total, row) => total + row.totalCost, 0)).toBe(
        (await querySpend(sql, filter)).totalCost,
      );
    });
  });

  describe("listEvents", () => {
    test("returns events newest first", async () => {
      const page = await listEvents(sql, { metadata: SUITE });

      const timestamps = page.events.map((e) => e.timestamp);
      expect([...timestamps].sort().reverse()).toEqual(timestamps);
    });

    test("narrows rows into real events", async () => {
      const page = await listEvents(sql, { agentId: BILLING });

      expect(page.events[0]?.costActual).toBe(usdToMicroDollars(4));
      expect(page.events[0]?.metadata).toEqual({ ...SUITE, customerId: "cus_2" });
    });

    test("pages without repeating or dropping an event", async () => {
      const seen: string[] = [];
      let cursor: EventCursor | undefined;

      do {
        const page = await listEvents(sql, {
          metadata: SUITE,
          limit: 2,
          ...(cursor === undefined ? {} : { cursor }),
        });
        seen.push(...page.events.map((e) => e.id));
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    test("omits the cursor on the last page", async () => {
      expect((await listEvents(sql, { metadata: SUITE, limit: 100 })).nextCursor).toBeUndefined();
    });

    /**
     * The failure §8.5 chose keyset pagination to avoid, and the reason PR 2 added `id`: parallel
     * tool calls share a timestamp, and a page boundary inside such a group must not skip the rest.
     */
    test("pages correctly through events sharing one timestamp", async () => {
      const shared = "2026-09-01T00:00:00.000Z";
      await insertEvents(
        sql,
        Array.from({ length: 5 }, () => event({ timestamp: shared, agentId: PARALLEL })),
      );

      const seen: string[] = [];
      let cursor: EventCursor | undefined;
      do {
        const page = await listEvents(sql, {
          agentId: PARALLEL,
          limit: 2,
          ...(cursor === undefined ? {} : { cursor }),
        });
        seen.push(...page.events.map((e) => e.id));
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      expect(new Set(seen).size).toBe(5);
    });
  });

  describe("insertEvents", () => {
    // The bug the old Bun-SQL harness hid: a batch must write every row, not just the first.
    test("writes every row of a batch", async () => {
      const batchAgent = `batch-${NS}`;

      const written = await insertEvents(
        sql,
        Array.from({ length: 25 }, (_, index) =>
          event({
            agentId: batchAgent,
            timestamp: `2026-11-01T00:00:${String(index).padStart(2, "0")}.000Z`,
          }),
        ),
      );

      expect(written).toBe(25);
      expect((await querySpend(sql, { agentId: batchAgent })).callCount).toBe(25);
    });

    test("is safe to retry, so a resend cannot double-count spend", async () => {
      const batch = [event({ agentId: SINK, timestamp: "2026-10-01T00:00:00.000Z" })];

      await insertEvents(sql, batch);
      await insertEvents(sql, batch);

      expect((await querySpend(sql, { agentId: SINK })).callCount).toBe(1);
    });

    test("an empty batch touches nothing", async () => {
      expect(await insertEvents(sql, [])).toBe(0);
    });
  });
});
