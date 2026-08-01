import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkSrc = join(repoRoot, "packages/caplytics/src");
const mastraAdapter = join(sdkSrc, "adapters/mastra");

const FRAMEWORK_PACKAGES = /^@mastra\//;
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

function frameworkImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1] ?? "")
    .filter((specifier) => FRAMEWORK_PACKAGES.test(specifier));
}

/**
 * Framework-agnostic machinery — the model proxy, run context, event bus, budget wiring — must stay
 * free of Mastra so a second adapter is a new directory rather than a refactor.
 */
test("only the Mastra adapter imports @mastra/*", () => {
  const offenders = sourceFiles(sdkSrc)
    .filter((file) => !file.startsWith(mastraAdapter))
    .filter((file) => frameworkImports(file).length > 0)
    .map((file) => relative(repoRoot, file));

  expect(offenders).toEqual([]);
});

// A rule that never observes a real import is not testing anything.
test("the Mastra adapter does import @mastra/*, so the rule has something to catch", () => {
  const importing = sourceFiles(mastraAdapter).filter((file) => frameworkImports(file).length > 0);

  expect(importing.length).toBeGreaterThan(0);
});

test("@caplytics/core never imports a framework", () => {
  const offenders = sourceFiles(join(repoRoot, "packages/core/src"))
    .filter((file) => frameworkImports(file).length > 0)
    .map((file) => relative(repoRoot, file));

  expect(offenders).toEqual([]);
});
