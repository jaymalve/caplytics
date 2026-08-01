import type { PriceTable } from "@caplytics/core";

/**
 * Supplies the rates the cost model prices against.
 *
 * An interface rather than a bare function because the retrieval strategy is a deployment concern:
 * a network fetch suits most installs, an air-gapped one needs a local file, and tests need neither.
 */
export type PriceSource = {
  /**
   * Resolves the current table. Callers await this before the first priced call in a process, so a
   * run never begins with no prices and therefore no enforcement.
   */
  load(): Promise<PriceTable>;
};

export function staticPriceSource(table: PriceTable): PriceSource {
  return { load: () => Promise.resolve(table) };
}
