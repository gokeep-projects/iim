# LAN IM Comprehensive UI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the desktop IM UI at the workflow/layout level, especially misplaced refresh controls and unreasonable settings button layouts.

**Architecture:** Keep the existing Svelte component boundaries, but change markup where button placement is wrong instead of relying on CSS overrides. Add reusable CSS classes for command bars, action panels, toggle grids, and danger zones.

**Tech Stack:** Svelte, TypeScript, Vite, Tauri 2, Rust backend unchanged.

## Global Constraints

- Preserve current messaging, contact, file-transfer, notification, storage, and trust behavior.
- Preserve accessible names for existing important actions unless the new label is explicitly better and tests are updated.
- Cards stay at 8px radius or less.
- No new server, account system, protocol compatibility layer, or backend behavior change.

---

### Task 1: Sidebar Contact Discovery

**Files:**
- Modify: `src/components/ConversationList.svelte`
- Modify: `src/styles.css`
- Test: `src/components/ConversationList.test.ts`

**Steps:**
- [ ] Remove the refresh icon from the tab strip.
- [ ] Add a contact discovery command bar at the top of contact mode with reachable/unavailable counts and a labeled refresh button.
- [ ] Keep the button accessible name `刷新联系人`.
- [ ] Verify contact-mode tests still find the refresh button only when contact mode is open.

### Task 2: Contacts Workspace Header

**Files:**
- Modify: `src/components/WorkspacePanel.svelte`
- Modify: `src/App.svelte`
- Modify: `src/styles.css`
- Test: `src/components/WorkspacePanel.test.ts`

**Steps:**
- [ ] Add `onRefreshPeers` to `WorkspacePanel`.
- [ ] Pass `refreshPeers` from `App.svelte`.
- [ ] Add a `刷新设备` header action beside `创建群聊`.
- [ ] Update empty-state copy to point at the visible header action.

### Task 3: Settings Action Architecture

**Files:**
- Modify: `src/components/WorkspacePanel.svelte`
- Modify: `src/styles.css`
- Test: `src/components/WorkspacePanel.test.ts`

**Steps:**
- [ ] Wrap profile fields in a form grid and put `保存本机资料` in a dedicated action bar.
- [ ] Replace storage `button-row` with grouped action panels: maintenance, folders, danger zone.
- [ ] Replace preference wide-button stack with system actions and toggle cards.
- [ ] Keep existing action labels such as `刷新存储信息`, `打开数据目录`, and `关闭隐私模式`.

### Task 4: Verification And Relaunch

**Files:**
- No source files expected beyond tasks above.

**Steps:**
- [ ] Run focused frontend tests for `ConversationList`, `WorkspacePanel`, and `App`.
- [ ] Build production frontend.
- [ ] Preview rendered pages at 1366x768 and 1920x1080 and check overflow/cut-off controls.
- [ ] Run full frontend tests.
- [ ] Rebuild Tauri NSIS bundle.
- [ ] Stop old `iim.exe` and launch the newest release binary.
