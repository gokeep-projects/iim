# Svelte IM Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unusable React frontend with a high-performance Svelte 5 desktop IM workbench.

**Architecture:** Preserve the Rust/Tauri command boundary in `src/api.ts`, replace the UI runtime and app shell with Svelte components, and organize the window around navigation, conversations, chat, and a tabbed inspector. State remains local to the app shell for this pass because the backend API is still small and synchronous enough for a single source of truth.

**Tech Stack:** Tauri 2, Rust backend, Svelte 5, Vite, TypeScript, Vitest, jsdom, Tauri dialog and notification plugins.

---

## File Structure

- Modify `package.json`: replace React dependencies and test packages with Svelte equivalents.
- Modify `package-lock.json`: regenerate through npm.
- Modify `vite.config.ts`: use the Svelte Vite plugin.
- Modify `tsconfig.json`: use Svelte JSX-free TypeScript settings.
- Modify `src/main.tsx` to `src/main.ts`: mount the Svelte app.
- Delete `src/App.tsx`: remove the React shell.
- Create `src/App.svelte`: app state, Tauri event listeners, command handlers, and shell composition.
- Create `src/components/Rail.svelte`: primary navigation.
- Create `src/components/ConversationList.svelte`: search, sessions, peers, and group creation.
- Create `src/components/ChatWorkspace.svelte`: header, message timeline, quick actions, drop zone, composer.
- Create `src/components/Inspector.svelte`: details, transfers, network, and security tabs.
- Modify `src/styles.css`: replace the React-era layout with stable desktop workbench styles.
- Modify `src/App.test.tsx` to `src/App.test.ts`: Svelte rendering smoke tests.
- Modify `src/test/setup.ts`: keep jest-dom setup.

### Task 1: Svelte Test Skeleton

**Files:**
- Modify: `src/App.test.ts`
- Delete: `src/App.test.tsx`

- [ ] **Step 1: Write the Svelte UI smoke test**

```ts
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import App from "./App.svelte";

describe("App", () => {
  it("renders the redesigned Svelte LAN messenger shell", async () => {
    render(App);

    expect(await screen.findByText("iim")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("搜索会话、联系人、聊天记录")).toBeInTheDocument();
    expect(await screen.findByText("消息")).toBeInTheDocument();
    expect(await screen.findByText("在线联系人")).toBeInTheDocument();
    expect(await screen.findByText("文件传输")).toBeInTheDocument();
    expect(await screen.findByText("网络状态")).toBeInTheDocument();
    expect(await screen.findByText("安全指纹")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails before migration**

Run: `npm test`

Expected: FAIL because `@testing-library/svelte` and `src/App.svelte` are not present yet.

### Task 2: Frontend Stack Migration

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Rename: `src/main.tsx` to `src/main.ts`

- [ ] **Step 1: Replace dependencies**

Use npm to remove React packages and install Svelte packages:

```bash
npm uninstall react react-dom lucide-react @vitejs/plugin-react @testing-library/react @types/react @types/react-dom
npm install svelte lucide-svelte
npm install -D @sveltejs/vite-plugin-svelte @testing-library/svelte
```

- [ ] **Step 2: Update Vite config**

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
});
```

- [ ] **Step 3: Update the app mount**

```ts
import App from "./App.svelte";
import "./styles.css";

const app = new App({
  target: document.getElementById("root") as HTMLElement
});

export default app;
```

### Task 3: Svelte Workbench Components

**Files:**
- Create: `src/App.svelte`
- Create: `src/components/Rail.svelte`
- Create: `src/components/ConversationList.svelte`
- Create: `src/components/ChatWorkspace.svelte`
- Create: `src/components/Inspector.svelte`
- Modify: `src/api.ts`

- [ ] **Step 1: Implement component props and events**

Each component receives plain typed props and emits user actions through Svelte event dispatchers. `src/api.ts` remains the typed Tauri boundary and keeps demo fallbacks for browser tests.

- [ ] **Step 2: Implement `App.svelte` state orchestration**

`App.svelte` loads self profile, peers, conversations, messages, network settings, listens to Tauri events, and passes action handlers to components.

- [ ] **Step 3: Preserve existing command behavior**

Keep calls to `getSelfProfile`, `listPeers`, `listConversations`, `listMessages`, `sendText`, `sendFiles`, `createGroup`, and `updateNetworkSettings`.

### Task 4: Workbench Styling

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace layout CSS**

Use a four-region desktop grid with fixed rail, bounded conversation column, flexible chat workspace, and bounded inspector.

- [ ] **Step 2: Add responsive fallback**

Below narrow desktop widths, hide the inspector first and keep the primary chat flow usable.

- [ ] **Step 3: Add theme support**

Support default light and dark theme through root classes and CSS variables.

### Task 5: Verification

**Files:**
- Modify as needed based on compiler feedback.

- [ ] **Step 1: Run frontend tests**

Run: `npm test`

Expected: PASS for the Svelte smoke test.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS, producing Vite build artifacts.

- [ ] **Step 3: Run Rust tests**

Run: `cargo test` in `src-tauri`.

Expected: PASS for backend tests after frontend migration.

- [ ] **Step 4: Inspect app locally**

Run: `npm run dev` and open the Tauri/Vite URL if needed to confirm the main shell is not blank and the primary controls fit.
