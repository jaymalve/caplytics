import { describe, expect, test } from "bun:test";
import { parseMetadata, toEventFilter } from "./filter-params";

describe("toEventFilter", () => {
  test("an empty URL filters nothing", () => {
    expect(toEventFilter({})).toEqual({});
  });

  test("blank values are ignored rather than sent as empty filters", () => {
    expect(toEventFilter({ from: "", agent: "   " })).toEqual({});
  });

  /**
   * `EventFilter.to` is exclusive so adjacent ranges tile. A user picking "to: 5 August" means
   * through the end of the 5th, so the day has to be advanced — otherwise the last day they chose
   * is silently missing from their own results.
   */
  test("advances the `to` date so the chosen day is included", () => {
    expect(toEventFilter({ to: "2026-08-05" }).to).toBe("2026-08-06T00:00:00.000Z");
  });

  test("passes `from` through as the inclusive lower bound", () => {
    expect(toEventFilter({ from: "2026-08-01" }).from).toBe("2026-08-01");
  });

  test("maps agent and metadata onto the query's own shape", () => {
    const filter = toEventFilter({ agent: "support-agent", meta: ["customerId:cus_1"] });

    expect(filter.agentId).toBe("support-agent");
    expect(filter.metadata).toEqual({ customerId: "cus_1" });
  });
});

describe("parseMetadata", () => {
  test("reads repeated pairs", () => {
    expect(parseMetadata(["customerId:cus_1", "channel:chat"])).toEqual({
      customerId: "cus_1",
      channel: "chat",
    });
  });

  test("accepts a single pair as a bare string", () => {
    expect(parseMetadata("customerId:cus_1")).toEqual({ customerId: "cus_1" });
  });

  // Splitting on the first colon keeps values that contain one meaningful.
  test("keeps a colon inside the value", () => {
    expect(parseMetadata("path:/a:/b")).toEqual({ path: "/a:/b" });
  });

  test.each([
    ["no separator", "customerId"],
    ["empty key", ":value"],
    ["empty value", "key:"],
  ])("drops a pair with %s", (_case, pair) => {
    expect(parseMetadata(pair)).toEqual({});
  });

  test("is empty when nothing is set", () => {
    expect(parseMetadata(undefined)).toEqual({});
  });
});
