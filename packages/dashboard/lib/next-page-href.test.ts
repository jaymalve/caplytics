import { describe, expect, test } from "bun:test";
import { nextPageHref } from "./next-page-href";

const cursor = { timestamp: "2026-10-18T10:00:00.000Z", id: "abc" };

describe("nextPageHref", () => {
  test("keeps every filter, including repeated ones", () => {
    const href = nextPageHref({ agent: ["a", "b"], meta: "customerId:cus_1" }, cursor);
    const params = new URLSearchParams(href.slice(2));

    expect(params.getAll("agent")).toEqual(["a", "b"]);
    expect(params.get("meta")).toBe("customerId:cus_1");
  });

  test("replaces the previous cursor rather than stacking a second one", () => {
    const href = nextPageHref({ cursor: "old~1" }, cursor);

    expect(new URLSearchParams(href.slice(2)).getAll("cursor")).toEqual([
      "2026-10-18T10:00:00.000Z~abc",
    ]);
  });
});
