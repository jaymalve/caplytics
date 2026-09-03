import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "./cursor";

test("round-trips a cursor", () => {
  const cursor = { timestamp: "2026-08-01T10:00:00.000Z", id: crypto.randomUUID() };

  expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
});

/**
 * A timestamp without its tiebreaker is exactly the broken pagination §8.5 exists to prevent, so
 * half a cursor must never survive decoding.
 */
describe("rejects anything that is not a whole cursor", () => {
  test.each([
    ["undefined", undefined],
    ["empty", ""],
    ["a timestamp with no id", "2026-08-01T10:00:00.000Z"],
    ["a separator with no id", "2026-08-01T10:00:00.000Z~"],
    ["an id with no timestamp", "~abc"],
    ["a non-date", "not-a-date~abc"],
  ])("%s", (_case, raw) => {
    expect(decodeCursor(raw)).toBeUndefined();
  });
});

// A hand-edited URL should show the first page, never a server error.
test("a malformed cursor degrades to the first page", () => {
  expect(decodeCursor("garbage")).toBeUndefined();
});

test("keeps an id containing the separator intact", () => {
  const cursor = { timestamp: "2026-08-01T10:00:00.000Z", id: "a~b~c" };

  expect(decodeCursor(encodeCursor(cursor))?.id).toBe("a~b~c");
});
