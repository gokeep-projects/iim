import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("startup shell", () => {
  it("renders a first-paint loading shell before the Svelte bundle starts", () => {
    const html = readFileSync(resolve("index.html"), "utf8");

    expect(html).toContain('id="startup-shell"');
    expect(html).toContain('aria-label="启动进度"');
    expect(html).toContain("正在连接内网直连核心");
    expect(html).toContain('class="startup-shell-progress"');
  });
});
