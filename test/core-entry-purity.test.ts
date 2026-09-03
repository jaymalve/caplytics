import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreSrc = join(repoRoot, "packages/core/src");
const pureEntry = join(coreSrc, "index.ts");

/**
 * Packages that mean the pure entry has grown an I/O dependency. Not exhaustive by design — the
 * `src/postgres/` reachability assertion below is the load-bearing check, since our own code is
 * where the boundary actually erodes.
 */
const DRIVER_PACKAGES = ["pg", "postgres", "pg-native", "node:net", "node:dgram", "node:http"];

const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");
}

/** Walks the entry's import graph through our own source, collecting every bare specifier. */
function walkGraph(entry: string): { files: string[]; bareSpecifiers: string[] } {
  const seen = new Set<string>();
  const bareSpecifiers = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith(".")) {
        bareSpecifiers.add(specifier);
        continue;
      }
      // Source is written with the emitted `.js` extension; the file on disk is `.ts`.
      const resolved = resolve(dirname(file), specifier).replace(/\.js$/, ".ts");
      if (existsSync(resolved)) queue.push(resolved);
    }
  }

  return { files: [...seen], bareSpecifiers: [...bareSpecifiers] };
}

test("the pure entry cannot reach the Postgres subpath", () => {
  const { files } = walkGraph(pureEntry);

  const leaked = files
    .map((file) => relative(coreSrc, file))
    .filter((path) => path.startsWith("postgres/"));

  expect(leaked).toEqual([]);
});

test("the pure entry pulls in no database driver", () => {
  const { bareSpecifiers } = walkGraph(pureEntry);

  expect(bareSpecifiers.filter((specifier) => DRIVER_PACKAGES.includes(specifier))).toEqual([]);
});

// The walker is only meaningful if it actually traverses; a silently-empty graph would pass both
// assertions above no matter what the entry imported.
test("the walker reaches the modules the entry re-exports", () => {
  const { files, bareSpecifiers } = walkGraph(pureEntry);

  expect(files.length).toBeGreaterThan(3);
  expect(files.map((file) => relative(coreSrc, file))).toContain("money/micro-dollars.ts");
  expect(bareSpecifiers).toContain("zod");
});
