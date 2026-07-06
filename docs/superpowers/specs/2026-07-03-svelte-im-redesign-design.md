# Svelte IM Redesign Design

## Goal

Rebuild the desktop client frontend as a usable high-performance LAN messenger. Keep the existing Rust/Tauri backend commands and events, but replace the React UI with Svelte 5 and a clearer IM workbench layout.

## Frontend Stack

- Use Svelte 5 with Vite and Tauri 2.
- Replace React, React DOM, React testing-library, and lucide-react with Svelte equivalents.
- Keep TypeScript, Vitest, jsdom, Tauri API, dialog plugin, and notification plugin.
- Prefer small Svelte components with local state and derived values instead of a single monolithic app component.

## Information Architecture

The main window is a dense desktop tool, not a landing page.

- Navigation rail: app identity and primary areas for messages, contacts, transfers, network, security, and settings.
- Conversation column: profile/status summary, search, action buttons, conversation list, and online peers.
- Chat workspace: conversation header, message timeline, quick actions, drag-and-drop file zone, and composer.
- Inspector: tabbed panel for details, transfers, network, and security so unrelated controls are not stacked together.

## Interaction Model

- Sending text is centered in the composer with Enter/submission behavior.
- File sending is exposed through a clear button and drag-drop target.
- Creating groups is a direct action in the conversation column.
- Notifications and advanced network settings are reachable but do not dominate the default chat view.
- Raw peer identifiers and fingerprints are shown in the security tab, not in the primary chat flow.

## Data Flow

- `src/api.ts` remains the typed Tauri command boundary.
- `App.svelte` owns app-level state: self profile, peers, conversations, messages, active conversation, settings, transfers, and UI tab/theme state.
- Svelte reactive declarations derive active peer, selected conversation title, filtered peers, and message ownership.
- Tauri events continue to update peers, messages, statuses, transfer progress, and warnings.

## Components

- `App.svelte`: shell composition and state orchestration.
- `components/Rail.svelte`: primary navigation icons.
- `components/ConversationList.svelte`: search, conversations, peers, and group action.
- `components/ChatWorkspace.svelte`: header, message timeline, quick actions, drop zone, composer.
- `components/Inspector.svelte`: details, transfer, network, and security tabs.

## Visual Direction

- Windows-first, clean enterprise desktop style.
- Light theme by default, with dark theme toggle.
- Stable column widths, constrained panels, and responsive fallback below desktop widths.
- No nested cards, oversized hero sections, decorative blobs, or marketing layout.
- Use strong hierarchy, clear affordances, compact spacing, and readable Chinese labels.

## Testing

- Replace React UI tests with Svelte tests.
- Verify that the shell renders, search exists, the main chat workspace exists, inspector tabs render, and core actions are visible.
- Run TypeScript/Vite build and Rust tests after migration.
