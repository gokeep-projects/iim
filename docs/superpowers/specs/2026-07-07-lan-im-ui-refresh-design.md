# LAN IM UI Refresh Design

Date: 2026-07-07
Owner: Codex
Status: Approved by user

## Direction

Refresh the Svelte desktop UI into a polished, Windows-first LAN messaging workbench inspired by modern enterprise messengers. The app should feel calm, fast, and trustworthy for daily office use while still looking sharp enough to be memorable.

## Goals

- Keep messages as the first-class workflow with a clear rail, conversation list, chat canvas, and optional inspector.
- Make contacts, files, notifications, and settings feel like real workspaces instead of secondary placeholder pages.
- Reduce visual noise from heavy borders, dense cards, and uneven spacing.
- Improve interaction quality through clearer hover, focus, active, disabled, unread, and status states.
- Preserve existing functionality, tests, labels, and command surfaces.

## Visual System

- Default theme: light neutral background with white work surfaces, restrained blue actions, and teal identity accents.
- Dark theme: calmer neutral dark surfaces with the same semantic accents.
- Corners: 8px or less for cards and controls.
- Shadows: subtle elevation only for floating elements, dialogs, popovers, and active composer surfaces.
- Typography: compact, readable enterprise density; no viewport-scaled type.
- Layout: stable grid dimensions so badges, icons, buttons, and dynamic labels do not shift the UI.

## Interaction Improvements

- Rail: stronger current-section affordance, cleaner badges, and compact labels.
- Conversation list: scan-friendly rows, clearer unread/typing/draft states, and less boxed-in chrome.
- Chat: quieter header, better message grouping, professional outgoing/incoming bubbles, improved composer and attachment drafts.
- Workspaces: full-width task surfaces with refined cards only for repeated items or bounded tools.
- Inspector: compact details, transfer summaries, and action buttons that feel attached to the selected conversation.

## Non-Goals

- No protocol, Rust backend, storage, or networking behavior changes.
- No new server, compatibility layer, or account system.
- No landing page or marketing screen.
