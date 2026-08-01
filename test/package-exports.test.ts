import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const packages = ["core", "caplytics"];

type ExportTarget = Record<string, string>;
type PackageManifest = {
  name: string;
  files?: string[];
  exports: Record<string, ExportTarget>;
};

async function readManifest(dir: string): Promise<PackageManifest> {
  const raw: unknown = await Bun.file(join(repoRoot, "packages", dir, "package.json")).json();
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`packages/${dir}/package.json is not an object`);
  }
  return raw as PackageManifest;
}

describe.each(packages)("packages/%s", (dir) => {
  test("every exports target resolves to a built file", async () => {
    const manifest = await readManifest(dir);
    const targets = Object.values(manifest.exports).flatMap((entry) => Object.values(entry));

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(existsSync(join(repoRoot, "packages", dir, target))).toBe(true);
    }
  });

  test("only dist is published", async () => {
    const manifest = await readManifest(dir);
    expect(manifest.files).toEqual(["dist"]);
  });
});

test("caplytics resolves @caplytics/core through the workspace", async () => {
  const resolved = import.meta.resolve("@caplytics/core");
  expect(resolved).toContain("packages/core");
});
