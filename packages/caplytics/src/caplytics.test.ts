import { describe, expect, test } from "bun:test";
import { type CaplyticsEvent, usdToMicroDollars } from "@caplytics/core";
import { caplytics, createCaplytics } from "./caplytics.js";

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

test("subscribes by budget key, per §3's example", () => {
  const instance = createCaplytics();
  const seen: CaplyticsEvent[] = [];

  instance.on("support-agent", (received) => seen.push(received));
  instance.emit("support-agent", event());

  expect(seen).toHaveLength(1);
});

describe("scoped handle", () => {
  test("receives its key's events", () => {
    const instance = createCaplytics();
    const monitor = instance.agent("support-agent");
    let calls = 0;

    monitor.on("call", () => {
      calls += 1;
    });
    instance.emit("support-agent", event());

    expect(calls).toBe(1);
  });

  test("ignores other keys", () => {
    const instance = createCaplytics();
    let calls = 0;

    instance.agent("support-agent").on("call", () => {
      calls += 1;
    });
    instance.emit("billing-agent", event());

    expect(calls).toBe(0);
  });

  test("unsubscribes", () => {
    const instance = createCaplytics();
    const off = instance.agent("k").on("call", () => {});

    off();

    expect(instance.listenerCount("k")).toBe(0);
  });

  test("exposes its key without holding the agent instance", () => {
    // §3: an ops module subscribes by key, without importing the agent definition.
    expect(createCaplytics().agent("support-agent").budgetKey).toBe("support-agent");
  });
});

/**
 * §3 routes by budget key, which defaults to `agent.id` but can be overridden so several agents
 * share one pool. Routing on the event's `agentId` would break exactly that case.
 */
test("routes by budget key, not by the event's agentId", () => {
  const instance = createCaplytics();
  const seen: string[] = [];
  instance.on("shared-pool", (received) => seen.push(received.agentId));

  instance.emit("shared-pool", event({ agentId: "support-agent" }));
  instance.emit("shared-pool", event({ agentId: "billing-agent" }));

  expect(seen).toEqual(["support-agent", "billing-agent"]);
});

describe("instances", () => {
  test("do not share subscribers", () => {
    const first = createCaplytics();
    const second = createCaplytics();
    let calls = 0;
    first.on("k", () => {
      calls += 1;
    });

    second.emit("k", event());

    expect(calls).toBe(0);
  });

  test("a shared singleton is exported for §3's bare `caplytics.on(...)`", () => {
    let calls = 0;
    const off = caplytics.on("singleton-check", () => {
      calls += 1;
    });

    caplytics.emit("singleton-check", event());
    off();

    expect(calls).toBe(1);
  });
});

test("a subscriber's failure does not reach the emitter", () => {
  const instance = createCaplytics({ onHandlerError: () => {} });
  instance.on("k", () => {
    throw new Error("broken subscriber");
  });

  expect(() => instance.emit("k", event())).not.toThrow();
});
