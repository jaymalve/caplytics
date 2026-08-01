import { describe, expect, test } from "bun:test";
import type { CaplyticsEvent } from "@caplytics/core";
import { usdToMicroDollars } from "@caplytics/core";
import { createEventBus } from "./event-bus.js";

function event(overrides: Partial<CaplyticsEvent> = {}): CaplyticsEvent {
  return {
    id: crypto.randomUUID(),
    runId: "run_1",
    agentId: "support-agent",
    type: "model_call",
    name: "anthropic/claude-opus-4-8",
    costEstimate: usdToMicroDollars(0.01),
    costActual: usdToMicroDollars(0.012),
    priceUnknown: false,
    budgetRemaining: usdToMicroDollars(4.98),
    timestamp: "2026-08-01T10:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

const silent = () => {};

describe("subscription", () => {
  test("delivers events for the subscribed key", () => {
    const bus = createEventBus();
    const seen: CaplyticsEvent[] = [];
    bus.on("support-agent", (received) => seen.push(received));

    bus.emit("support-agent", event());

    expect(seen).toHaveLength(1);
  });

  test("does not deliver events for other keys", () => {
    const bus = createEventBus();
    const seen: CaplyticsEvent[] = [];
    bus.on("support-agent", (received) => seen.push(received));

    bus.emit("billing-agent", event());

    expect(seen).toHaveLength(0);
  });

  test("delivers to every subscriber of a key, in registration order", () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on("k", () => order.push("first"));
    bus.on("k", () => order.push("second"));

    bus.emit("k", event());

    expect(order).toEqual(["first", "second"]);
  });

  test("emitting with no subscribers is harmless", () => {
    expect(() => createEventBus().emit("nobody-listening", event())).not.toThrow();
  });
});

describe("unsubscribe", () => {
  test("stops delivery", () => {
    const bus = createEventBus();
    let calls = 0;
    const off = bus.on("k", () => {
      calls += 1;
    });

    bus.emit("k", event());
    off();
    bus.emit("k", event());

    expect(calls).toBe(1);
  });

  test("is idempotent", () => {
    const bus = createEventBus();
    const off = bus.on("k", silent);

    off();

    expect(() => off()).not.toThrow();
    expect(bus.listenerCount("k")).toBe(0);
  });

  test("leaves other subscribers of the same key intact", () => {
    const bus = createEventBus();
    let survived = 0;
    const off = bus.on("k", silent);
    bus.on("k", () => {
      survived += 1;
    });

    off();
    bus.emit("k", event());

    expect(survived).toBe(1);
  });

  // A server that opens a subscription per run would otherwise retain a key for every run it has
  // ever served.
  test("drops the key once its last subscriber leaves", () => {
    const bus = createEventBus();
    const off = bus.on("k", silent);

    off();

    expect(bus.listenerCount("k")).toBe(0);
  });
});

/**
 * Enforcement reads this same stream (§3), so a subscriber's bug must never reach the caller — it
 * would take down spend control and the agent run with it.
 */
describe("subscriber failures are contained", () => {
  test("a throwing subscriber does not reach the emitter", () => {
    const errors: Error[] = [];
    const bus = createEventBus({ onHandlerError: (error) => errors.push(error) });
    bus.on("k", () => {
      throw new Error("subscriber is broken");
    });

    expect(() => bus.emit("k", event())).not.toThrow();
    expect(errors[0]?.message).toBe("subscriber is broken");
  });

  test("a throwing subscriber does not stop the others", () => {
    const bus = createEventBus({ onHandlerError: silent });
    let reached = false;
    bus.on("k", () => {
      throw new Error("boom");
    });
    bus.on("k", () => {
      reached = true;
    });

    bus.emit("k", event());

    expect(reached).toBe(true);
  });

  test("a rejecting async subscriber is reported, not swallowed", async () => {
    const errors: Error[] = [];
    const bus = createEventBus({ onHandlerError: (error) => errors.push(error) });
    bus.on("k", () => Promise.reject(new Error("sink unreachable")));

    bus.emit("k", event());
    await Promise.resolve();

    expect(errors[0]?.message).toBe("sink unreachable");
  });

  test("reports a thrown non-Error without losing it", () => {
    const errors: Error[] = [];
    const bus = createEventBus({ onHandlerError: (error) => errors.push(error) });
    bus.on("k", () => {
      throw "just a string";
    });

    bus.emit("k", event());

    expect(errors[0]?.message).toBe("just a string");
  });

  // A subscriber persisting to a database must not add its latency to every model call.
  test("does not wait for async subscribers", () => {
    const bus = createEventBus({ onHandlerError: silent });
    let settled = false;
    bus.on("k", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      settled = true;
    });

    bus.emit("k", event());

    expect(settled).toBe(false);
  });
});

describe("mutation during dispatch", () => {
  test("a subscriber may unsubscribe itself mid-emit", () => {
    const bus = createEventBus();
    let calls = 0;
    const off = bus.on("k", () => {
      calls += 1;
      off();
    });

    bus.emit("k", event());
    bus.emit("k", event());

    expect(calls).toBe(1);
  });

  test("a subscriber added during dispatch does not receive the in-flight event", () => {
    const bus = createEventBus();
    let lateCalls = 0;
    bus.on("k", () => {
      bus.on("k", () => {
        lateCalls += 1;
      });
    });

    bus.emit("k", event());

    expect(lateCalls).toBe(0);
  });
});
