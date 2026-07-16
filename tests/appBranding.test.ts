import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop application branding", () => {
  it("uses the project icon for Windows bundles", () => {
    const config = JSON.parse(
      readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"),
    );

    expect(config.bundle.icon).toEqual(["icons/icon.ico"]);
    expect(config.bundle.windows.nsis.installerIcon).toBe("icons/icon.ico");
    expect(existsSync(resolve("src-tauri/icons/iim.png"))).toBe(true);
    expect(statSync(resolve("src-tauri/icons/icon.ico")).size).toBeGreaterThan(50_000);
  });

  it("keeps package identity metadata in the build configuration", () => {
    const config = JSON.parse(
      readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"),
    );
    const cargo = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8");

    expect(config.bundle.publisher).toBe("spurh");
    expect(config.bundle.homepage).toBe("https://spurh.com");
    expect(config.bundle.longDescription).toContain("xuning");
    expect(cargo).toContain('authors = ["xuning"]');
    expect(cargo).toContain('homepage = "https://spurh.com"');
  });

  it("uses the default window icon for the system tray", () => {
    const desktop = readFileSync(resolve("src-tauri/src/desktop.rs"), "utf8");

    expect(desktop).toContain("app.default_window_icon()");
    expect(desktop).toContain("tray.icon(icon.clone())");
  });
});
