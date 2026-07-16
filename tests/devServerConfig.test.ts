import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dev server configuration", () => {
  it("keeps the desktop dev shell responsive while CodeGraph writes local index files", () => {
    const configSource = readFileSync(resolve("vite.config.ts"), "utf8");

    expect(configSource).toContain('host: "127.0.0.1"');
    expect(configSource).toContain('"**/.codegraph/**"');
  });

  it("keeps the full test suite responsive with a bounded worker pool", () => {
    const configSource = readFileSync(resolve("vite.config.ts"), "utf8");

    expect(configSource).not.toContain("singleFork: true");
    expect(configSource).toContain("maxForks: 2");
  });
});
