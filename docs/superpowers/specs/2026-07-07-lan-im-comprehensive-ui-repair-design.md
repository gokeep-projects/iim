# LAN IM Comprehensive UI Repair Design

Date: 2026-07-07
Owner: Codex
Status: User requested full rework after prior visual pass

## Problem

The prior refresh changed colors and surface styling but left several workflow-level issues intact. In particular, the contact refresh control is embedded in the tab strip and reads as a misplaced third tab. The settings workspace uses many identical full-width buttons, so primary actions, secondary utilities, toggles, and destructive actions compete with each other.

## Goals

- Move discovery refresh controls to explicit contact-discovery command areas.
- Make settings pages use clear structure: information summary, editable form, action panel, toggle panel, and danger zone.
- Reduce button clutter by replacing stacks of identical wide buttons with grouped action cards and compact inline actions.
- Preserve current features and accessible button names where tests and user workflows already depend on them.
- Verify the actual rendered UI at common desktop sizes, not just test output.

## Scope

- Message sidebar contact mode.
- Contacts workspace header and empty state.
- Settings workspace profile, storage, security, preferences, and shared action styling.
- Supporting CSS for command bars, action panels, grouped toggles, and responsive desktop layouts.

## Non-Goals

- No Rust protocol, storage, transport, or Tauri command changes.
- No new product feature beyond better placement of existing commands.
- No marketing or landing pages.
