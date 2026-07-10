const fs = require('fs');
const path = 'src/components/ConversationList.svelte';
let text = fs.readFileSync(path, 'utf8');
function replaceRegex(regex, replace, label) {
  if (!regex.test(text)) throw new Error(`${label} not found`);
  text = text.replace(regex, replace);
}
if (!text.includes('lucide-svelte/icons/history')) {
  text = text.replace('  import Search from "lucide-svelte/icons/search";', '  import History from "lucide-svelte/icons/history";\r\n  import Search from "lucide-svelte/icons/search";');
}
if (!text.includes('export let onOpenConversationSearch')) {
  text = text.replace('  export let onOpenMessageResult: (message: ChatMessage) => void | Promise<void> = () => {};', '  export let onOpenMessageResult: (message: ChatMessage) => void | Promise<void> = () => {};\r\n  export let onOpenConversationSearch: () => void | Promise<void> = () => {};');
}
if (!text.includes('let sidebarSearchExpanded = false;')) {
  text = text.replace('  let sidebarSearchOpen = false;', '  let sidebarSearchOpen = false;\r\n  let sidebarSearchExpanded = false;');
}
if (!text.includes('let sidebarSearchInputElement')) {
  text = text.replace('  let sidebarSearchToken = 0;', '  let sidebarSearchToken = 0;\r\n  let sidebarSearchInputElement: HTMLInputElement | null = null;');
}
if (!/async function selectSidebarSearchSuggestion[\s\S]*?sidebarSearchExpanded = false;/.test(text)) {
  replaceRegex(/(async function selectSidebarSearchSuggestion\(suggestion: SidebarSearchSuggestion\) \{\r?\n\s*sidebarSearchOpen = false;)/, '$1\r\n    sidebarSearchExpanded = false;', 'select function start');
}
if (!/event\.key === "Escape"[\s\S]*?sidebarSearchExpanded = false;/.test(text)) {
  replaceRegex(/(\} else if \(event\.key === "Escape"\) \{\r?\n\s*sidebarSearchOpen = false;)/, '$1\r\n      if (!sidebarSearchQuery.trim()) sidebarSearchExpanded = false;', 'escape branch');
}
if (!text.includes('async function openSidebarSearch()')) {
  replaceRegex(/(\r?\n\s*function delay\(milliseconds: number\) \{)/, '\r\n\r\n  async function openSidebarSearch() {\r\n    sidebarSearchExpanded = true;\r\n    sidebarSearchOpen = Boolean(sidebarSearchQuery.trim());\r\n    await tick();\r\n    sidebarSearchInputElement?.focus();\r\n    sidebarSearchInputElement?.select();\r\n  }\r\n\r\n  function blurSidebarSearch() {\r\n    window.setTimeout(() => {\r\n      sidebarSearchOpen = false;\r\n      if (!sidebarSearchQuery.trim()) {\r\n        sidebarSearchExpanded = false;\r\n      }\r\n    }, 120);\r\n  }\r\n$1', 'delay function anchor');
}
fs.writeFileSync(path, text, 'utf8');
