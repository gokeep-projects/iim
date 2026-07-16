import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("chat layout styles", () => {
  const css = readFileSync(resolve("src/styles.css"), "utf8");
  const v2Css = readFileSync(resolve("src/ui-v2.css"), "utf8");

  function lastRuleBody(selector: string, source = css) {
    const rules = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const match = rules.findLast((rule) =>
      rule[1]
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(",")
        .map((item) => item.trim())
        .includes(selector),
    );
    return match?.[2] ?? "";
  }

  it("keeps the frameless titlebar in one compact non-overlapping viewport strip", () => {
    const shell = lastRuleBody(".ui-v2", v2Css);
    const titlebar = lastRuleBody(".ui-v2 .app-titlebar", v2Css);
    const controls = lastRuleBody(".ui-v2 .app-window-controls", v2Css);
    expect(shell).toContain("padding-top: 28px !important");
    expect(titlebar).toContain("position: fixed !important");
    expect(titlebar).toContain("top: 0 !important");
    expect(titlebar).toContain("height: 28px !important");
    expect(titlebar).not.toContain("grid-row");
    expect(controls).toContain("height: 28px !important");
    expect(controls).toContain("bottom: auto !important");
  });

  it("keeps the inspector in a real fourth column on wide desktop windows", () => {
    expect(v2Css).toMatch(
      /\.ui-v2\.messages-layout\.inspector-visible\s*\{[\s\S]*?grid-template-columns:\s*60px 286px minmax\(0, 1fr\) 310px\s*!important;/,
    );
  });

  it("keeps conversation search as a full-height right drawer above the composer", () => {
    expect(v2Css).toMatch(
      /\.ui-v2 \.conversation-search-panel\s*\{[\s\S]*?inset:\s*64px 0 116px auto\s*!important;[\s\S]*?grid-area:\s*auto\s*!important;[\s\S]*?height:\s*auto\s*!important;/,
    );
    expect(v2Css).toMatch(
      /\.ui-v2 \.conversation-search-summary-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s*!important;/,
    );
  });

  it("replaces the conversation list with a dedicated inspector column on compact desktop windows", () => {
    expect(v2Css).toMatch(
      /@media \(max-width: 1180px\)[\s\S]*?\.ui-v2\.messages-layout\.inspector-visible\s*\{[\s\S]*?grid-template-columns:\s*60px minmax\(0, 1fr\) 310px\s*!important;/,
    );
    expect(v2Css).toMatch(
      /\.ui-v2\.messages-layout\.inspector-visible\s*>\s*\.conversation-column\s*\{[\s\S]*?display:\s*none\s*!important;/,
    );
    expect(v2Css).not.toMatch(/\.ui-v2\.messages-layout\.inspector-visible\s*>\s*\.inspector\s*\{[^}]*position:\s*fixed/);
  });

  it("keeps group creation and avatar apply as the single emphasized dialog actions", () => {
    const block = css.match(
      /\.group-create-actions button\.primary:not\(:disabled\),\s*\.avatar-crop-actions button\.primary:not\(:disabled\)\s*\{([^}]+)\}/,
    )?.[1];
    expect(block).toContain("border-color: #07c160 !important");
    expect(block).toContain("background: #07c160 !important");
  });

  it("keeps focused dialog inputs free of browser outline chrome", () => {
    const block = css.match(/\.group-create-name input:focus\s*\{([^}]+)\}/)?.[1];
    expect(block).toContain("outline: 0 !important");
  });

  it("keeps group creation searchable, scrollable, and compact", () => {
    const dialog = lastRuleBody(".group-create-dialog");
    const content = lastRuleBody(".group-create-content");
    const search = lastRuleBody(".group-create-search");
    const members = lastRuleBody(".group-create-members");
    const choice = lastRuleBody(".group-create-member-choice");
    expect(dialog).toContain("width: min(480px, calc(100vw - 32px))");
    expect(dialog).toContain("max-height: min(580px, calc(100vh - 32px))");
    expect(content).toContain("grid-template-rows: auto auto minmax(0, 1fr)");
    expect(search).toContain("box-shadow: none");
    expect(members).toContain("overflow-y: auto");
    expect(choice).toContain("background: transparent");
  });

  it("renders direct conversation details as flat information and command rows", () => {
    const status = lastRuleBody(".inspector-panel > .status-card");
    const detailRow = lastRuleBody(".inspector-panel > dl > div");
    const contact = lastRuleBody(".direct-contact-card");
    const action = lastRuleBody(".inspector .action-card");
    expect(status).toContain("border: 0 !important");
    expect(status).toContain("background: transparent !important");
    expect(detailRow).toContain("border: 0 !important");
    expect(detailRow).toContain("border-bottom: 1px solid");
    expect(contact).toContain("border: 0 !important");
    expect(contact).toContain("background: transparent !important");
    expect(action).toContain("min-height: 36px !important");
    expect(action).toContain("border: 0 !important");
  });

  it("gives contact names the flexible directory column after removing row checkboxes", () => {
    const row = lastRuleBody(".contacts-grid .data-row.contact-device-card");
    const actions = lastRuleBody(".contact-row-actions");
    expect(row).toContain("grid-template-columns: 8px 36px minmax(0, 1fr) 32px !important");
    expect(actions).toContain("min-width: 30px !important");
  });

  it("keeps refresh compact as an icon-only sidebar control", () => {
    expect(v2Css).toMatch(
      /\.ui-v2 \.column-mode-tabs \.contact-tab-refresh > span\s*\{[^}]*display:\s*none\s*!important;/,
    );
  });

  it("renders preference switches as flat setting rows instead of button cards", () => {
    const block = lastRuleBody(".settings-preference-panel .preference-toggle");
    expect(block).toContain("min-height: 52px !important");
    expect(block).toContain("border: 0 !important");
    expect(block).toContain("background: transparent !important");
  });

  it("keeps the preference switch thumb inside its track", () => {
    const track = lastRuleBody(".settings-preference-panel .preference-toggle::before");
    const thumb = lastRuleBody(".settings-preference-panel .preference-toggle::after");
    const enabledThumb = lastRuleBody(".settings-preference-panel .preference-toggle.enabled::after");
    expect(track).toContain("position: absolute !important");
    expect(track).toContain("right: 4px !important");
    expect(thumb).toContain("right: 22px !important");
    expect(thumb).toContain("margin-right: 0 !important");
    expect(enabledThumb).toContain("transform: translateX(16px) !important");
  });

  it("keeps delivery state beneath the bubble instead of floating beside it", () => {
    const meta = lastRuleBody(".message-floating-meta");
    const mine = lastRuleBody(".message-row.mine .message-floating-meta");
    expect(meta).toContain("position: static !important");
    expect(meta).toContain("transform: none !important");
    expect(mine).toContain("align-self: flex-end !important");
  });

  it("keeps attachment hover actions visually unboxed", () => {
    const actions = lastRuleBody(".attachment-floating-actions");
    expect(actions).toContain("border: 0 !important");
    expect(actions).toContain("background: transparent !important");
    expect(actions).toContain("box-shadow: none !important");
  });

  it("keeps the chat composer compact and free of input chrome", () => {
    const composer = lastRuleBody(".composer");
    const layoutComposer = lastRuleBody(".app.messages-layout > .chat-workspace .composer");
    const textareaBase = lastRuleBody(".composer textarea");
    const textarea = lastRuleBody(".composer textarea:focus");
    expect(composer).toContain("min-height: 104px !important");
    expect(composer).toContain("max-height: 140px !important");
    expect(layoutComposer).toContain("min-height: 104px !important");
    expect(layoutComposer).toContain("max-height: 140px !important");
    expect(textareaBase).toContain("min-height: 52px !important");
    expect(textareaBase).toContain("max-height: 82px !important");
    expect(textarea).toContain("outline: none !important");
    expect(textarea).toContain("box-shadow: none !important");
    expect(v2Css).toMatch(/\.ui-v2 \.composer:focus-within,[\s\S]*?box-shadow:\s*none\s*!important;/);
  });

  it("renders forwarding as a compact native dialog without focus glow", () => {
    const dialog = lastRuleBody(".forward-dialog");
    const preview = lastRuleBody(".forward-preview");
    const searchFocus = lastRuleBody(".forward-search-field:focus-within");
    expect(dialog).toContain("max-height: min(500px, calc(100vh - 32px)) !important");
    expect(preview).toContain("border-left: 0 !important");
    expect(searchFocus).toContain("box-shadow: none !important");
  });

  it("uses a quiet modal focus treatment for programmatically focused buttons", () => {
    const focus = lastRuleBody(".modal-backdrop button:focus-visible");
    expect(focus).toContain("outline: 1px solid rgba(31, 35, 40, 0.18) !important");
    expect(focus).toContain("box-shadow: none !important");
  });
});
