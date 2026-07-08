<script lang="ts">
  import { tick } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import Archive from "lucide-svelte/icons/archive";
  import BellOff from "lucide-svelte/icons/bell-off";
  import BellRing from "lucide-svelte/icons/bell-ring";
  import CalendarDays from "lucide-svelte/icons/calendar-days";
  import CheckSquare from "lucide-svelte/icons/check-square";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import ChevronUp from "lucide-svelte/icons/chevron-up";
  import Clipboard from "lucide-svelte/icons/clipboard";
  import Copy from "lucide-svelte/icons/copy";
  import ExternalLink from "lucide-svelte/icons/external-link";
  import FileText from "lucide-svelte/icons/file-text";
  import Folder from "lucide-svelte/icons/folder";
  import FolderOpen from "lucide-svelte/icons/folder-open";
  import Image from "lucide-svelte/icons/image";
  import Info from "lucide-svelte/icons/info";
  import MoreHorizontal from "lucide-svelte/icons/more-horizontal";
  import MousePointer2 from "lucide-svelte/icons/mouse-pointer-2";
  import Paperclip from "lucide-svelte/icons/paperclip";
  import Pin from "lucide-svelte/icons/pin";
  import PinOff from "lucide-svelte/icons/pin-off";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Scissors from "lucide-svelte/icons/scissors";
  import Search from "lucide-svelte/icons/search";
  import Send from "lucide-svelte/icons/send";
  import ShieldCheck from "lucide-svelte/icons/shield-check";
  import Smile from "lucide-svelte/icons/smile";
  import Star from "lucide-svelte/icons/star";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UploadCloud from "lucide-svelte/icons/upload-cloud";
  import Users from "lucide-svelte/icons/users";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import X from "lucide-svelte/icons/x";
  import type { ChatMessage, ConversationSummary, MessageAttachment, MessageQuote, PeerProfile, PendingFileDraft, TransferTask, TransferManifest } from "../api";
  import { clipboardFilesFromData } from "../clipboard";
  import { mentionNamesForSelf } from "../messageMentions";

  type MentionCandidate = {
    id: string;
    label: string;
    meta: string;
    insertText: string;
  };
  type ConversationSearchFocus = "query" | "date";

  export let title = "内网广播";
  export let conversation: ConversationSummary | null = null;
  export let activePeer: PeerProfile | null = null;
  export let selfPeerId = "local-demo";
  export let selfDisplayName = "";
  export let messages: ChatMessage[] = [];
  export let draft = "";
  export let notice = "";
  export let typingText = "";
  export let replyQuote: MessageQuote | null = null;
  export let quickReplies: string[] = [];
  export let isGroup = false;
  export let memberCount = 0;
  export let messageSenderLabels: Record<string, string> = {};
  export let mentionableMembers: PeerProfile[] = [];
  export let sendShortcut: "enter" | "ctrl_enter" = "enter";
  export let sendDisabledReason = "";
  export let conversationActionsDisabledReason = "";
  export let fileActionsDisabled = false;
  export let fileActionsDisabledReason = "";
  export let pendingFileDrafts: PendingFileDraft[] = [];
  export let transferTasks: TransferTask[] = [];
  export let conversationSearchOpen = false;
  export let conversationSearchFocus: ConversationSearchFocus = "query";
  export let conversationSearchQuery = "";
  export let conversationSearchDate = "";
  export let conversationSearchResults: ChatMessage[] = [];
  export let pinnedMessages: ChatMessage[] = [];
  export let todoMessages: ChatMessage[] = [];
  export let focusedMessageId = "";
  export let messageSelectionMode = false;
  export let selectedMessageIds: string[] = [];
  export let hasMoreMessages = false;
  export let loadingOlderMessages = false;
  export let onDraftChange: (value: string) => void = () => {};
  export let onSend: (text?: string) => void | Promise<void> = () => {};
  export let onPickFiles: (files: FileList | File[] | null) => void | Promise<void> = () => {};
  export let onChooseDesktopFiles: () => void | Promise<void> = () => {};
  export let onChooseDesktopFolder: () => void | Promise<void> = () => {};
  export let onRemovePendingFile: (id: string) => void = () => {};
  export let onClearPendingFiles: () => void = () => {};
  export let onSendPendingFiles: () => void | Promise<void> = () => {};
  export let onStartScreenshot: () => void | Promise<void> = () => {};
  export let onShowDetails: () => void = () => {};
  export let onShowTransfers: () => void = () => {};
  export let onSendNudge: () => void | Promise<void> = () => {};
  export let onOpenTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onCopyAttachmentFiles: (fileList: string) => void | Promise<void> = () => {};
  export let onRetryMessage: (message: ChatMessage) => void | Promise<void> = () => {};
  export let onTogglePin: () => void | Promise<void> = () => {};
  export let onToggleMute: () => void | Promise<void> = () => {};
  export let onToggleArchive: () => void | Promise<void> = () => {};
  export let onToggleConversationSearch: () => void = () => {};
  export let onOpenConversationDateJump: () => void = () => {};
  export let onConversationSearchQueryChange: (value: string) => void = () => {};
  export let onConversationSearchDateChange: (value: string) => void = () => {};
  export let onRunConversationSearch: () => void | Promise<void> = () => {};
  export let onRunConversationDateJump: () => void | Promise<void> = () => {};
  export let onFocusConversationSearchResult: (message: ChatMessage) => void = () => {};
  export let onClearConversationSearch: () => void = () => {};
  export let onLoadOlderMessages: () => void | Promise<void> = () => {};
  export let onClearReplyQuote: () => void = () => {};
  export let onMessageContext: (message: ChatMessage, event: MouseEvent) => void = () => {};
  export let onReactMessage: (message: ChatMessage, reaction: string) => void | Promise<void> = () => {};
  export let onStartMessageSelection: () => void = () => {};
  export let onToggleMessageSelection: (messageId: string) => void = () => {};
  export let onCancelMessageSelection: () => void = () => {};
  export let onToggleSelectAllMessages: () => void = () => {};
  export let onBulkCopyMessages: () => void | Promise<void> = () => {};
  export let onBulkFavoriteMessages: () => void | Promise<void> = () => {};
  export let onBulkPinMessages: () => void | Promise<void> = () => {};
  export let onBulkTodoMessages: () => void | Promise<void> = () => {};
  export let onBulkForwardMessages: () => void = () => {};
  export let onBulkDeleteMessages: () => void = () => {};
  export let onUnpinPinnedMessage: (message: ChatMessage) => void | Promise<void> = () => {};

  let dragging = false;
  let emojiOpen = false;
  let quickRepliesOpen = false;
  let moreToolsOpen = false;
  let textareaElement: HTMLTextAreaElement | null = null;
  let messageListElement: HTMLDivElement | null = null;
  let conversationSearchInputElement: HTMLInputElement | null = null;
  let conversationSearchDateElement: HTMLInputElement | null = null;
  let composerMenuElement: HTMLDivElement | null = null;
  let composerMenu: { x: number; y: number } | null = null;
  let mentionRange: { start: number; end: number } | null = null;
  let mentionQuery = "";
  let mentionActiveIndex = 0;
  let imagePreview:
    | {
        title: string;
        src: string;
        transferId: string;
        summary: string;
      }
    | null = null;

  const emojiChoices = ["😀", "😂", "👍", "🙏", "🎉", "✅", "🔥", "❤️", "👌", "😅"];
  const explicitLinkSource = String.raw`https?:\/\/[^\s<>"']+`;
  const bareHostSource = String.raw`(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::\d{2,5})?|[a-z][a-z0-9-]{1,62}:\d{2,5})(?:\/[^\s<>"']*)?`;
  const bodyTokenPattern = new RegExp(
    `(${explicitLinkSource}|${bareHostSource})|@([^\\s@,.;:!?，。！？、]{1,64})`,
    "giu"
  );
  const contextMenuInset = 8;
  const hiddenComposerWarnings = new Set(["请先选择一个已发现的联系人", "请先选择一个会话或联系人"]);

  $: conversationActionsDisabled = Boolean(conversationActionsDisabledReason);

  function clampContextMenuPosition(event: MouseEvent, width: number, height: number) {
    return {
      x: Math.max(contextMenuInset, Math.min(event.clientX, Math.max(contextMenuInset, window.innerWidth - width))),
      y: Math.max(contextMenuInset, Math.min(event.clientY, Math.max(contextMenuInset, window.innerHeight - height)))
    };
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (sendDisabledReason) return;
    void onSend();
  }

  function showDetails() {
    if (conversationActionsDisabled) return;
    onShowDetails();
  }

  function togglePin() {
    if (conversationActionsDisabled) return;
    void onTogglePin();
  }

  function toggleMute() {
    if (conversationActionsDisabled) return;
    void onToggleMute();
  }

  function toggleArchive() {
    if (conversationActionsDisabled) return;
    void onToggleArchive();
  }

  function toggleConversationSearch() {
    if (conversationActionsDisabled) return;
    onToggleConversationSearch();
  }

  function openConversationDateJump() {
    if (conversationActionsDisabled) return;
    onOpenConversationDateJump();
  }

  function startMessageSelection() {
    if (conversationActionsDisabled) return;
    onStartMessageSelection();
  }

  function sendNudge() {
    if (sendDisabledReason) return;
    void onSendNudge();
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (mentionRange && mentionCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        mentionActiveIndex = (mentionActiveIndex + 1) % mentionCandidates.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        mentionActiveIndex = (mentionActiveIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(mentionCandidates[mentionActiveIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMentionPanel();
        return;
      }
    }

    const shouldSend =
      event.key === "Enter" &&
      !event.shiftKey &&
      ((sendShortcut === "enter" && !event.ctrlKey && !event.metaKey) ||
        (sendShortcut === "ctrl_enter" && (event.ctrlKey || event.metaKey)));
    if (!shouldSend) return;
    event.preventDefault();
    if (sendDisabledReason) return;
    void onSend();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (fileActionsDisabled) return;
    void onPickFiles(event.dataTransfer?.files ?? null);
  }

  function handlePaste(event: ClipboardEvent) {
    const files = clipboardFilesFromData(event.clipboardData);
    if (files.length > 0) {
      event.preventDefault();
      if (fileActionsDisabled) return;
      void onPickFiles(files);
    }
  }

  function appendEmoji(emoji: string) {
    onDraftChange(`${draft}${emoji}`);
    emojiOpen = false;
    closeMentionPanel();
  }

  function chooseDesktopFiles() {
    if (fileActionsDisabled) return;
    void onChooseDesktopFiles();
  }

  function chooseDesktopFolder() {
    if (fileActionsDisabled) return;
    void onChooseDesktopFolder();
  }

  function sendPendingFiles() {
    if (fileActionsDisabled) return;
    void onSendPendingFiles();
  }

  function startScreenshot() {
    if (fileActionsDisabled) return;
    void onStartScreenshot();
  }

  function sendQuickReply(reply: string) {
    if (sendDisabledReason) return;
    void onSend(reply);
    quickRepliesOpen = false;
    closeMentionPanel();
  }

  function openComposerMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    composerMenu = clampContextMenuPosition(event, 160, 180);
    void tick().then(() => composerMenuElement?.focus());
  }

  async function copySelection(cut = false) {
    const textarea = textareaElement;
    if (!textarea) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (selected) {
      try {
        await navigator.clipboard.writeText(selected);
      } catch {
        composerMenu = null;
        return;
      }
      if (cut && navigator.clipboard) {
        replaceSelection("");
      }
    }
    composerMenu = null;
  }

  async function pasteClipboardText() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      composerMenu = null;
      return;
    }
    if (text) {
      replaceSelection(text);
    }
    composerMenu = null;
  }

  function selectAllDraft() {
    textareaElement?.focus();
    textareaElement?.select();
    composerMenu = null;
  }

  function replaceSelection(value: string) {
    const textarea = textareaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${draft.slice(0, start)}${value}${draft.slice(end)}`;
    onDraftChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + value.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function handleDraftInput(event: Event) {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const value = textarea.value;
    onDraftChange(value);
    updateMentionState(value, textarea.selectionStart);
  }

  function displayMemberName(peer: PeerProfile) {
    return messageSenderLabels[peer.peer_id]?.trim() || peer.display_name || peer.hostname || peer.peer_id;
  }

  function updateMentionState(value: string, cursor: number) {
    if (!isGroup) {
      closeMentionPanel();
      return;
    }
    const prefix = value.slice(0, cursor);
    const match = /(?:^|\s)@([^\s@]{0,24})$/.exec(prefix);
    if (!match) {
      closeMentionPanel();
      return;
    }
    const query = match[1] ?? "";
    mentionRange = { start: cursor - query.length - 1, end: cursor };
    mentionQuery = query;
    mentionActiveIndex = 0;
  }

  function closeMentionPanel() {
    mentionRange = null;
    mentionQuery = "";
    mentionActiveIndex = 0;
  }

  function closeComposerOverlays() {
    composerMenu = null;
    emojiOpen = false;
    quickRepliesOpen = false;
    moreToolsOpen = false;
    closeMentionPanel();
  }

  function insertMention(candidate: MentionCandidate) {
    const textarea = textareaElement;
    if (!textarea || !mentionRange) return;
    const current = textarea.value;
    const mention = `@${candidate.insertText} `;
    const next = `${current.slice(0, mentionRange.start)}${mention}${current.slice(mentionRange.end)}`;
    const cursor = mentionRange.start + mention.length;
    onDraftChange(next);
    closeMentionPanel();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeComposerOverlays();
      closeImagePreview();
      if (conversationSearchOpen) {
        onToggleConversationSearch();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (!conversationSearchOpen && !conversationActionsDisabled) {
        onToggleConversationSearch();
      }
    }
  }

  function focusConversationSearchInput() {
    void tick().then(() => {
      if (conversationSearchFocus === "date") {
        conversationSearchDateElement?.focus();
      } else {
        conversationSearchInputElement?.focus();
      }
    });
  }

  function focusConversationSearchOffset(offset: number) {
    const total = conversationSearchResults.length;
    if (total === 0) return;
    const currentIndex = focusedSearchResultIndex >= 0 ? focusedSearchResultIndex : offset > 0 ? -1 : 0;
    const nextIndex = (currentIndex + offset + total) % total;
    onFocusConversationSearchResult(conversationSearchResults[nextIndex]);
  }

  function formatTime(value: number) {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function conversationPreviewText() {
    const draftPreview = conversation?.draft_preview?.trim();
    if (draftPreview) return `草稿：${draftPreview}`;
    const messagePreview = conversation?.last_message_preview?.trim();
    if (messagePreview) return messagePreview;
    if (!conversation) return "从左侧选择会话或联系人";
    return isGroup ? "群聊已就绪，可以继续本机 fanout 直连沟通。" : "直连通道已就绪，等待第一条消息。";
  }

  function conversationMetaText() {
    if (isGroup) return `${memberCount} 位成员 · 本机 fanout`;
    return activePeer?.endpoints[0] ?? activePeer?.hostname ?? "等待局域网发现";
  }

  function conversationTimeText() {
    const lastMessageAt = conversation?.last_message_at ?? 0;
    if (!lastMessageAt) return conversation?.unread_count ? `${conversation.unread_count} 条未读` : "尚无历史消息";
    return `${formatDateDivider(lastMessageAt)} ${formatTime(lastMessageAt)}`;
  }

  function dayKey(value: number) {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function formatDateDivider(value: number) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(value) === dayKey(today.getTime())) return "今天";
    if (dayKey(value) === dayKey(yesterday.getTime())) return "昨天";
    const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${weekday}`;
  }

  function shouldShowDateDivider(message: ChatMessage, index: number) {
    if (index === 0) return true;
    const previous = messages[index - 1];
    return !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
  }

  function statusLabel(status: ChatMessage["status"]) {
    return {
      queued: "排队",
      sending: "发送中",
      delivered: "已送达",
      read: "已读",
      failed: "失败",
      received: "已接收"
    }[status];
  }

  function attemptLabel(message: ChatMessage) {
    if (message.sender_id !== selfPeerId || !["queued", "sending", "failed"].includes(message.status)) return "";
    const attempts = Math.max(0, message.send_attempts ?? 0);
    if (attempts === 0) return "等待首次发送";
    return `已尝试 ${attempts} 次`;
  }

  function senderLabel(senderId: string) {
    if (senderId === selfPeerId) return "我";
    return messageSenderLabels[senderId]?.trim() || senderId;
  }

  function matchesMentionQuery(peer: PeerProfile, query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [displayMemberName(peer), peer.display_name, peer.hostname, peer.peer_id]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  }

  function matchesAllMentionQuery(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return ["所有人", "全体成员", "all", "everyone"].some((label) => label.toLowerCase().includes(needle));
  }

  function memberMentionCandidate(peer: PeerProfile): MentionCandidate {
    const label = displayMemberName(peer);
    return {
      id: `member:${peer.peer_id}`,
      label,
      meta: peer.hostname || peer.peer_id,
      insertText: label
    };
  }

  function selfMentionNames() {
    return mentionNamesForSelf(selfPeerId, selfDisplayName, messageSenderLabels);
  }

  function isSelfMention(text: string) {
    const name = text.replace(/^@/, "").trim().toLowerCase();
    return selfMentionNames().has(name);
  }

  function splitTrailingUrlPunctuation(value: string) {
    let url = value;
    let trailing = "";
    while (url.length > 0) {
      const char = url[url.length - 1];
      if (!/[),.;:!?，。！？、]/.test(char)) break;
      if (char === ")" && balancedClosingParen(url)) break;
      trailing = char + trailing;
      url = url.slice(0, -1);
    }
    return url ? { url, trailing } : { url: value, trailing: "" };
  }

  function balancedClosingParen(value: string) {
    const opens = (value.match(/\(/g) ?? []).length;
    const closes = (value.match(/\)/g) ?? []).length;
    return opens >= closes;
  }

  function shouldUseLinkMatch(body: string, index: number, value: string) {
    if (/^https?:\/\//i.test(value)) return true;
    const previous = index > 0 ? body[index - 1] : "";
    return previous !== "@" && !/[A-Za-z0-9._-]/.test(previous);
  }

  function normalizedLinkHref(value: string) {
    return /^https?:\/\//i.test(value) ? value : `http://${value}`;
  }

  function firstLinkPreview(body: string) {
    bodyTokenPattern.lastIndex = 0;
    for (const match of body.matchAll(bodyTokenPattern)) {
      if (!match[1]) continue;
      if (!shouldUseLinkMatch(body, match.index ?? 0, match[0])) continue;
      const { url } = splitTrailingUrlPunctuation(match[0]);
      const href = normalizedLinkHref(url);
      try {
        const parsed = new URL(href);
        const path = `${parsed.pathname}${parsed.search}`;
        return {
          href,
          host: parsed.hostname.replace(/^www\./i, ""),
          path: path && path !== "/" ? (path.length > 96 ? `${path.slice(0, 96)}...` : path) : "首页",
          protocol: parsed.protocol.replace(":", "").toUpperCase()
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  function messageBodySegments(body: string) {
    const segments: Array<{ text: string; kind: "text" | "mention" | "link"; selfMention: boolean; href?: string }> = [];
    bodyTokenPattern.lastIndex = 0;
    let cursor = 0;
    for (const match of body.matchAll(bodyTokenPattern)) {
      const index = match.index ?? 0;
      const text = match[0];
      if (match[1] && !shouldUseLinkMatch(body, index, text)) {
        continue;
      }
      if (index > cursor) {
        segments.push({ text: body.slice(cursor, index), kind: "text", selfMention: false });
      }
      if (match[1]) {
        const { url, trailing } = splitTrailingUrlPunctuation(text);
        segments.push({ text: url, kind: "link", selfMention: false, href: normalizedLinkHref(url) });
        if (trailing) {
          segments.push({ text: trailing, kind: "text", selfMention: false });
        }
      } else {
        segments.push({ text, kind: "mention", selfMention: isSelfMention(text) });
      }
      cursor = index + text.length;
    }
    if (cursor < body.length) {
      segments.push({ text: body.slice(cursor), kind: "text", selfMention: false });
    }
    return segments.length > 0 ? segments : [{ text: body, kind: "text", selfMention: false }];
  }

  function shouldShowSenderLabel(message: ChatMessage) {
    return isGroup && message.sender_id !== selfPeerId && !message.recalled;
  }

  function canRetryMessage(message: ChatMessage) {
    return message.sender_id === selfPeerId && ["queued", "failed"].includes(message.status) && !message.recalled;
  }

  function retryActionLabel(message: ChatMessage) {
    return message.status === "queued" ? "立即重试" : "重新发送";
  }

  function fileName(path: string) {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  }

  function isImagePath(path: string) {
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(path.trim());
  }

  function imageFileForManifest(manifest: TransferManifest) {
    if (manifest.files.length !== 1) return null;
    const file = manifest.files[0];
    return isImagePath(file.path) ? file : null;
  }

  function imageSrc(path: string) {
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  }

  function attachmentFileList(attachment: MessageAttachment) {
    return attachment.manifest.files
      .map((file) => (file.relative_path?.trim() || fileName(file.path) || "未命名文件").trim())
      .filter(Boolean)
      .join("\n");
  }

  function messageAttachmentSummary(message: ChatMessage) {
    const files = message.attachments
      .filter((attachment) => attachment.type === "transfer")
      .flatMap((attachment) =>
        attachment.manifest.files.map((file) =>
          (file.relative_path?.trim() || fileName(file.path) || "未命名文件").trim()
        )
      )
      .filter(Boolean);
    if (files.length === 0) return message.attachments.length > 0 ? "附件消息" : "空消息";
    if (files.length === 1) return `文件：${files[0]}`;
    return `文件：${files.slice(0, 3).join("、")}${files.length > 3 ? ` 等 ${files.length} 个` : ""}`;
  }

  function messageSearchPreview(message: ChatMessage) {
    if (message.recalled) return "消息已撤回";
    const body = message.body.trim();
    return body || messageAttachmentSummary(message);
  }

  function copyAttachmentFiles(attachment: MessageAttachment) {
    const fileList = attachmentFileList(attachment);
    if (!fileList) return;
    void onCopyAttachmentFiles(fileList);
  }

  function openImagePreview(attachment: MessageAttachment) {
    const file = imageFileForManifest(attachment.manifest);
    if (!file) return;
    const title = fileName(file.path);
    imagePreview = {
      title,
      src: imageSrc(file.path),
      transferId: attachment.manifest.transfer_id,
      summary: `${formatBytes(file.size)} · ${attachment.manifest.transfer_id}`
    };
  }

  function closeImagePreview() {
    imagePreview = null;
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function transferTaskFor(transferId: string) {
    return transferTaskById.get(transferId) ?? null;
  }

  function transferProgress(task: TransferTask | null, totalBytes: number) {
    const total = Math.max(task?.totalBytes ?? totalBytes, 0);
    if (total <= 0) return 0;
    const sent = Math.max(0, Math.min(task?.sentBytes ?? 0, total));
    return Math.min(100, Math.round((sent / total) * 100));
  }

  function transferProgressLabel(task: TransferTask | null, totalBytes: number) {
    const total = Math.max(task?.totalBytes ?? totalBytes, 0);
    const sent = Math.max(0, Math.min(task?.sentBytes ?? 0, total));
    return `${formatBytes(sent)} / ${formatBytes(total)}`;
  }

  function transferStatusLabel(task: TransferTask | null) {
    if (!task) return "等待传输";
    const normalized = task.status.toLowerCase();
    if (normalized === "indexed" || normalized === "queued") return "等待传输";
    if (normalized === "sending" || normalized === "downloading") return "传输中";
    if (normalized === "downloaded" || normalized === "delivered") return "已完成";
    if (normalized === "failed") return "失败";
    if (normalized === "cancelled" || normalized === "canceled") return "已取消";
    return task.status || "未知";
  }

  function selectionPreview(message: ChatMessage) {
    const text = message.recalled
      ? "已撤回"
      : message.body.trim() || (message.attachments.length > 0 ? `${message.attachments.length} 个附件` : "空消息");
    return text.length > 18 ? `${text.slice(0, 18)}...` : text;
  }

  function transferStatusTone(task: TransferTask | null) {
    if (!task) return "waiting";
    const normalized = task.status.toLowerCase();
    if (normalized === "failed") return "failed";
    if (normalized === "cancelled" || normalized === "canceled") return "canceled";
    if (normalized === "downloaded" || normalized === "delivered") return "done";
    return "active";
  }

  function pendingFileSizeLabel() {
    const knownBytes = pendingFileDrafts.reduce((sum, item) => sum + (item.size ?? 0), 0);
    const hasUnknownBytes = pendingFileDrafts.some((item) => item.size == null);
    if (knownBytes === 0 && hasUnknownBytes) return "大小待索引";
    return `${formatBytes(knownBytes)}${hasUnknownBytes ? "+" : ""}`;
  }

  function isClipboardImageDraft(item: PendingFileDraft) {
    const name = item.name.toLowerCase();
    return item.sourceLabel.includes("剪贴板") && /\.(png|jpe?g|webp|gif|bmp)$/.test(name);
  }

  function pendingFileSourceLabel(item: PendingFileDraft) {
    if (item.directory) return "文件夹";
    if (isClipboardImageDraft(item)) return "截图/图片";
    return item.sourceLabel;
  }

  function reactionGroups(message: ChatMessage) {
    const groups = new Map<string, { reaction: string; count: number; active: boolean }>();
    for (const item of message.reactions ?? []) {
      const current = groups.get(item.reaction) ?? { reaction: item.reaction, count: 0, active: false };
      current.count += 1;
      current.active = current.active || item.sender_id === selfPeerId;
      groups.set(item.reaction, current);
    }
    return Array.from(groups.values());
  }

  function scrollFocusedMessage(messageId: string) {
    if (!messageId || typeof document === "undefined") return;
    const escaped = messageId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    window.setTimeout(() => {
      document.querySelector(`[data-message-id="${escaped}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }

  function scrollMessageListToEnd() {
    if (!messageListElement || messages.length === 0) return;
    window.setTimeout(() => {
      const list = messageListElement;
      if (!list) return;
      if (typeof list.scrollTo === "function") {
        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      } else {
        list.scrollTop = list.scrollHeight;
      }
    }, 0);
  }

  function shouldShowComposerWarning(value: string) {
    const warning = value.trim();
    return Boolean(warning) && !hiddenComposerWarnings.has(warning);
  }

  $: peerAvailabilityLabel = activePeer?.status === "online" ? "可联系" : "暂不可达";
  $: peerPresenceAriaLabel = `${title} ${peerAvailabilityLabel}`;
  $: headerScopeLabel = isGroup ? "群聊 · 无服务器 fanout" : "直连会话 · 无中间服务器";
  $: composerScopeLabel = isGroup ? `群聊 · ${memberCount} 位成员` : "直连会话";
  $: emptyConversationPreview = conversationPreviewText();
  $: emptyConversationMeta = conversationMetaText();
  $: emptyConversationTime = conversationTimeText();
  $: latestMessageScrollKey = `${messages.length}:${messages[messages.length - 1]?.id ?? ""}`;
  $: if (latestMessageScrollKey) scrollMessageListToEnd();
  $: composerWarnings = Array.from(new Set([sendDisabledReason, fileActionsDisabledReason].filter(shouldShowComposerWarning)));
  $: pendingFileCountLabel = pendingFileDrafts.length === 1 ? "1 个文件" : `${pendingFileDrafts.length} 个文件`;
  $: transferTaskById = new Map(transferTasks.map((task) => [task.id, task]));
  $: focusedSearchResultIndex = conversationSearchResults.findIndex((result) => result.id === focusedMessageId);
  $: selectedMessageCount = selectedMessageIds.length;
  $: selectedMessageIdSet = new Set(selectedMessageIds);
  $: pinnedMessageIdSet = new Set(pinnedMessages.map((message) => message.id));
  $: todoMessageIdSet = new Set(todoMessages.map((message) => message.id));
  $: allLoadedMessagesSelected = messages.length > 0 && messages.every((message) => selectedMessageIdSet.has(message.id));
  $: memberMentionCandidates = mentionableMembers
    .filter((peer) => peer.peer_id !== selfPeerId)
    .filter((peer) => matchesMentionQuery(peer, mentionQuery))
    .slice(0, 8)
    .map(memberMentionCandidate);
  $: allMentionCandidate = matchesAllMentionQuery(mentionQuery)
    ? [{ id: "all", label: "所有人", meta: "提醒当前群聊所有成员", insertText: "所有人" }]
    : [];
  $: mentionCandidates = mentionRange ? [...allMentionCandidate, ...memberMentionCandidates] : [];
  $: if (mentionActiveIndex >= mentionCandidates.length) mentionActiveIndex = 0;
  $: if (mentionRange && mentionCandidates.length === 0) mentionActiveIndex = 0;
  $: conversationSearchSummary = conversationSearchResults.length === 0
    ? conversationSearchQuery.trim() || conversationSearchDate
      ? "暂无匹配结果"
      : "输入关键词或选择日期定位聊天记录"
    : `${conversationSearchResults.length} 条结果${focusedSearchResultIndex >= 0 ? `，当前第 ${focusedSearchResultIndex + 1} 条` : ""}`;
  $: groupAnnouncement = isGroup ? conversation?.group_announcement?.trim() ?? "" : "";
  $: if (conversationSearchOpen) {
    conversationSearchFocus;
    focusConversationSearchInput();
  }
  $: scrollFocusedMessage(focusedMessageId);
</script>

<svelte:window
  on:click={closeComposerOverlays}
  on:keydown={handleWindowKeydown}
/>

<section class="chat-workspace" aria-label="聊天工作区">
  <header class="chat-header" role="group" aria-label="会话标题栏">
    <div>
      <span class="eyebrow">{headerScopeLabel}</span>
      <h1>{title}</h1>
      <p>
        {#if isGroup}
          {memberCount} 位成员 · 本机 fanout 直连
        {:else}
          <span class="chat-peer-meta">
            <span>{activePeer?.endpoints[0] ?? "等待局域网发现"}</span>
            <span
              aria-label={peerPresenceAriaLabel}
              class:online={activePeer?.status === "online"}
              class:offline={activePeer?.status !== "online"}
              class="presence-dot"
              title={peerAvailabilityLabel}
            ></span>
          </span>
        {/if}
      </p>
    </div>
  </header>

  {#if groupAnnouncement}
    <section class="group-announcement-banner" aria-label="群公告">
      <Info size={16} />
      <div>
        <strong>群公告</strong>
        <p>{groupAnnouncement}</p>
      </div>
    </section>
  {/if}

  {#if pinnedMessages.length > 0}
    <section class="pinned-message-panel" aria-label="置顶消息">
      <div class="pinned-message-heading">
        <Pin size={15} />
        <strong>置顶消息</strong>
        <span>{pinnedMessages.length}</span>
      </div>
      <div class="pinned-message-list">
        {#each pinnedMessages as pinned (pinned.id)}
          <article class:active={pinned.id === focusedMessageId} class="pinned-message-item">
            <button type="button" on:click={() => onFocusConversationSearchResult(pinned)}>
              <strong>{senderLabel(pinned.sender_id)}</strong>
              <span>{messageSearchPreview(pinned)}</span>
              <small>{formatTime(pinned.created_at)}</small>
            </button>
            <button
              class="icon-button"
              type="button"
              title="取消置顶"
              aria-label={`取消置顶消息 ${pinned.id}`}
              on:click={() => onUnpinPinnedMessage(pinned)}
            >
              <PinOff size={14} />
            </button>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if conversationSearchOpen}
    <section class="conversation-search-panel" aria-label="会话内搜索">
      <form
        class="conversation-search-bar"
        on:submit={(event) => {
          event.preventDefault();
          void onRunConversationSearch();
        }}
      >
        <Search size={15} />
        <input
          bind:this={conversationSearchInputElement}
          value={conversationSearchQuery}
          placeholder="搜索当前会话"
          on:input={(event) => onConversationSearchQueryChange((event.currentTarget as HTMLInputElement).value)}
        />
        <button type="submit">
          <Search size={13} />
          搜索
        </button>
        <button type="button" disabled={!conversationSearchQuery && !conversationSearchDate && conversationSearchResults.length === 0} on:click={onClearConversationSearch}>
          <X size={13} />
          清空搜索
        </button>
        <button class="icon-button" type="button" title="关闭搜索" on:click={onToggleConversationSearch}>
          <X size={15} />
        </button>
      </form>
      <div class="conversation-date-jump">
        <CalendarDays size={15} />
        <input
          aria-label="按日期跳转聊天记录"
          bind:this={conversationSearchDateElement}
          type="date"
          value={conversationSearchDate}
          on:input={(event) => onConversationSearchDateChange((event.currentTarget as HTMLInputElement).value)}
        />
        <button type="button" disabled={!conversationSearchDate} on:click={onRunConversationDateJump}>
          <CalendarDays size={13} />
          跳转日期
        </button>
      </div>
      <div class="conversation-search-summary-row">
        <div class="conversation-search-summary" role="status">{conversationSearchSummary}</div>
        <div class="conversation-search-nav" role="group" aria-label="搜索结果导航">
          <button
            type="button"
            disabled={conversationSearchResults.length === 0}
            on:click={() => focusConversationSearchOffset(-1)}
          >
            <ChevronUp size={13} />
            上一个
          </button>
          <button
            type="button"
            disabled={conversationSearchResults.length === 0}
            on:click={() => focusConversationSearchOffset(1)}
          >
            <ChevronDown size={13} />
            下一个
          </button>
        </div>
      </div>
      {#if conversationSearchResults.length > 0}
        <div class="conversation-search-results">
          {#each conversationSearchResults as result (result.id)}
            <button
              class:active={result.id === focusedMessageId}
              type="button"
              on:click={() => onFocusConversationSearchResult(result)}
            >
              <strong>{senderLabel(result.sender_id)}</strong>
              <span>{messageSearchPreview(result)}</span>
              <small>{formatTime(result.created_at)}</small>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if notice}
    <div class="chat-notice" role="status">{notice}</div>
  {/if}

  {#if typingText}
    <div class="typing-indicator" role="status">{typingText}</div>
  {/if}

  <div bind:this={messageListElement} class="message-list" aria-live="polite">
    {#if messageSelectionMode}
      <section class="bulk-message-bar" aria-label="消息多选工具栏">
        <div>
          <CheckSquare size={16} />
          <strong>已选择 {selectedMessageCount} 条消息</strong>
        </div>
        <div class="bulk-message-actions">
          <button type="button" disabled={messages.length === 0} on:click={onToggleSelectAllMessages}>
            <CheckSquare size={14} />
            {allLoadedMessagesSelected ? "取消全选" : "全选"}
          </button>
          <button type="button" disabled={selectedMessageCount === 0} on:click={onBulkCopyMessages}>
            <Copy size={14} />
            复制
          </button>
          <button type="button" disabled={selectedMessageCount === 0} on:click={onBulkFavoriteMessages}>
            <Star size={14} />
            收藏
          </button>
          <button type="button" disabled={selectedMessageCount === 0} on:click={onBulkTodoMessages}>
            <CheckSquare size={14} />
            待办
          </button>
          <button type="button" disabled={selectedMessageCount === 0} on:click={onBulkPinMessages}>
            <Pin size={14} />
            置顶
          </button>
          <button type="button" disabled={selectedMessageCount === 0} on:click={onBulkForwardMessages}>
            <UploadCloud size={14} />
            转发
          </button>
          <button class="danger" type="button" disabled={selectedMessageCount === 0} on:click={onBulkDeleteMessages}>
            <Trash2 size={14} />
            删除
          </button>
          <button type="button" on:click={onCancelMessageSelection}>
            <X size={14} />
            取消
          </button>
        </div>
      </section>
    {/if}

    {#if hasMoreMessages}
      <button class="load-history-button" type="button" disabled={loadingOlderMessages} on:click={onLoadOlderMessages}>
        {loadingOlderMessages ? "加载中..." : "加载更早消息"}
      </button>
    {/if}
    {#each messages as message, index (message.id)}
      {#if shouldShowDateDivider(message, index)}
        {@const dividerLabel = formatDateDivider(message.created_at)}
        <div class="message-date-divider" role="separator" aria-label={`聊天日期 ${dividerLabel}`}>
          <span>{dividerLabel}</span>
        </div>
      {/if}
      <div
        class:mine={message.sender_id === selfPeerId}
        class:selection-mode={messageSelectionMode}
        class:selected={selectedMessageIds.includes(message.id)}
        class="message-row"
      >
        {#if messageSelectionMode}
          <label class="message-select-control">
            <input
              aria-label={`选择消息 ${message.id}`}
              type="checkbox"
              checked={selectedMessageIds.includes(message.id)}
              on:change={() => onToggleMessageSelection(message.id)}
            />
            <span>{selectionPreview(message)}</span>
          </label>
        {/if}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <article
          class:mine={message.sender_id === selfPeerId}
          class:recalled={message.recalled}
          class:focused={message.id === focusedMessageId}
          class="message-bubble"
          data-message-id={message.id}
          on:click={() => {
            if (messageSelectionMode) onToggleMessageSelection(message.id);
          }}
          on:contextmenu={(event) => onMessageContext(message, event)}
        >
          {#if message.recalled}
            <p class="recalled-copy">{message.sender_id === selfPeerId ? "你撤回了一条消息" : "对方撤回了一条消息"}</p>
          {:else}
            {@const linkPreview = firstLinkPreview(message.body)}
            {#if shouldShowSenderLabel(message)}
              <header class="message-author">{senderLabel(message.sender_id)}</header>
            {/if}
            {#if message.quote}
              <blockquote class="message-quote">
                <strong>{senderLabel(message.quote.sender_id)}</strong>
                <span>{message.quote.body_preview}</span>
              </blockquote>
            {/if}
            {#if message.body.trim()}
              <p class="message-body">
                {#each messageBodySegments(message.body) as segment}
                  {#if segment.kind === "link"}
                    <a
                      class="message-link"
                      href={segment.href ?? segment.text}
                      target="_blank"
                      rel="noreferrer"
                      on:click|stopPropagation
                    >
                      {segment.text}
                    </a>
                  {:else if segment.kind === "mention"}
                    <span class:self-mention={segment.selfMention} class="message-mention">{segment.text}</span>
                  {:else}
                    <span>{segment.text}</span>
                  {/if}
                {/each}
              </p>
            {/if}
            {#if linkPreview}
              <a
                class="link-preview-card"
                href={linkPreview.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`打开链接 ${linkPreview.href}`}
                on:click|stopPropagation
              >
                <span class="link-preview-icon"><ExternalLink size={16} /></span>
                <span class="link-preview-copy">
                  <strong>{linkPreview.host}</strong>
                  <small>{linkPreview.protocol} · {linkPreview.path}</small>
                </span>
              </a>
            {/if}
            {#if message.attachments.length > 0}
              <div class="attachment-stack" aria-label="消息附件">
                {#each message.attachments as attachment (attachment.manifest.transfer_id)}
                  {#if attachment.type === "transfer"}
                    {@const attachmentTitle = attachment.manifest.files.length === 1
                      ? fileName(attachment.manifest.files[0].path)
                      : `${attachment.manifest.files.length} 个文件`}
                    {@const imageFile = imageFileForManifest(attachment.manifest)}
                    {@const transferTask = transferTaskFor(attachment.manifest.transfer_id)}
                    {@const attachmentProgress = transferProgress(transferTask, attachment.manifest.total_bytes)}
                    <article
                      class:image-attachment-card={Boolean(imageFile)}
                      class="attachment-card"
                      aria-label={`附件 ${attachmentTitle}`}
                    >
                      {#if imageFile}
                        <button
                          class="attachment-image-thumb"
                          type="button"
                          aria-label={`预览图片 ${attachmentTitle}`}
                          on:click|stopPropagation={() => openImagePreview(attachment)}
                        >
                          <img src={imageSrc(imageFile.path)} alt={attachmentTitle} loading="lazy" />
                        </button>
                      {:else}
                        <UploadCloud size={18} />
                      {/if}
                      <div class="attachment-copy">
                        <strong>{attachmentTitle}</strong>
                        <span class="attachment-summary">
                          {formatBytes(attachment.manifest.total_bytes)}
                          {#if attachment.manifest.files.length > 1}
                            · {attachment.manifest.files.slice(0, 3).map((file) => fileName(file.path)).join("、")}
                          {/if}
                        </span>
                        <div class="attachment-status-row">
                          <span class={`attachment-status-badge ${transferStatusTone(transferTask)}`}>
                            {transferStatusLabel(transferTask)}
                          </span>
                          <span>{transferProgressLabel(transferTask, attachment.manifest.total_bytes)}</span>
                        </div>
                        {#if transferTask?.errorMessage}
                          <span class="attachment-error" title={transferTask.errorMessage}>{transferTask.errorMessage}</span>
                        {/if}
                        <div
                          class="attachment-progress"
                          role="progressbar"
                          aria-label={`${attachmentTitle} 传输进度`}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-valuenow={attachmentProgress}
                        >
                          <span style={`width: ${attachmentProgress}%`}></span>
                        </div>
                    </div>
                    <div class="attachment-actions">
                      {#if imageFile}
                        <button class="attachment-action" type="button" on:click|stopPropagation={() => openImagePreview(attachment)}>
                          <Image size={13} />
                          预览
                        </button>
                      {/if}
                      <button class="attachment-action" type="button" on:click|stopPropagation={() => copyAttachmentFiles(attachment)}>
                        <Copy size={13} />
                        复制清单
                      </button>
                      <button class="attachment-action" type="button" on:click={() => onOpenTransfer(attachment.manifest.transfer_id)}>
                        <ExternalLink size={13} />
                        打开
                      </button>
                      <button class="attachment-action" type="button" on:click={onShowTransfers}>
                        <UploadCloud size={13} />
                        传输
                      </button>
                    </div>
                    </article>
                  {/if}
                {/each}
              </div>
            {/if}
            {@const reactions = reactionGroups(message)}
            {#if reactions.length > 0}
              <div class="reaction-strip" aria-label="消息回应">
                {#each reactions as item (item.reaction)}
                  <button
                    class:active={item.active}
                    class="reaction-chip"
                    type="button"
                    aria-label={`回应 ${item.reaction}，${item.count} 人`}
                    title={`切换回应 ${item.reaction}`}
                    on:click={() => onReactMessage(message, item.reaction)}
                  >
                    <span>{item.reaction}</span>
                    <b>{item.count}</b>
                  </button>
                {/each}
              </div>
            {/if}
            <footer>
              <span>{formatTime(message.created_at)}</span>
              {#if message.favorited}<span class="favorite-mark"><Star size={12} /> 收藏</span>{/if}
              {#if todoMessageIdSet.has(message.id)}<span class="todo-mark"><CheckSquare size={12} /> 待办</span>{/if}
              {#if pinnedMessageIdSet.has(message.id)}<span class="pinned-mark"><Pin size={12} /> 置顶</span>{/if}
              <span>{statusLabel(message.status)}</span>
              {#if attemptLabel(message)}<span class="attempt-mark">{attemptLabel(message)}</span>{/if}
              {#if canRetryMessage(message)}
                <button
                  class:danger={message.status === "failed"}
                  class="message-inline-action"
                  type="button"
                  on:click|stopPropagation={() => onRetryMessage(message)}
                >
                  <RefreshCw size={12} />
                  {retryActionLabel(message)}
                </button>
              {/if}
            </footer>
          {/if}
        </article>
      </div>
    {:else}
      {#if conversation}
        <section class="empty-chat conversation-overview-empty" aria-label="会话概览">
          <div class="empty-chat-icon">
            {#if isGroup}<Users size={26} />{:else}<ShieldCheck size={26} />{/if}
          </div>
          <div class="empty-chat-copy">
            <span class="eyebrow">{headerScopeLabel}</span>
            <strong>{conversation.title || title}</strong>
            <span>{emptyConversationMeta}</span>
          </div>
          <article class="latest-message-frame" aria-label="最近消息预览">
            <div>
              <FileText size={16} />
              <span>{conversation.draft_preview ? "未发送草稿" : "最近消息"}</span>
            </div>
            <p>{emptyConversationPreview}</p>
            <small>{emptyConversationTime}</small>
          </article>
          <div class="empty-chat-actions" role="group" aria-label="会话快捷操作">
            <button type="button" on:click={showDetails}>
              <Info size={14} />
              详情
            </button>
            <button type="button" on:click={onShowTransfers}>
              <UploadCloud size={14} />
              传输
            </button>
          </div>
        </section>
      {:else}
        <div class="empty-chat">
          <ShieldCheck size={28} />
          <strong>选择左侧会话</strong>
          <span>在线联系人出现后可直接开始聊天。</span>
        </div>
      {/if}
    {/each}
  </div>

  <form
    class:dragging
    class="composer"
    on:submit={submit}
    on:paste={handlePaste}
    on:dragenter|preventDefault={() => (dragging = !fileActionsDisabled)}
    on:dragover|preventDefault
    on:dragleave={() => (dragging = false)}
    on:drop={handleDrop}
  >
    {#if composerMenu}
      <div
        bind:this={composerMenuElement}
        class="composer-edit-menu"
        style={`left: ${composerMenu.x}px; top: ${composerMenu.y}px;`}
        role="menu"
        aria-label="输入框编辑菜单"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={(event) => {
          if (event.key === "Escape") composerMenu = null;
        }}
      >
        <button type="button" role="menuitem" on:click={() => copySelection(false)}>
          <Copy size={14} />
          复制
        </button>
        <button type="button" role="menuitem" on:click={() => copySelection(true)}>
          <Scissors size={14} />
          剪切
        </button>
        <button type="button" role="menuitem" on:click={pasteClipboardText}>
          <Clipboard size={14} />
          粘贴
        </button>
        <button type="button" role="menuitem" on:click={selectAllDraft}>
          <MousePointer2 size={14} />
          全选
        </button>
      </div>
    {/if}

    {#if replyQuote}
      <div class="reply-preview">
        <div>
          <strong>引用回复 · {senderLabel(replyQuote.sender_id)}</strong>
          <span>{replyQuote.body_preview}</span>
        </div>
        <button class="row-action" type="button" on:click={onClearReplyQuote} title="取消引用">
          <X size={13} />
          取消
        </button>
      </div>
    {/if}

    {#if pendingFileDrafts.length > 0}
      <section class="pending-file-tray" aria-label="待发送文件">
        <header>
          <div>
            <strong>{pendingFileCountLabel}</strong>
            <span>{pendingFileSizeLabel()}</span>
          </div>
          <div class="pending-file-actions">
            <button type="button" on:click={onClearPendingFiles}>
              <Trash2 size={13} />
              清空
            </button>
            <button
              class="primary-mini"
              type="button"
              title={fileActionsDisabled ? fileActionsDisabledReason : "发送待发送文件"}
              disabled={fileActionsDisabled}
              on:click={sendPendingFiles}
            >
              <Send size={13} />
              发送
            </button>
          </div>
        </header>
        <div class="pending-file-list" role="list">
          {#each pendingFileDrafts as item (item.id)}
            <article class="pending-file-item" role="listitem" aria-label={`待发送 ${item.name}`}>
              {#if item.directory}
                <Folder size={15} />
              {:else if isClipboardImageDraft(item)}
                <Image size={15} />
              {:else}
                <Paperclip size={15} />
              {/if}
              <div>
                <strong>{item.name}</strong>
                <span>
                  {pendingFileSourceLabel(item)}
                  {#if item.size != null}
                    · {formatBytes(item.size)}
                  {/if}
                </span>
              </div>
              <button type="button" title={`移除 ${item.name}`} on:click={() => onRemovePendingFile(item.id)}>
                <X size={14} />
              </button>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <div class="composer-context-row" aria-label="发送状态">
      <span class="composer-context-pill" class:group={isGroup}>
        <ShieldCheck size={13} />
        {#if !isGroup}
          <span
            aria-label={peerPresenceAriaLabel}
            class:online={activePeer?.status === "online"}
            class:offline={activePeer?.status !== "online"}
            class="presence-dot mini"
            title={peerAvailabilityLabel}
          ></span>
        {/if}
        {composerScopeLabel}
      </span>
      {#each composerWarnings as warning}
        <span class="composer-context-pill warning-pill">
          <Info size={13} />
          {warning}
        </span>
      {/each}
    </div>

    <div class="composer-tools" role="toolbar" aria-label="消息工具栏">
      <div class="toolbar-group" role="group" aria-label="附件工具">
        <button
          class="tool-button composer-tool-button"
          type="button"
          title={fileActionsDisabled ? fileActionsDisabledReason : "发送文件"}
          disabled={fileActionsDisabled}
          on:click={chooseDesktopFiles}
        >
          <FolderOpen size={15} />
          <span class="composer-tool-label">文件</span>
        </button>
        <button
          class="tool-button composer-tool-button"
          type="button"
          title={fileActionsDisabled ? fileActionsDisabledReason : "截图后粘贴发送"}
          disabled={fileActionsDisabled}
          on:click={startScreenshot}
        >
          <Image size={15} />
          <span class="composer-tool-label">截图</span>
        </button>
        <button
          class:active={emojiOpen}
          class="tool-button composer-tool-button"
          type="button"
          title="插入表情"
          on:click={(event) => {
            event.stopPropagation();
            quickRepliesOpen = false;
            moreToolsOpen = false;
            emojiOpen = !emojiOpen;
          }}
        >
          <Smile size={15} />
          <span class="composer-tool-label">表情</span>
        </button>
        {#if quickReplies.length > 0}
          <button
            class:active={quickRepliesOpen}
            class="tool-button composer-tool-button"
            type="button"
            title="快捷回复"
            on:mouseenter={() => {
              emojiOpen = false;
              moreToolsOpen = false;
              quickRepliesOpen = true;
            }}
            on:click={(event) => {
              event.stopPropagation();
              emojiOpen = false;
              moreToolsOpen = false;
              quickRepliesOpen = !quickRepliesOpen;
            }}
          >
            <Send size={15} />
            <span class="composer-tool-label">快捷回复</span>
          </button>
        {/if}
        <button
          class:active={moreToolsOpen}
          class="tool-button composer-tool-button"
          type="button"
          title="更多工具"
          on:click={(event) => {
            event.stopPropagation();
            emojiOpen = false;
            quickRepliesOpen = false;
            moreToolsOpen = !moreToolsOpen;
          }}
        >
          <MoreHorizontal size={15} />
          <span class="composer-tool-label">更多</span>
        </button>
      </div>
      {#if moreToolsOpen}
      <div class="toolbar-group toolbar-more-popover" role="group" aria-label="更多消息工具">
        <button
          class="tool-button composer-tool-button"
          type="button"
          title={fileActionsDisabled ? fileActionsDisabledReason : "发送文件夹"}
          disabled={fileActionsDisabled}
          on:click={chooseDesktopFolder}
        >
          <Folder size={15} />
          <span class="composer-tool-label">文件夹</span>
        </button>
        <button
          class="tool-button composer-tool-button"
          type="button"
          title="抖一抖提醒对方"
          disabled={Boolean(sendDisabledReason)}
          on:click={sendNudge}
        >
          <BellRing size={15} />
          <span class="composer-tool-label">抖一抖</span>
        </button>
        <button
          class="tool-button composer-tool-button"
          type="button"
          title={conversationActionsDisabledReason || "搜索当前会话"}
          disabled={conversationActionsDisabled}
          on:click={toggleConversationSearch}
        >
          <Search size={15} />
          <span class="composer-tool-label">搜索</span>
        </button>
        <button
          class="tool-button composer-tool-button"
          type="button"
          title={conversationActionsDisabledReason || "按日期跳转聊天记录"}
          disabled={conversationActionsDisabled}
          on:click={openConversationDateJump}
        >
          <CalendarDays size={15} />
          <span class="composer-tool-label">日期</span>
        </button>
        <button
          class:active={messageSelectionMode}
          class="tool-button composer-tool-button"
          type="button"
          title={conversationActionsDisabledReason || "多选消息"}
          disabled={conversationActionsDisabled}
          on:click={startMessageSelection}
        >
          <CheckSquare size={15} />
          <span class="composer-tool-label">多选</span>
        </button>
        <button class="tool-button composer-tool-button" type="button" title="传输列表" on:click={onShowTransfers}>
          <FileText size={15} />
          <span class="composer-tool-label">传输</span>
        </button>
        {#if conversation}
          <button
            class:active={conversation.pinned}
            class="tool-button composer-tool-button"
            type="button"
            title={conversationActionsDisabledReason || (conversation.pinned ? "取消置顶" : "置顶会话")}
            disabled={conversationActionsDisabled}
            on:click={togglePin}
          >
            {#if conversation.pinned}<PinOff size={15} /><span class="composer-tool-label">取消置顶</span>{:else}<Pin size={15} /><span class="composer-tool-label">置顶</span>{/if}
          </button>
          <button
            class:active={conversation.muted}
            class="tool-button composer-tool-button"
            type="button"
            title={conversationActionsDisabledReason || (conversation.muted ? "取消免打扰" : "免打扰")}
            disabled={conversationActionsDisabled}
            on:click={toggleMute}
          >
            {#if conversation.muted}<Volume2 size={15} /><span class="composer-tool-label">取消免扰</span>{:else}<BellOff size={15} /><span class="composer-tool-label">免打扰</span>{/if}
          </button>
          <button
            class:active={conversation.archived}
            class="tool-button composer-tool-button"
            type="button"
            title={conversationActionsDisabledReason || (conversation.archived ? "取消归档" : "归档会话")}
            disabled={conversationActionsDisabled}
            on:click={toggleArchive}
          >
            <Archive size={15} />
            <span class="composer-tool-label">{conversation.archived ? "取消归档" : "归档"}</span>
          </button>
        {/if}
        <button
          class="tool-button composer-tool-button"
          type="button"
          title={conversationActionsDisabledReason || (isGroup ? "群成员与会话详情" : "会话详情")}
          disabled={conversationActionsDisabled}
          on:click={showDetails}
        >
          {#if isGroup}
            <Users size={15} />
            <span class="composer-tool-label">成员</span>
          {:else}
            <Info size={15} />
            <span class="composer-tool-label">详情</span>
          {/if}
        </button>
      </div>
      {/if}
      <span class="composer-drop-hint">
        <Paperclip size={14} />
        拖拽或粘贴文件/图片到输入区
      </span>
    </div>

    {#if quickRepliesOpen && quickReplies.length > 0}
      <div class="quick-reply-menu" role="menu" aria-label="快捷回复" tabindex="-1" on:mouseenter={() => (quickRepliesOpen = true)}>
        {#each quickReplies as reply}
          <button
            class="quick-reply-option"
            type="button"
            role="menuitem"
            title={sendDisabledReason || reply}
            disabled={Boolean(sendDisabledReason)}
            on:click={() => sendQuickReply(reply)}
          >
            <Send size={12} />
            {reply}
          </button>
        {/each}
      </div>
    {/if}

    {#if emojiOpen}
      <div class="emoji-panel" role="menu" aria-label="表情选择器">
        {#each emojiChoices as emoji}
          <button type="button" role="menuitem" title={`插入 ${emoji}`} on:click={() => appendEmoji(emoji)}>{emoji}</button>
        {/each}
      </div>
    {/if}

    {#if mentionRange && mentionCandidates.length > 0}
      <div class="mention-panel" role="listbox" aria-label="群成员提醒">
        {#each mentionCandidates as candidate, index (candidate.id)}
          <button
            class:active={index === mentionActiveIndex}
            type="button"
            role="option"
            aria-selected={index === mentionActiveIndex}
            on:mousedown|preventDefault
            on:click={() => insertMention(candidate)}
          >
            <strong>{candidate.label}</strong>
            <small>{candidate.meta}</small>
          </button>
        {/each}
      </div>
    {/if}

    <div class="composer-input-row">
      <textarea
        bind:this={textareaElement}
        rows="2"
        value={draft}
        placeholder="输入消息"
        on:contextmenu={openComposerMenu}
        on:input={handleDraftInput}
        on:keydown={handleComposerKeydown}
      ></textarea>
      <button class="send-button" type="submit" title={sendDisabledReason || "发送"} disabled={Boolean(sendDisabledReason)}>
        <Send size={18} />
      </button>
    </div>
  </form>

  {#if imagePreview}
    <div class="image-preview-backdrop" role="presentation" on:click={closeImagePreview}>
      <div
        class="image-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={(event) => {
          if (event.key === "Escape") closeImagePreview();
        }}
      >
        <header>
          <div>
            <strong>{imagePreview.title}</strong>
            <small>{imagePreview.summary}</small>
          </div>
          <button class="icon-button" type="button" title="关闭图片预览" aria-label="关闭图片预览" on:click={closeImagePreview}>
            <X size={16} />
          </button>
        </header>
        <div class="image-preview-stage">
          <img src={imagePreview.src} alt={imagePreview.title} />
        </div>
        <footer>
          <button class="row-action" type="button" on:click={() => onOpenTransfer(imagePreview?.transferId ?? "")}>
            <FolderOpen size={13} />
            打开所在目录
          </button>
          <button class="row-action" type="button" on:click={closeImagePreview}>
            <X size={13} />
            关闭
          </button>
        </footer>
      </div>
    </div>
  {/if}
</section>
