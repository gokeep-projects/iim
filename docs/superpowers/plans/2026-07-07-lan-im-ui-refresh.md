# LAN IM UI Refresh Implementation Plan

Date: 2026-07-07
Owner: Codex
Spec: docs/superpowers/specs/2026-07-07-lan-im-ui-refresh-design.md

## Tasks

1. Rework global design tokens
   - Update light and dark theme variables.
   - Add consistent focus, hover, surface, badge, and shadow behavior.

2. Polish primary shell
   - Refine the left rail, active state, brand mark, notification badge, and theme button.
   - Preserve existing navigation behavior and labels.

3. Redesign message workflow
   - Refresh conversation column, profile card, tabs, search, and conversation rows.
   - Refresh chat header, message canvas, bubbles, status lines, composer, toolbar, popovers, and file drafts.
   - Keep message selection, search, pin, quote, attachment, screenshot, and emoji flows intact.

4. Refine secondary workspaces
   - Improve contacts, files, notifications, settings, dashboard cards, and empty states.
   - Keep cards only for repeated entities and bounded tools.

5. Refine inspector and dialogs
   - Polish details, transfer progress, security/storage cards, context menu, and migration dialog.

6. Verify and relaunch
   - Run focused UI tests.
   - Run the full frontend test suite.
   - Build production frontend.
   - Build the Tauri NSIS bundle.
   - Stop any old app process and launch the newest release binary.
