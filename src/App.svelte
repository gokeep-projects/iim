<script lang="ts">
  import { onMount, tick } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { isPermissionGranted, onAction, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
  import Rail, { type Section } from "./components/Rail.svelte";
  import ConversationList from "./components/ConversationList.svelte";
  import ChatWorkspace from "./components/ChatWorkspace.svelte";
  import Inspector from "./components/Inspector.svelte";
  import WorkspacePanel from "./components/WorkspacePanel.svelte";
  import Archive from "lucide-svelte/icons/archive";
  import Ban from "lucide-svelte/icons/ban";
  import BellOff from "lucide-svelte/icons/bell-off";
  import CheckCheck from "lucide-svelte/icons/check-check";
  import CheckCircle2 from "lucide-svelte/icons/check-circle-2";
  import CheckSquare from "lucide-svelte/icons/check-square";
  import Copy from "lucide-svelte/icons/copy";
  import FileText from "lucide-svelte/icons/file-text";
  import HardDrive from "lucide-svelte/icons/hard-drive";
  import Info from "lucide-svelte/icons/info";
  import MessageSquareText from "lucide-svelte/icons/message-square-text";
  import Minimize2 from "lucide-svelte/icons/minimize-2";
  import Palette from "lucide-svelte/icons/palette";
  import Pin from "lucide-svelte/icons/pin";
  import PinOff from "lucide-svelte/icons/pin-off";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Reply from "lucide-svelte/icons/reply";
  import Scissors from "lucide-svelte/icons/scissors";
  import Send from "lucide-svelte/icons/send";
  import Settings from "lucide-svelte/icons/settings";
  import ShieldCheck from "lucide-svelte/icons/shield-check";
  import Star from "lucide-svelte/icons/star";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UploadCloud from "lucide-svelte/icons/upload-cloud";
  import UserRound from "lucide-svelte/icons/user-round";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import X from "lucide-svelte/icons/x";
  import {
    conversationDisplayTitle,
    directConversationPeer,
    forwardTargetConversations,
    markAllConversationsReadInList,
    markConversationReadInList,
    markConversationUnreadInList,
    sortConversationSummaries,
    updateConversationStatusPreview,
    visibleUnreadCount,
    type ConversationFilter
  } from "./conversationState";
  import {
    editableSelectionText,
    editableTextElementFromTarget,
    replaceEditableSelection,
    type EditableTextElement
  } from "./editableText";
  import { groupFileTransferBlockReason, incomingConversationPolicy, outgoingConversationBlockReason } from "./conversationPolicy";
  import { removeTypingIndicatorsForPeer, typingIndicatorKeysForPeer } from "./typingState";
  import { replaceMessageInList, syncFavoriteMessageList, syncOutboxMessageList, syncPinnedMessageList, syncTodoMessageList, upsertMessageInList } from "./messageCollections";
  import {
    type ChatMessage,
    type AppPreferences,
    type AppShortcuts,
    type ScreenshotShortcut,
    type SendShortcut,
    type WindowShortcut,
    type ContactMetadata,
    type ConversationDraft,
    type ConversationSummary,
    type MessageDeliveryReceipt,
    type MessageQuote,
    type NetworkSettings,
    type NudgeEvent,
    type PeerProfile,
    type PeerStatus,
    type PendingFileDraft,
    type StorageOverview,
    type StorageMigrationProgress,
    type TransportConfig,
    type TrustedPeer,
    type TypingEvent,
    type TransferManifest,
    type TransferTask,
    cancelTransfer,
    clearConversationMessages,
    clearStagedFiles,
    clearCompletedTransfers,
    createGroup,
    deleteConversation,
    deleteMessage,
    deleteTransfer,
    exportConversationHistory,
    forwardMessage,
    defaultAppShortcuts,
    defaultTransportConfig,
    getNetworkSettings,
    getSelfProfile,
    getStorageOverview,
    getTransportConfig,
    listContactMetadata,
    listConversations,
    listConversationMessagesBetween,
    listGroupMembers,
    listMessages,
    listMessageDeliveryReceipts,
    listOutboxMessages,
    listPeers,
    listTransfers,
    markAllConversationsRead,
    markConversationRead,
    markConversationUnread,
    minimizeToTray,
    migrateStorageDirectory,
    showMainWindow,
    openStorageLocation,
    openTransferLocation,
    retryMessage,
    restartApp,
    resumeTransfer,
    getConversationDraft,
    getAppPreferences,
    saveConversationDraft,
    listFavoriteMessages,
    listPinnedMessages,
    listTodoMessages,
    listTrustedPeers,
    removeTrustedPeer,
    revokeMessage,
    setMessageFavorite,
    setMessagePin,
    setMessageTodo,
    setMessageReaction,
    searchMessages,
    searchConversationMessages,
    sendFiles,
    sendNudge,
    sendText,
    sendTyping,
    stageClipboardFiles,
    startScreenCapture,
    trustPeer,
    updateContactMetadata,
    updateAppPreferences,
    updateConversationPreferences,
    updateGroup,
    updateNetworkSettings,
    updateSelfProfile
  } from "./api";
  import { messageNotificationOptions, notificationConversationId, notificationPreviewEnabled } from "./notification";
  import { validateNetworkInputs, validateNetworkTiming } from "./networkValidation";
  import { messageMentionsSelf } from "./messageMentions";

  type InspectorTab = "details" | "transfers" | "network" | "security" | "members" | "storage";
  type SettingsTab = "profile" | "network" | "storage" | "security" | "preferences";
  type TypingIndicator = TypingEvent & { expires_at: number };
  type MessageMenuState = {
    x: number;
    y: number;
    message: ChatMessage;
  };
  type ConversationMenuState = {
    x: number;
    y: number;
    conversation: ConversationSummary;
  };
  type ContactMenuState = {
    x: number;
    y: number;
    peer: PeerProfile;
  };
  type TransferMenuState = {
    x: number;
    y: number;
    task: TransferTask;
  };
  type AppMenuState = {
    x: number;
    y: number;
  };
  type TextEditMenuState = {
    x: number;
    y: number;
    element: EditableTextElement;
  };
  type ConfirmDialogState = {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  };

  const defaultSettings: NetworkSettings = {
    auto_discovery: true,
    multicast: true,
    seed_peers: [],
    scan_ranges: [],
    discovery_interval_secs: 3,
    peer_ttl_secs: 15
  };

  const quickReplies = ["收到", "稍后处理", "请发一下文件", "我这边已完成"];
  const quickReactions = ["👍", "❤️", "😂", "👌"];
  const settingsTabs: SettingsTab[] = ["profile", "network", "storage", "security", "preferences"];
  const screenshotNotice = "已启动系统截图，完成后可直接粘贴到聊天框发送。";
  const messagePageSize = 200;
  const hasTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const contextMenuInset = 8;
  const previewPeer: PeerProfile = {
    peer_id: "demo-peer",
    display_name: "产品经理",
    hostname: "pm-workstation",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.42:24251"],
    fingerprint: "d".repeat(64),
    public_key: Array(32).fill(13)
  };
  const previewOpsPeer: PeerProfile = {
    peer_id: "demo-ops",
    display_name: "运维中控",
    hostname: "ops-console",
    avatar_hash: null,
    status: "offline",
    endpoints: ["192.168.1.99:24251"],
    fingerprint: "e".repeat(64),
    public_key: Array(32).fill(14)
  };
  const previewConversations: ConversationSummary[] = [
    {
      id: "direct:demo-peer",
      title: "产品经理",
      group_owner_peer_id: "",
      last_message_at: Date.now(),
      last_message_preview: "欢迎使用灵犀内网通，搜索、文件和群聊入口都在这里。",
      unread_count: 1,
      manual_unread: false,
      pinned: true,
      muted: false,
      archived: false,
      draft_preview: ""
    },
    {
      id: "direct:demo-ops",
      title: "运维中控",
      group_owner_peer_id: "",
      last_message_at: Date.now() - 90000,
      last_message_preview: "192.168.1.99 暂不可达，刷新后会自动更新状态。",
      unread_count: 0,
      manual_unread: false,
      pinned: false,
      muted: false,
      archived: false,
      draft_preview: ""
    }
  ];

  function clampContextMenuPosition(event: MouseEvent, width: number, height: number) {
    return {
      x: Math.max(contextMenuInset, Math.min(event.clientX, Math.max(contextMenuInset, window.innerWidth - width))),
      y: Math.max(contextMenuInset, Math.min(event.clientY, Math.max(contextMenuInset, window.innerHeight - height)))
    };
  }

  function focusContextMenuAfterRender() {
    void tick().then(() => {
      clampRenderedContextMenu();
      contextMenuElement?.focus();
    });
  }

  function clampRenderedContextMenu() {
    const element = contextMenuElement;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.offsetWidth;
    const height = rect.height || element.offsetHeight;
    const currentLeft = Number.parseFloat(element.style.left || `${rect.left}`);
    const currentTop = Number.parseFloat(element.style.top || `${rect.top}`);
    if (!Number.isFinite(currentLeft) || !Number.isFinite(currentTop)) return;
    const maxLeft = Math.max(contextMenuInset, window.innerWidth - width - contextMenuInset);
    const maxTop = Math.max(contextMenuInset, window.innerHeight - height - contextMenuInset);
    element.style.left = `${Math.max(contextMenuInset, Math.min(currentLeft, maxLeft))}px`;
    element.style.top = `${Math.max(contextMenuInset, Math.min(currentTop, maxTop))}px`;
  }

  function handleContextMenuKeydown(event: KeyboardEvent, close: () => void) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menu = event.currentTarget as HTMLElement;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = 0;
    if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "ArrowDown") {
      nextIndex = activeIndex >= 0 ? (activeIndex + 1) % items.length : 0;
    } else {
      nextIndex = activeIndex >= 0 ? (activeIndex - 1 + items.length) % items.length : items.length - 1;
    }
    items[nextIndex]?.focus();
  }

  let activeSection: Section = "messages";
  let self: PeerProfile | null = null;
  let peers: PeerProfile[] = [];
  let contactMetadata: Record<string, ContactMetadata> = {};
  let savedContactPeerIds = new Set<string>();
  let focusedContactPeerId = "";
  let conversations: ConversationSummary[] = [];
  let activeConversation = "";
  let conversationFilter: ConversationFilter = "active";
  let messages: ChatMessage[] = [];
  let hasMoreMessages = false;
  let loadingOlderMessages = false;
  let searchResults: ChatMessage[] = [];
  let conversationSearchOpen = false;
  let conversationSearchFocus: "query" | "date" = "query";
  let conversationSearchQuery = "";
  let conversationSearchDate = "";
  let conversationSearchResults: ChatMessage[] = [];
  let focusedMessageId = "";
  let nudgePulseKey = 0;
  let mentionedConversationIds: string[] = [];
  let favoriteMessages: ChatMessage[] = [];
  let pinnedMessages: ChatMessage[] = [];
  let todoMessages: ChatMessage[] = [];
  let outboxMessages: ChatMessage[] = [];
  let draft = "";
  let query = "";
  let settings = defaultSettings;
  let dark = false;
  let sendShortcut: AppPreferences["send_shortcut"] = "enter";
  let appShortcuts: AppShortcuts = { ...defaultAppShortcuts };
  let showNotificationPreview = true;
  let privacyMode = false;
  let closeToTray = true;
  let loginEnabled = false;
  let loginPasswordHash = "";
  let loginPasswordDraft = "";
  let loginPasswordConfirmDraft = "";
  let loginUnlockDraft = "";
  let loginUnlockError = "";
  let appLocked = false;
  let profileSignature = "";
  let avatarLabel = "";
  let requireContactForMessaging = false;
  let inspectorTab: InspectorTab = "details";
  let inspectorOpen = false;

  const profileMenuStatusChoices: Array<{ value: PeerStatus; label: string; tone: "online" | "away" | "offline" }> = [
    { value: "online", label: "在线", tone: "online" },
    { value: "away", label: "离开", tone: "away" },
    { value: "offline", label: "隐身", tone: "offline" }
  ];
  let settingsTab: SettingsTab = "profile";
  let seedText = "";
  let rangeText = "";
  let discoveryIntervalText = "3";
  let peerTtlText = "15";
  let transportConfig: TransportConfig = defaultTransportConfig;
  let selectedPeerIds: string[] = [];
  let activeGroupMemberIds: string[] = [];
  let groupNameDraft = "";
  let groupAnnouncementDraft = "";
  let groupMemberDraftIds: string[] = [];
  let transferTasks: TransferTask[] = [];
  let pendingFileDrafts: PendingFileDraft[] = [];
  let notificationReady = false;
  let networkWarning = "";
  let networkWarnings: string[] = [];
  let networkInputWarning = "";
  let statusText = "";
  let chatNotice = "";
  let trustStatus = "";
  let trayStatus = "窗口保持前台运行";
  let profileName = "";
  let profileHostname = "";
  let profileStatus: PeerStatus = "online";
  let storageOverview: StorageOverview | null = null;
  let storageMigrationProgress: StorageMigrationProgress | null = null;
  let storageMigrationActive = false;
  let trustedPeers: TrustedPeer[] = [];
  let messageMenu: MessageMenuState | null = null;
  let conversationMenu: ConversationMenuState | null = null;
  let contactMenu: ContactMenuState | null = null;
  let transferMenu: TransferMenuState | null = null;
  let appMenu: AppMenuState | null = null;
  let textEditMenu: TextEditMenuState | null = null;
  let contextMenuElement: HTMLDivElement | null = null;
  let confirmDialog: ConfirmDialogState | null = null;
  let detailMessage: ChatMessage | null = null;
  let messageDeliveryReceipts: MessageDeliveryReceipt[] = [];
  let messageDeliveryReceiptsLoading = false;
  let messageDetailStatus = "";
  let forwardingMessage: ChatMessage | null = null;
  let forwardingMessages: ChatMessage[] = [];
  let forwardQuery = "";
  let replyQuote: MessageQuote | null = null;
  let messageSelectionMode = false;
  let selectedMessageIds: string[] = [];
  let typingIndicators: Record<string, TypingIndicator> = {};
  let typingTimers: Record<string, number> = {};
  let demoReplyTimers: number[] = [];
  let lastTypingSentAt = 0;
  let draftSaveTimer: number | null = null;
  let pendingNotificationConversationId = "";
  let bootstrapping = true;
  let bootProgress = 8;
  let bootLabel = "正在启动直连核心";

  $: activeConversationSummary = conversations.find((conversation) => conversation.id === activeConversation) ?? null;
  $: activePeer = activeConversation.startsWith("group:")
    ? null
    : activeConversationSummary
      ? directConversationPeer(activeConversationSummary, peers)
      : peers.find((peer) => activeConversation.includes(peer.peer_id)) ?? peers[0] ?? null;
  $: activeConversationTitle = activeConversation.startsWith("group:")
    ? conversations.find((conversation) => conversation.id === activeConversation)?.title ?? "内网群聊"
    : activePeer
      ? displayPeerName(activePeer)
      : "等待联系人";
  $: activeGroupMembers = activeConversation.startsWith("group:")
    ? [
        ...(self && activeGroupMemberIds.includes(self.peer_id) ? [self] : []),
        ...peers.filter((peer) => activeGroupMemberIds.includes(peer.peer_id))
      ]
    : [];
  $: activeGroupMemberCount = activeConversation.startsWith("group:") ? activeGroupMemberIds.length : activeGroupMembers.length;
  $: activeGroupOwnerPeerId = activeConversationSummary?.group_owner_peer_id?.trim() ?? "";
  $: activeGroupCanManage = !activeConversation.startsWith("group:")
    || !activeGroupOwnerPeerId
    || activeGroupOwnerPeerId === self?.peer_id;
  $: messageSenderLabels = {
    ...(self ? { [self.peer_id]: "我" } : {}),
    ...Object.fromEntries(peers.map((peer) => [peer.peer_id, displayPeerName(peer)]))
  };
  $: conversationTitleMap = Object.fromEntries(
    conversations.map((conversation) => [conversation.id, conversationDisplayTitle(conversation, peers, contactMetadata)])
  );
  $: welcomeRecentConversation =
    [...conversations].filter((conversation) => !conversation.archived).sort((left, right) => right.last_message_at - left.last_message_at)[0] ??
    conversations[0] ??
    null;
  $: welcomeRecentTitle = welcomeRecentConversation
    ? conversationDisplayTitle(welcomeRecentConversation, peers, contactMetadata)
    : "";
  $: welcomeRecentPreview = welcomeRecentConversation ? welcomeConversationPreview(welcomeRecentConversation) : "";
  $: welcomeRecentTime = welcomeRecentConversation ? welcomeConversationTime(welcomeRecentConversation) : "";
  $: todoConversationCounts = todoMessages.reduce<Record<string, number>>((counts, message) => {
    counts[message.conversation_id] = (counts[message.conversation_id] ?? 0) + 1;
    return counts;
  }, {});
  $: outboxConversationCounts = outboxMessages.reduce<Record<string, number>>((counts, message) => {
    counts[message.conversation_id] = (counts[message.conversation_id] ?? 0) + 1;
    return counts;
  }, {});
  $: failedOutboxConversationCounts = outboxMessages.reduce<Record<string, number>>((counts, message) => {
    if (message.status === "failed") {
      counts[message.conversation_id] = (counts[message.conversation_id] ?? 0) + 1;
    }
    return counts;
  }, {});
  $: activeRecipientPeerIds = activeConversation.startsWith("group:")
    ? activeGroupMemberIds.filter((peerId) => peerId !== self?.peer_id)
    : activePeer
      ? [activePeer.peer_id]
      : [];
  $: blockedPeerIds = new Set(Object.values(contactMetadata).filter((metadata) => metadata.blocked).map((metadata) => metadata.peer_id));
  $: discoveredPeerIds = new Set(peers.map((peer) => peer.peer_id));
  $: publicKeyPeerIds = new Set(peers.filter((peer) => peer.public_key && peer.public_key.length > 0).map((peer) => peer.peer_id));
  $: noActiveConversationReason = activeConversation ? "" : "请先选择一个会话或联系人";
  $: outgoingBlockReason = noActiveConversationReason || (
    activeConversation
      ? outgoingConversationBlockReason({
          conversationId: activeConversation,
          recipientPeerIds: activeRecipientPeerIds,
          blockedPeerIds,
          contactPeerIds: savedContactPeerIds,
          requireContactForMessaging
        })
      : ""
  );
  $: fileTransferBlockReason = fileTransferUnavailableReason({
    conversationId: activeConversation,
    peer: activePeer,
    groupMemberIds: activeGroupMemberIds,
    selfPeerId: self?.peer_id ?? "",
    discoveredPeerIds,
    publicKeyPeerIds,
    blockedPeerIds,
    outgoingReason: outgoingBlockReason
  });
  $: fileActionsDisabled = Boolean(fileTransferBlockReason);
  $: activeTypingNames = Object.values(typingIndicators)
    .filter((item) => item.conversation_id === activeConversation && item.active && item.expires_at > Date.now())
    .map((item) => item.display_name);
  $: typingText =
    activeTypingNames.length === 0
      ? ""
      : activeTypingNames.length === 1
        ? `${activeTypingNames[0]} 正在输入...`
        : `${activeTypingNames.slice(0, 2).join("、")} 等 ${activeTypingNames.length} 人正在输入...`;
  $: typingPreviewByConversation = buildTypingPreviewByConversation(typingIndicators);
  $: forwardTargets = forwardTargetConversations(conversations, peers, contactMetadata, forwardQuery);
  $: selectedMessages = messages.filter((message) => selectedMessageIds.includes(message.id));
  $: selectedForwardableMessages = selectedMessages.filter((message) => !message.recalled);
  $: forwardingMessageList = forwardingMessages.length > 0
    ? forwardingMessages
    : forwardingMessage
      ? [forwardingMessage]
      : [];
  $: forwardingTitle = forwardingMessageList.length > 1 ? `转发 ${forwardingMessageList.length} 条消息` : "选择会话";
  $: totalUnreadCount = visibleUnreadCount(conversations);
  $: reachablePeerCount = peers.filter((peer) => peer.status === "online").length;
  $: unavailablePeerCount = peers.length - reachablePeerCount;
  $: pendingOutboxCount = outboxMessages.filter((message) => message.status === "queued" || message.status === "failed").length;
  $: welcomeSignalText = networkWarning || (reachablePeerCount > 0 ? "局域网直连通道可用" : "正在等待同网段设备");
  $: displaySelfName = profileName.trim() || self?.display_name || "本机用户";
  $: railAvatarLabel = avatarLabel.trim() || Array.from(displaySelfName)[0] || "灵";
  $: profileStatusText = profileStatus === "online" ? "在线" : profileStatus === "away" ? "离开" : "隐身";
  $: loginPasswordReady = !loginEnabled || (loginPasswordDraft.length >= 4 && loginPasswordDraft === loginPasswordConfirmDraft);
  $: showMessageShell = activeSection === "messages";
  $: showInspector = showMessageShell && Boolean(activeConversation) && (inspectorOpen || activeConversation.startsWith("group:"));
  $: networkInputValidation = validateNetworkInputs(seedText, rangeText);
  $: networkTimingValidation = validateNetworkTiming(
    discoveryIntervalText,
    peerTtlText,
    settings.discovery_interval_secs,
    settings.peer_ttl_secs
  );
  $: networkInputWarning = [networkInputValidation.warning, networkTimingValidation.warning].filter(Boolean).join("；");

  onMount(() => {
    void bootstrap();
    const handleDocumentContextMenu = (event: MouseEvent) => {
      const editable = editableTextElementFromTarget(event.target);
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          ".context-menu, .modal-backdrop, .message-detail-dialog, .forward-dialog, .image-preview-backdrop, .image-preview-dialog"
        )
      ) {
        return;
      }
      event.preventDefault();
      messageMenu = null;
      conversationMenu = null;
      contactMenu = null;
      transferMenu = null;
      if (!editable) {
        textEditMenu = null;
        return;
      }
      appMenu = null;
      textEditMenu = {
        ...clampContextMenuPosition(event, 170, 180),
        element: editable
      };
      focusContextMenuAfterRender();
    };
    const closeContextMenu = () => {
      messageMenu = null;
      conversationMenu = null;
      contactMenu = null;
      transferMenu = null;
      appMenu = null;
      textEditMenu = null;
    };
    const handleDocumentKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        messageMenu = null;
        conversationMenu = null;
        contactMenu = null;
        transferMenu = null;
        appMenu = null;
        textEditMenu = null;
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        messageMenu = null;
        conversationMenu = null;
        contactMenu = null;
        transferMenu = null;
        appMenu = null;
        textEditMenu = null;
        openSettings("profile");
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        messageMenu = null;
        conversationMenu = null;
        contactMenu = null;
        transferMenu = null;
        appMenu = null;
        textEditMenu = null;
        if (activeConversation) {
          conversationSearchOpen = true;
          conversationSearchFocus = "query";
        }
      }
    };
    document.addEventListener("contextmenu", handleDocumentContextMenu);
    document.addEventListener("click", closeContextMenu);
    document.addEventListener("keydown", handleDocumentKeydown);
    return () => {
      document.removeEventListener("contextmenu", handleDocumentContextMenu);
      document.removeEventListener("click", closeContextMenu);
      document.removeEventListener("keydown", handleDocumentKeydown);
      demoReplyTimers.forEach((timer) => clearTimeout(timer));
      demoReplyTimers = [];
    };
  });

  function normalizeAppShortcuts(preferences: AppPreferences): AppShortcuts {
    const requested = preferences.shortcuts ?? defaultAppShortcuts;
    const sendMessage: SendShortcut =
      preferences.send_shortcut === "ctrl_enter" || requested.send_message === "ctrl_enter" ? "ctrl_enter" : "enter";
    const screenshot: ScreenshotShortcut =
      requested.screenshot === "ctrl_shift_a" || requested.screenshot === "none" ? requested.screenshot : "ctrl_alt_a";
    const toggleWindow: WindowShortcut =
      requested.toggle_window === "ctrl_shift_i" || requested.toggle_window === "none" ? requested.toggle_window : "ctrl_alt_i";
    return {
      send_message: sendMessage,
      screenshot,
      toggle_window: toggleWindow,
    };
  }

  function normalizeAppPreferences(preferences: AppPreferences): AppPreferences {
    const shortcuts = normalizeAppShortcuts(preferences);
    return {
      dark_mode: preferences.dark_mode,
      send_shortcut: shortcuts.send_message,
      shortcuts,
      show_notification_preview: preferences.privacy_mode ? false : preferences.show_notification_preview,
      privacy_mode: preferences.privacy_mode,
      close_to_tray: preferences.close_to_tray,
      login_enabled: Boolean(preferences.login_enabled && preferences.login_password_hash),
      login_password_hash: preferences.login_password_hash ?? "",
      profile_signature: preferences.profile_signature ?? "",
      avatar_label: preferences.avatar_label ?? "",
      require_contact_for_messaging: Boolean(preferences.require_contact_for_messaging)
    };
  }

  function currentAppPreferences(patch: Partial<AppPreferences> = {}): AppPreferences {
    return normalizeAppPreferences({
      dark_mode: dark,
      send_shortcut: sendShortcut,
      shortcuts: appShortcuts,
      show_notification_preview: showNotificationPreview,
      privacy_mode: privacyMode,
      close_to_tray: closeToTray,
      login_enabled: loginEnabled,
      login_password_hash: loginPasswordHash,
      profile_signature: profileSignature,
      avatar_label: avatarLabel,
      require_contact_for_messaging: requireContactForMessaging,
      ...patch
    });
  }

  async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  onMount(() => {
    if (!hasTauriRuntime()) return;

    let disposed = false;
    let unlisteners: Array<() => void> = [];

    void Promise.all([
      listen<ChatMessage>("message:received", (event) => {
        handleIncomingMessage(event.payload);
      }),
      listen<ConversationSummary>("conversation:upserted", (event) => {
        conversations = upsertConversationSummary(event.payload);
        if (event.payload.id === activeConversation && event.payload.id.startsWith("group:")) {
          void listGroupMembers(event.payload.id).then((members) => {
            activeGroupMemberIds = members;
          });
        }
        statusText = `已同步会话：${event.payload.title}`;
      }),
      listen<PeerProfile>("peer:upserted", (event) => {
        peers = upsertPeer(peers, event.payload);
      }),
      listen<PeerProfile>("peer:offline", (event) => {
        peers = peers.map((peer) =>
          peer.peer_id === event.payload.peer_id ? { ...peer, status: "offline" } : peer
        );
        clearTypingIndicatorsForPeer(event.payload.peer_id);
      }),
      listen<ChatMessage>("message:status_changed", (event) => {
        if (event.payload.conversation_id === activeConversation) {
          messages = messages.map((message) => (message.id === event.payload.id ? event.payload : message));
        }
        conversations = updateConversationStatusPreview(conversations, event.payload, messagePreview(event.payload));
        favoriteMessages = syncFavoriteMessageList(favoriteMessages, event.payload);
        pinnedMessages = syncPinnedMessageList(
          pinnedMessages,
          event.payload,
          pinnedMessages.some((message) => message.id === event.payload.id)
        );
        todoMessages = syncTodoMessageList(
          todoMessages,
          event.payload,
          todoMessages.some((message) => message.id === event.payload.id)
        );
        outboxMessages = syncOutboxMessageList(outboxMessages, event.payload);
        searchResults = replaceMessageInList(searchResults, event.payload);
      }),
      listen<Record<string, string | number>>("transfer:progress", (event) => {
        const transferId = String(event.payload.transfer_id ?? `transfer-${Date.now()}`);
        const totalBytes = Number(event.payload.total_bytes ?? 0);
        const sentBytes = Number(event.payload.sent_bytes ?? 0);
        const status = String(event.payload.status ?? "广播中");
        const errorMessage = String(event.payload.error ?? "");
        upsertTransfer({
          id: transferId,
          conversationId: String(event.payload.conversation_id ?? ""),
          name: String(event.payload.file ?? transferId),
          status,
          errorMessage,
          totalBytes,
          sentBytes,
          files: [String(event.payload.file ?? transferId)],
          resumable: false
        });
        if (status === "downloaded") {
          const conversationId = String(event.payload.conversation_id ?? "");
          if (shouldNotifyConversation(conversationId)) {
            notify("文件接收完成", String(event.payload.file ?? "文件"), conversationId);
          }
        }
      }),
      listen<string>("network:warning", (event) => {
        const warning = event.payload.trim();
        networkWarning = warning;
        networkWarnings = [warning, ...networkWarnings.filter((item) => item !== warning)].slice(0, 5);
        statusText = warning;
        settingsTab = inspectorTabForNetworkWarning(warning) === "security" ? "security" : "network";
      }),
      listen<StorageMigrationProgress>("storage:migration_progress", (event) => {
        storageMigrationProgress = event.payload;
        storageMigrationActive = event.payload.phase !== "done";
      }),
      listen<TypingEvent>("typing:changed", (event) => {
        handleTypingChanged(event.payload);
      }),
      listen<NudgeEvent>("nudge:received", (event) => {
        handleNudgeReceived(event.payload);
      }),
      listen<string>("window:tray_status", (event) => {
        trayStatus = event.payload === "hidden" ? "已隐藏到系统托盘" : "窗口已恢复";
        statusText = trayStatus;
        if (event.payload === "visible" && pendingNotificationConversationId) {
          void openNotificationConversation(pendingNotificationConversationId, false);
        }
      }),
      listen<string>("window:open_settings", (event) => {
        openSettings(settingsTabFromEvent(event.payload));
        statusText = "已从托盘打开设置";
      }),
      getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          handleDesktopDragDropPaths(event.payload.paths);
        }
      }),
      onAction((notification) => {
        const conversationId = notificationConversationId(notification) || pendingNotificationConversationId;
        if (conversationId) {
          void openNotificationConversation(conversationId, true);
        }
      })
    ]).then((callbacks) => {
      if (disposed) {
        callbacks.forEach((callback) => {
          if (typeof callback === "function") {
            callback();
          } else {
            void callback.unregister();
          }
        });
      } else {
        unlisteners = callbacks.map((callback) =>
          typeof callback === "function" ? callback : () => void callback.unregister()
        );
      }
    });

    return () => {
      disposed = true;
      unlisteners.forEach((callback) => callback());
      Object.values(typingTimers).forEach((timer) => clearTimeout(timer));
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
    };
  });

  async function bootstrap() {
    bootstrapping = true;
    bootProgress = 12;
    bootLabel = "正在加载本机身份";
    try {
      const [
        profile,
        peerList,
        metadataList,
        conversationList,
        savedSettings,
        savedTransportConfig,
        savedPreferences,
        savedTransfers,
        savedStorage,
        savedTrustedPeers,
        savedTodoMessages,
        savedOutboxMessages
      ] = await Promise.all([
        getSelfProfile(),
        listPeers(),
        listContactMetadata(),
        listConversations(),
        getNetworkSettings(),
        getTransportConfig(),
        getAppPreferences(),
        listTransfers(),
        getStorageOverview(),
        listTrustedPeers(),
        listTodoMessages(),
        listOutboxMessages()
      ]);
      bootProgress = 58;
      bootLabel = "正在整理会话和联系人";
      const shouldSeedPreview = peerList.length === 0 && conversationList.length === 0;
      const effectivePeers = shouldSeedPreview ? [previewPeer, previewOpsPeer] : peerList;
      const effectiveConversations = shouldSeedPreview ? previewConversations : conversationList;
      self = profile;
      profileName = profile.display_name;
      profileHostname = profile.hostname;
      profileStatus = profile.status;
      peers = effectivePeers;
      contactMetadata = Object.fromEntries(metadataList.map((metadata) => [metadata.peer_id, metadata]));
      savedContactPeerIds = new Set(metadataList.map((metadata) => metadata.peer_id));
      conversations = effectiveConversations;
      settings = savedSettings;
      transportConfig = savedTransportConfig ?? defaultTransportConfig;
      const preferences = normalizeAppPreferences(savedPreferences);
      dark = preferences.dark_mode;
      sendShortcut = preferences.send_shortcut;
      appShortcuts = preferences.shortcuts;
      showNotificationPreview = preferences.show_notification_preview;
      privacyMode = preferences.privacy_mode;
      closeToTray = preferences.close_to_tray;
      loginEnabled = preferences.login_enabled;
      loginPasswordHash = preferences.login_password_hash;
      profileSignature = preferences.profile_signature;
      avatarLabel = preferences.avatar_label;
      requireContactForMessaging = preferences.require_contact_for_messaging;
      appLocked = preferences.login_enabled;
      loginUnlockDraft = "";
      loginUnlockError = "";
      seedText = savedSettings.seed_peers.join(" ");
      rangeText = savedSettings.scan_ranges.join(" ");
      discoveryIntervalText = String(savedSettings.discovery_interval_secs);
      peerTtlText = String(savedSettings.peer_ttl_secs);
      transferTasks = savedTransfers;
      storageOverview = savedStorage;
      trustedPeers = savedTrustedPeers;
      todoMessages = savedTodoMessages ?? [];
      outboxMessages = savedOutboxMessages ?? [];
      activeConversation = initialConversationId(effectiveConversations);
      bootProgress = 86;
      bootLabel = activeConversation ? "正在打开最近会话" : "正在准备消息工作台";
      await loadConversation(activeConversation);
      bootProgress = 100;
      bootLabel = "启动完成";
    } catch (error) {
      statusText = `启动失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      bootstrapping = false;
    }
  }

  function initialConversationId(_conversationList: ConversationSummary[]) {
    return "";
  }

  async function refreshPeers() {
    peers = await listPeers();
    statusText = `已刷新联系人：${peers.length} 个设备`;
  }

  async function loadConversation(conversationId: string) {
    if (conversationId !== activeConversation) {
      if (activeConversation) {
        void publishTyping(false);
        await persistDraft(activeConversation);
      }
    }
    activeConversation = conversationId;
    replyQuote = null;
    cancelMessageSelection();
    clearMentionedConversation(conversationId);
    pendingFileDrafts = [];
    activeSection = "messages";
    if (!conversationId) {
      messages = [];
      hasMoreMessages = false;
      inspectorTab = "details";
      inspectorOpen = false;
      conversationSearchOpen = false;
      conversationSearchQuery = "";
      conversationSearchDate = "";
      conversationSearchResults = [];
      focusedMessageId = "";
      pinnedMessages = [];
      activeGroupMemberIds = [];
      groupNameDraft = "";
      groupAnnouncementDraft = "";
      groupMemberDraftIds = [];
      draft = "";
      return;
    }
    const [loadedMessages, pinned, memberIds, savedDraft] = await Promise.all([
      listMessages(conversationId, null, messagePageSize),
      listPinnedMessages(conversationId),
      conversationId.startsWith("group:") ? listGroupMembers(conversationId) : Promise.resolve([]),
      getConversationDraft(conversationId)
    ]);
    messages = loadedMessages ?? [];
    pinnedMessages = pinned ?? [];
    hasMoreMessages = messages.length >= messagePageSize;
    inspectorTab = conversationId.startsWith("group:") ? "members" : "details";
    inspectorOpen = conversationId.startsWith("group:");
    conversationSearchOpen = false;
    conversationSearchQuery = "";
    conversationSearchDate = "";
    conversationSearchResults = [];
    focusedMessageId = "";
    activeGroupMemberIds = memberIds ?? [];
    groupNameDraft = conversationId.startsWith("group:")
      ? conversations.find((conversation) => conversation.id === conversationId)?.title ?? "内网群聊"
      : "";
    groupAnnouncementDraft = conversationId.startsWith("group:")
      ? conversations.find((conversation) => conversation.id === conversationId)?.group_announcement ?? ""
      : "";
    groupMemberDraftIds = memberIds.filter((peerId) => peerId !== self?.peer_id);
    applyDraft(savedDraft);
    try {
      await markConversationRead(conversationId);
      messages = messages.map((message) => (message.status === "received" ? { ...message, status: "read" } : message));
      conversations = markConversationReadInList(conversations, conversationId);
    } catch (error) {
      statusText = `标记会话已读失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function handleSend(text = draft) {
    const body = text.trim();
    if (!body) return;
    if (outgoingBlockReason) {
      statusText = outgoingBlockReason;
      chatNotice = outgoingBlockReason;
      return;
    }

    try {
      const optimistic = await sendText(activeConversation, body, replyQuote);
      upsertMessage(optimistic);
      draft = "";
      replyQuote = null;
      const draftError = await persistDraft(activeConversation);
      if (draftError) {
        statusText = `消息已发送，草稿清理失败：${draftError}`;
      }
      scheduleDemoAutoReply(activeConversation, body);
      void publishTyping(false);
    } catch (error) {
      statusText = `消息发送失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  function scheduleDemoAutoReply(conversationId: string, sentText: string) {
    if (hasTauriRuntime()) return;
    const timer = window.setTimeout(() => {
      demoReplyTimers = demoReplyTimers.filter((item) => item !== timer);
      const senderId = conversationId.startsWith("group:") ? "ops-peer" : conversationId.replace("direct:", "") || "demo-peer";
      handleIncomingMessage({
        id: `preview-reply-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: senderId,
        body: demoAutoReplyText(sentText),
        attachments: [],
        created_at: Date.now(),
        status: "received",
        recalled: false,
        quote: null,
        favorited: false,
        reactions: []
      });
    }, 650);
    demoReplyTimers = [...demoReplyTimers, timer];
  }

  function demoAutoReplyText(sentText: string) {
    if (/文件|资料|附件/.test(sentText)) return "收到，我这边模拟确认一下文件清单。";
    if (/截图|图片/.test(sentText)) return "收到截图了，我这边能正常预览。";
    if (/[?？]/.test(sentText)) return "收到，我这边模拟回复：这个问题可以继续细化。";
    return "收到，我这边已收到你的消息。";
  }

  async function handleSendNudge() {
    if (outgoingBlockReason) {
      statusText = outgoingBlockReason;
      chatNotice = outgoingBlockReason;
      return;
    }
    try {
      await sendNudge(activeConversation);
      statusText = "已发送抖一抖提醒";
      chatNotice = statusText;
      nudgePulseKey += 1;
    } catch (error) {
      statusText = `抖一抖发送失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  async function loadOlderMessages() {
    if (loadingOlderMessages || !hasMoreMessages || messages.length === 0) return;
    loadingOlderMessages = true;
    try {
      const older = await listMessages(activeConversation, messages[0].created_at, messagePageSize);
      const existingIds = new Set(messages.map((message) => message.id));
      messages = [...older.filter((message) => !existingIds.has(message.id)), ...messages];
      hasMoreMessages = older.length >= messagePageSize;
      statusText = older.length > 0 ? `已加载 ${older.length} 条更早消息` : "没有更早的消息";
    } catch (error) {
      statusText = `加载更早消息失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      loadingOlderMessages = false;
    }
  }

  function handleDraftChange(value: string) {
    draft = value;
    scheduleDraftSave();
    void publishTyping(value.trim().length > 0);
  }

  function applyDraft(savedDraft: ConversationDraft | null) {
    draft = savedDraft?.text ?? "";
    replyQuote = savedDraft?.quote ?? null;
  }

  function scheduleDraftSave() {
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
    }
    draftSaveTimer = window.setTimeout(() => {
      draftSaveTimer = null;
      void persistDraft(activeConversation);
    }, 500);
  }

  async function persistDraft(conversationId: string): Promise<string | null> {
    if (!conversationId) return null;
    try {
      const summary = await saveConversationDraft(conversationId, draft, replyQuote);
      if (summary) {
        conversations = upsertConversationSummary(summary);
      } else {
        conversations = conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, draft_preview: draft.trim(), last_message_at: Date.now() }
            : conversation
        );
      }
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      statusText = `草稿保存失败：${reason}`;
      return reason;
    }
  }

  async function publishTyping(active: boolean) {
    if (!activeConversation) return;
    const now = Date.now();
    if (active && now - lastTypingSentAt < 1500) return;
    lastTypingSentAt = active ? now : 0;
    try {
      await sendTyping(activeConversation, active);
    } catch (error) {
      statusText = `输入状态发送失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function typingPreviewText(names: string[]) {
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]} 正在输入...`;
    return `${names.slice(0, 2).join("、")} 等 ${names.length} 人正在输入...`;
  }

  function buildTypingPreviewByConversation(indicators: Record<string, TypingIndicator>) {
    const now = Date.now();
    const namesByConversation: Record<string, string[]> = {};
    for (const item of Object.values(indicators)) {
      if (!item.active || item.expires_at <= now) continue;
      const names = namesByConversation[item.conversation_id] ?? [];
      if (!names.includes(item.display_name)) {
        names.push(item.display_name);
      }
      namesByConversation[item.conversation_id] = names;
    }
    return Object.fromEntries(
      Object.entries(namesByConversation).map(([conversationId, names]) => [conversationId, typingPreviewText(names)])
    );
  }

  function handleTypingChanged(event: TypingEvent) {
    if (contactMetadataFor(event.sender_id).blocked) return;

    const key = `${event.conversation_id}:${event.sender_id}`;
    if (typingTimers[key]) {
      clearTimeout(typingTimers[key]);
      delete typingTimers[key];
    }

    if (!event.active) {
      const { [key]: _removed, ...rest } = typingIndicators;
      typingIndicators = rest;
      return;
    }

    const peer = peers.find((item) => item.peer_id === event.sender_id);
    const displayName = peer ? displayPeerName(peer) : event.display_name || event.sender_id;
    typingIndicators = {
      ...typingIndicators,
      [key]: {
        ...event,
        display_name: displayName,
        expires_at: Date.now() + 4000
      }
    };
    typingTimers[key] = window.setTimeout(() => {
      const current = typingIndicators[key];
      if (!current || current.expires_at > Date.now()) return;
      const { [key]: _expired, ...rest } = typingIndicators;
      typingIndicators = rest;
      delete typingTimers[key];
    }, 4100);
  }

  function handleNudgeReceived(event: NudgeEvent) {
    if (contactMetadataFor(event.sender_id).blocked) return;

    const peer = peers.find((item) => item.peer_id === event.sender_id);
    const displayName = peer ? displayPeerName(peer) : event.display_name || event.sender_id;
    const notice = `${displayName} 给你发来抖一抖提醒`;
    statusText = notice;
    if (event.conversation_id === activeConversation) {
      chatNotice = notice;
      nudgePulseKey += 1;
    } else if (shouldNotifyConversation(event.conversation_id)) {
      notify("抖一抖提醒", notice, event.conversation_id);
    }
  }

  function clearTypingIndicatorsForPeer(peerId: string) {
    for (const key of typingIndicatorKeysForPeer(typingIndicators, peerId)) {
      if (typingTimers[key]) {
        clearTimeout(typingTimers[key]);
      }
      delete typingTimers[key];
    }
    typingIndicators = removeTypingIndicatorsForPeer(typingIndicators, peerId);
  }

  async function refreshMessageCollections() {
    const [favorites = [], todos = [], outbox = []] = await Promise.all([listFavoriteMessages(), listTodoMessages(), listOutboxMessages()]);
    favoriteMessages = favorites;
    todoMessages = todos;
    outboxMessages = outbox;
    return { favorites, todos, outbox };
  }

  async function handleSearch() {
    const needle = query.trim();
    if (!needle) {
      searchResults = [];
      activeSection = "messages";
      return;
    }
    try {
      searchResults = await searchMessages(needle);
      await refreshMessageCollections();
      activeSection = "search";
      statusText = `搜索到 ${searchResults.length} 条记录`;
    } catch (error) {
      searchResults = [];
      activeSection = "search";
      statusText = `搜索失败：${errorMessage(error)}`;
    }
  }

  async function runConversationSearch() {
    const needle = conversationSearchQuery.trim();
    if (!needle) {
      conversationSearchResults = [];
      focusedMessageId = "";
      return;
    }
    try {
      conversationSearchResults = await searchConversationMessages(activeConversation, needle);
      focusedMessageId = conversationSearchResults[0]?.id ?? "";
      statusText = `当前会话搜索到 ${conversationSearchResults.length} 条记录`;
    } catch (error) {
      conversationSearchResults = [];
      focusedMessageId = "";
      statusText = `当前会话搜索失败：${errorMessage(error)}`;
    }
  }

  function conversationDateRange(value: string) {
    const start = new Date(`${value}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { startAt: start.getTime(), endAt: end.getTime() };
  }

  async function jumpConversationDate() {
    const range = conversationDateRange(conversationSearchDate);
    if (!range) {
      conversationSearchResults = [];
      focusedMessageId = "";
      statusText = "请选择要跳转的聊天日期";
      return;
    }
    conversationSearchOpen = true;
    conversationSearchFocus = "date";
    try {
      conversationSearchResults = await listConversationMessagesBetween(activeConversation, range.startAt, range.endAt);
      focusedMessageId = conversationSearchResults[0]?.id ?? "";
      statusText =
        conversationSearchResults.length > 0
          ? `已定位 ${conversationSearchDate} 的 ${conversationSearchResults.length} 条消息`
          : `${conversationSearchDate} 没有聊天记录`;
    } catch (error) {
      conversationSearchResults = [];
      focusedMessageId = "";
      statusText = `日期跳转失败：${errorMessage(error)}`;
    }
  }

  function toggleConversationSearch() {
    conversationSearchFocus = "query";
    conversationSearchOpen = !conversationSearchOpen;
    if (!conversationSearchOpen) {
      clearConversationSearchState();
    }
  }

  function openConversationDateJump() {
    conversationSearchFocus = "date";
    conversationSearchOpen = true;
  }

  async function openSidebarConversationSearch() {
    const targetConversationId = activeConversation || welcomeRecentConversation?.id || conversations.find((conversation) => !conversation.archived)?.id || conversations[0]?.id || "";
    if (targetConversationId && targetConversationId !== activeConversation) {
      await loadConversation(targetConversationId);
    }
    conversationSearchFocus = "query";
    conversationSearchOpen = Boolean(targetConversationId);
  }

  function clearConversationSearchState() {
    conversationSearchQuery = "";
    conversationSearchDate = "";
    conversationSearchResults = [];
    focusedMessageId = "";
  }

  function clearTypingIndicatorsForConversation(conversationId: string) {
    const prefix = `${conversationId}:`;
    const nextIndicators = { ...typingIndicators };
    let changed = false;
    for (const key of Object.keys(nextIndicators)) {
      if (!key.startsWith(prefix)) continue;
      if (typingTimers[key]) {
        clearTimeout(typingTimers[key]);
        delete typingTimers[key];
      }
      delete nextIndicators[key];
      changed = true;
    }
    if (changed) {
      typingIndicators = nextIndicators;
    }
  }

  function clearLocalConversationState(conversationId: string) {
    clearTypingIndicatorsForConversation(conversationId);
    clearMentionedConversation(conversationId);
    searchResults = searchResults.filter((message) => message.conversation_id !== conversationId);
    favoriteMessages = favoriteMessages.filter((message) => message.conversation_id !== conversationId);
    pinnedMessages = pinnedMessages.filter((message) => message.conversation_id !== conversationId);
    todoMessages = todoMessages.filter((message) => message.conversation_id !== conversationId);
    outboxMessages = outboxMessages.filter((message) => message.conversation_id !== conversationId);
    conversationSearchResults = conversationSearchResults.filter((message) => message.conversation_id !== conversationId);
    transferTasks = transferTasks.filter((task) => task.conversationId !== conversationId);
    if (activeConversation === conversationId) {
      clearConversationSearchState();
      pendingFileDrafts = [];
      chatNotice = "";
      activeGroupMemberIds = [];
      groupMemberDraftIds = [];
      groupNameDraft = "";
      groupAnnouncementDraft = "";
    }
  }

  function clearLocalMessageReferences(messageId: string) {
    messages = messages.filter((message) => message.id !== messageId);
    searchResults = searchResults.filter((message) => message.id !== messageId);
    favoriteMessages = favoriteMessages.filter((message) => message.id !== messageId);
    pinnedMessages = pinnedMessages.filter((message) => message.id !== messageId);
    todoMessages = todoMessages.filter((message) => message.id !== messageId);
    outboxMessages = outboxMessages.filter((message) => message.id !== messageId);
    conversationSearchResults = conversationSearchResults.filter((message) => message.id !== messageId);
    if (focusedMessageId === messageId) focusedMessageId = "";
    if (replyQuote?.message_id === messageId) replyQuote = null;
    if (forwardingMessage?.id === messageId) forwardingMessage = null;
    forwardingMessages = forwardingMessages.filter((message) => message.id !== messageId);
    selectedMessageIds = selectedMessageIds.filter((id) => id !== messageId);
    if (selectedMessageIds.length === 0) messageSelectionMode = false;
    if (detailMessage?.id === messageId) {
      detailMessage = null;
      messageDetailStatus = "";
    }
  }

  function messageMentionsLocalUser(message: ChatMessage) {
    return messageMentionsSelf(
      message.body,
      self?.peer_id ?? "",
      self?.display_name ?? "",
      messageSenderLabels,
      message.conversation_id.startsWith("group:")
    );
  }

  function markMentionedConversation(conversationId: string) {
    if (mentionedConversationIds.includes(conversationId)) return;
    mentionedConversationIds = [...mentionedConversationIds, conversationId];
  }

  function clearMentionedConversation(conversationId: string) {
    if (!mentionedConversationIds.includes(conversationId)) return;
    mentionedConversationIds = mentionedConversationIds.filter((id) => id !== conversationId);
  }

  function clearAllMentionedConversations() {
    mentionedConversationIds = [];
  }

  function focusConversationSearchResult(message: ChatMessage) {
    focusedMessageId = message.id;
  }

  async function openMessageResult(message: ChatMessage) {
    try {
      await loadConversation(message.conversation_id);
      messages = messages.some((item) => item.id === message.id)
        ? messages.map((item) => (item.id === message.id ? message : item))
        : [...messages, message].sort((a, b) => a.created_at - b.created_at);
      focusedMessageId = message.id;
      activeSection = "messages";
      statusText = `已定位消息：${conversationTitleFor(message.conversation_id)}`;
    } catch (error) {
      statusText = `定位消息失败：${errorMessage(error)}`;
    }
  }

  async function selectSection(section: Section) {
    if (section === "settings") {
      openSettings("profile");
      return;
    }
    inspectorOpen = false;
    activeSection = section;
    if (section === "search") {
      try {
        await refreshMessageCollections();
      } catch (error) {
        favoriteMessages = [];
        todoMessages = [];
        outboxMessages = [];
        statusText = `消息资料刷新失败：${errorMessage(error)}`;
      }
    }
  }

  function openSettings(tab: SettingsTab) {
    settingsTab = tab;
    inspectorOpen = false;
    activeSection = "settings";
  }

  function settingsTabFromEvent(value: string): SettingsTab {
    return settingsTabs.includes(value as SettingsTab) ? (value as SettingsTab) : "preferences";
  }

  function inspectorTabForNetworkWarning(warning: string): InspectorTab {
    const normalized = warning.toLowerCase();
    if (
      normalized.includes("fingerprint") ||
      normalized.includes("identity rejected") ||
      normalized.includes("signature rejected") ||
      normalized.includes("ack rejected")
    ) {
      return "security";
    }
    return "network";
  }

  async function handleCreateGroup() {
    const members = filterUnblockedPeerIds(selectedPeerIds.length > 0 ? selectedPeerIds : peers.map((peer) => peer.peer_id));
    if (members.length === 0) {
      statusText = "请先选择群聊成员";
      return;
    }
    const id = await createGroup("内网群聊", members);
    const group: ConversationSummary = {
      id,
      title: `内网群聊 (${members.length})`,
      group_announcement: "",
      group_owner_peer_id: self?.peer_id ?? "",
      last_message_at: Date.now(),
      last_message_preview: "",
      unread_count: 0,
      manual_unread: false,
      pinned: false,
      muted: false,
      archived: false,
      draft_preview: ""
    };
    conversations = [group, ...conversations.filter((conversation) => conversation.id !== id)];
    selectedPeerIds = [];
    activeGroupMemberIds = self ? [...members, self.peer_id] : members;
    groupNameDraft = group.title;
    groupAnnouncementDraft = group.group_announcement ?? "";
    groupMemberDraftIds = members;
    await loadConversation(id);
  }

  function togglePeer(peerId: string) {
    selectedPeerIds = selectedPeerIds.includes(peerId)
      ? selectedPeerIds.filter((id) => id !== peerId)
      : [...selectedPeerIds, peerId];
  }

  function toggleGroupMemberDraft(peerId: string) {
    groupMemberDraftIds = groupMemberDraftIds.includes(peerId)
      ? groupMemberDraftIds.filter((id) => id !== peerId)
      : [...groupMemberDraftIds, peerId];
  }

  async function saveActiveGroup() {
    if (!activeConversation.startsWith("group:")) return;
    if (!activeGroupCanManage) {
      statusText = "只有群创建者可以修改群资料和成员";
      return;
    }
    try {
      groupMemberDraftIds = filterUnblockedPeerIds(groupMemberDraftIds);
      const summary = await updateGroup(activeConversation, groupNameDraft, groupAnnouncementDraft, groupMemberDraftIds);
      conversations = upsertConversationSummary(summary);
      activeGroupMemberIds = await listGroupMembers(activeConversation);
      groupMemberDraftIds = filterUnblockedPeerIds(activeGroupMemberIds.filter((peerId) => peerId !== self?.peer_id));
      groupNameDraft = summary.title;
      groupAnnouncementDraft = summary.group_announcement ?? "";
      statusText = `已更新群聊：${summary.title}`;
    } catch (error) {
      statusText = `群资料保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function exportConversation(conversationId: string, title: string) {
    if (!hasTauriRuntime()) {
      statusText = "桌面版支持导出聊天记录";
      return;
    }
    const path = await save({
      title: "导出聊天记录",
      defaultPath: `${safeFileStem(title || conversationId)}-${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (!path) return;
    try {
      const exportedPath = await exportConversationHistory(conversationId, path);
      statusText = `聊天记录已导出：${exportedPath}`;
    } catch (error) {
      statusText = `导出失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function exportActiveConversation() {
    await exportConversation(activeConversation, activeConversationTitle || activeConversation);
  }

  function fileTransferUnavailableReason(input: {
    conversationId: string;
    peer: PeerProfile | null;
    groupMemberIds: string[];
    selfPeerId: string;
    discoveredPeerIds: Set<string>;
    publicKeyPeerIds: Set<string>;
    blockedPeerIds: Set<string>;
    outgoingReason: string;
  }) {
    if (input.outgoingReason) return input.outgoingReason;
    if (input.conversationId.startsWith("group:")) {
      return groupFileTransferBlockReason({
        memberPeerIds: input.groupMemberIds,
        selfPeerId: input.selfPeerId,
        discoveredPeerIds: input.discoveredPeerIds,
        publicKeyPeerIds: input.publicKeyPeerIds,
        blockedPeerIds: input.blockedPeerIds
      });
    }
    if (!input.peer) return "请先选择一个已发现的联系人";
    if (!input.peer.public_key || input.peer.public_key.length === 0) {
      return "联系人缺少公钥，请刷新联系人后再发送文件";
    }
    return "";
  }

  function contactMetadataFor(peerId: string): ContactMetadata {
    return contactMetadata[peerId] ?? { peer_id: peerId, remark: "", group_name: "", favorite: false, blocked: false };
  }

  function displayPeerName(peer: PeerProfile) {
    return contactMetadataFor(peer.peer_id).remark || peer.display_name;
  }

  function welcomeConversationPreview(conversation: ConversationSummary) {
    const draft = conversation.draft_preview.trim();
    if (draft) return `草稿：${draft}`;
    const preview = conversation.last_message_preview.trim();
    if (preview) return preview;
    if (conversation.unread_count > 0) return `${conversation.unread_count} 条未读消息`;
    return conversation.id.startsWith("group:") ? "群聊已创建，可以继续内网 fanout 沟通。" : "直连会话已准备好，可以发送第一条消息。";
  }

  function welcomeConversationTime(conversation: ConversationSummary) {
    const value = conversation.last_message_at;
    if (!value) return conversation.unread_count > 0 ? `${conversation.unread_count} 条未读` : "尚无历史消息";
    const date = new Date(value);
    const now = Date.now();
    const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
    if (now - value < 24 * 60 * 60 * 1000) return `今天 ${time}`;
    if (now - value < 48 * 60 * 60 * 1000) return `昨天 ${time}`;
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function filterUnblockedPeerIds(peerIds: string[]) {
    return peerIds.filter((peerId) => !contactMetadataFor(peerId).blocked);
  }

  function updateContactDraft(peerId: string, patch: Partial<ContactMetadata>) {
    const current = contactMetadataFor(peerId);
    contactMetadata = {
      ...contactMetadata,
      [peerId]: { ...current, ...patch, peer_id: peerId }
    };
    if (patch.blocked) {
      selectedPeerIds = selectedPeerIds.filter((selectedId) => selectedId !== peerId);
      groupMemberDraftIds = groupMemberDraftIds.filter((memberId) => memberId !== peerId);
      clearTypingIndicatorsForPeer(peerId);
    }
  }

  async function saveContactMetadata(peerId: string) {
    try {
      const saved = await updateContactMetadata(contactMetadataFor(peerId));
      contactMetadata = {
        ...contactMetadata,
        [peerId]: saved
      };
      savedContactPeerIds = new Set([...savedContactPeerIds, peerId]);
      const savedPeer = peers.find((peer) => peer.peer_id === peerId);
      if (savedPeer && !saved.blocked) {
        try {
          await trustPeer(savedPeer.peer_id, savedPeer.fingerprint);
          trustedPeers = await listTrustedPeers();
        } catch (error) {
          trustStatus = `联系人已保存，自动信任失败：${errorMessage(error)}`;
        }
      }
      statusText = saved.blocked
        ? "联系人资料已保存，相关传输授权已撤销"
        : "联系人资料已保存";
      if (saved.blocked) {
        try {
          transferTasks = await listTransfers();
          storageOverview = await getStorageOverview();
        } catch (error) {
          statusText = `联系人资料已保存，传输状态刷新失败：${errorMessage(error)}`;
        }
      }
    } catch (error) {
      statusText = `联系人资料保存失败：${errorMessage(error)}`;
    }
  }

  async function toggleAutoDiscovery() {
    const next = { ...settings, auto_discovery: !settings.auto_discovery };
    try {
      settings = await updateNetworkSettings(next);
      statusText = `自动发现已${settings.auto_discovery ? "开启" : "关闭"}`;
    } catch (error) {
      statusText = `自动发现设置保存失败：${errorMessage(error)}`;
    }
  }

  async function toggleMulticast() {
    const next = { ...settings, multicast: !settings.multicast };
    try {
      settings = await updateNetworkSettings(next);
      statusText = `局域网广播已${settings.multicast ? "开启" : "关闭"}`;
    } catch (error) {
      statusText = `局域网广播设置保存失败：${errorMessage(error)}`;
    }
  }

  async function saveAdvancedNetwork() {
    const validation = networkInputValidation;
    const timing = networkTimingValidation;
    const next = {
      ...settings,
      seed_peers: validation.seedPeers,
      scan_ranges: validation.scanRanges,
      discovery_interval_secs: timing.discoveryIntervalSecs,
      peer_ttl_secs: timing.peerTtlSecs
    };
    try {
      settings = await updateNetworkSettings(next);
      discoveryIntervalText = String(settings.discovery_interval_secs);
      peerTtlText = String(settings.peer_ttl_secs);
      const ignoredCount = validation.invalidSeedPeers.length + validation.invalidScanRanges.length;
      statusText = `网络设置已保存：${settings.seed_peers.length} 个种子，${settings.scan_ranges.length} 个网段，发现间隔 ${settings.discovery_interval_secs} 秒${ignoredCount ? `，已忽略 ${ignoredCount} 项无效配置` : ""}${timing.adjustedFields.length ? `，已校正 ${timing.adjustedFields.join("、")}` : ""}`;
    } catch (error) {
      statusText = `网络设置保存失败：${errorMessage(error)}`;
    }
  }

  async function saveAppPreferencesPatch(patch: Partial<AppPreferences>) {
    const saved = await updateAppPreferences(currentAppPreferences(patch));
    dark = saved.dark_mode;
    sendShortcut = saved.send_shortcut;
    appShortcuts = saved.shortcuts;
    showNotificationPreview = saved.show_notification_preview;
    privacyMode = saved.privacy_mode;
    closeToTray = saved.close_to_tray;
    loginEnabled = saved.login_enabled;
    loginPasswordHash = saved.login_password_hash;
    profileSignature = saved.profile_signature;
    avatarLabel = saved.avatar_label;
    requireContactForMessaging = saved.require_contact_for_messaging;
    return saved;
  }

  async function toggleThemePreference() {
    const previous = dark;
    dark = !dark;
    try {
      const saved = await saveAppPreferencesPatch({ dark_mode: dark });
      statusText = `${saved.dark_mode ? "深色" : "浅色"}主题已保存`;
    } catch (error) {
      dark = previous;
      statusText = `主题保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function setSendShortcutPreference(nextShortcut: SendShortcut) {
    const previous = sendShortcut;
    const previousShortcuts = appShortcuts;
    sendShortcut = nextShortcut;
    appShortcuts = { ...appShortcuts, send_message: nextShortcut };
    try {
      await saveAppPreferencesPatch({
        send_shortcut: nextShortcut,
        shortcuts: { ...appShortcuts, send_message: nextShortcut },
      });
      statusText = `发送键已设置为${sendShortcut === "enter" ? "Enter" : "Ctrl+Enter"}`;
    } catch (error) {
      sendShortcut = previous;
      appShortcuts = previousShortcuts;
      statusText = `发送键保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function setScreenshotShortcutPreference(shortcut: ScreenshotShortcut) {
    const previous = appShortcuts;
    appShortcuts = { ...appShortcuts, screenshot: shortcut };
    try {
      const saved = await saveAppPreferencesPatch({ shortcuts: appShortcuts });
      statusText = `截图快捷键已设置为${shortcutBindingLabel(saved.shortcuts.screenshot)}`;
    } catch (error) {
      appShortcuts = previous;
      statusText = `截图快捷键保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function setWindowShortcutPreference(shortcut: WindowShortcut) {
    const previous = appShortcuts;
    appShortcuts = { ...appShortcuts, toggle_window: shortcut };
    try {
      const saved = await saveAppPreferencesPatch({ shortcuts: appShortcuts });
      statusText = `窗口快捷键已设置为${shortcutBindingLabel(saved.shortcuts.toggle_window)}`;
    } catch (error) {
      appShortcuts = previous;
      statusText = `窗口快捷键保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function shortcutBindingLabel(shortcut: AppShortcuts[keyof AppShortcuts]) {
    switch (shortcut) {
      case "enter":
        return "Enter";
      case "ctrl_enter":
        return "Ctrl+Enter";
      case "ctrl_alt_a":
        return "Ctrl+Alt+A";
      case "ctrl_shift_a":
        return "Ctrl+Shift+A";
      case "ctrl_alt_i":
        return "Ctrl+Alt+I";
      case "ctrl_shift_i":
        return "Ctrl+Shift+I";
      default:
        return "关闭";
    }
  }

  function matchesShortcut(event: KeyboardEvent, shortcut: ScreenshotShortcut | WindowShortcut) {
    if (shortcut === "none") return false;
    const key = event.key.toLowerCase();
    if (shortcut === "ctrl_alt_a") return key === "a" && event.ctrlKey && event.altKey && !event.shiftKey;
    if (shortcut === "ctrl_shift_a") return key === "a" && event.ctrlKey && event.shiftKey && !event.altKey;
    if (shortcut === "ctrl_alt_i") return key === "i" && event.ctrlKey && event.altKey && !event.shiftKey;
    return key === "i" && event.ctrlKey && event.shiftKey && !event.altKey;
  }

  function handleAppKeydown(event: KeyboardEvent) {
    if (appLocked) return;
    if (matchesShortcut(event, appShortcuts.screenshot)) {
      event.preventDefault();
      void startScreenshotWorkflow();
      return;
    }
    if (matchesShortcut(event, appShortcuts.toggle_window)) {
      event.preventDefault();
      void minimizeWindowToTray();
    }
  }

  async function toggleNotificationPreviewPreference() {
    if (privacyMode) {
      statusText = "隐私模式已开启，通知内容保持隐藏";
      return;
    }
    const previous = showNotificationPreview;
    showNotificationPreview = !showNotificationPreview;
    try {
      const saved = await saveAppPreferencesPatch({ show_notification_preview: showNotificationPreview });
      statusText = saved.show_notification_preview ? "通知将显示消息内容" : "通知将隐藏消息内容";
    } catch (error) {
      showNotificationPreview = previous;
      statusText = `通知预览保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function togglePrivacyModePreference() {
    const previousPrivacyMode = privacyMode;
    const previousPreview = showNotificationPreview;
    privacyMode = !privacyMode;
    if (privacyMode) {
      showNotificationPreview = false;
    }
    try {
      const saved = await saveAppPreferencesPatch({
        privacy_mode: privacyMode,
        show_notification_preview: privacyMode ? false : showNotificationPreview
      });
      statusText = saved.privacy_mode ? "隐私模式已开启，通知将隐藏消息内容" : "隐私模式已关闭";
    } catch (error) {
      privacyMode = previousPrivacyMode;
      showNotificationPreview = previousPreview;
      statusText = `隐私模式保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function toggleCloseToTrayPreference() {
    const previous = closeToTray;
    closeToTray = !closeToTray;
    try {
      const saved = await saveAppPreferencesPatch({ close_to_tray: closeToTray });
      statusText = saved.close_to_tray ? "关闭按钮将隐藏到托盘" : "关闭按钮将退出窗口";
    } catch (error) {
      closeToTray = previous;
      statusText = `关闭行为保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function toggleRequireContactForMessaging(value: boolean) {
    const previous = requireContactForMessaging;
    requireContactForMessaging = value;
    try {
      const saved = await saveAppPreferencesPatch({ require_contact_for_messaging: value });
      statusText = saved.require_contact_for_messaging
        ? "已开启添加好友后通信"
        : "已允许局域网发现后直接通信";
    } catch (error) {
      requireContactForMessaging = previous;
      statusText = `通信权限保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function saveProfile() {
    if (!self) return;
    try {
      const updated = await updateSelfProfile({
        ...self,
        display_name: profileName.trim() || self.display_name,
        hostname: profileHostname.trim() || self.hostname,
        status: profileStatus
      });
      self = updated;
      peers = upsertPeer(peers, updated);
      statusText = "本机资料已更新，会随下一次发现广播生效";
    } catch (error) {
      statusText = `本机资料保存失败：${errorMessage(error)}`;
    }
  }

  async function copyIdentityValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      statusText = `${label}已复制，可用于人工核验设备身份`;
    } catch (error) {
      statusText = `${label}复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function copyNetworkDiagnostics(report: string) {
    try {
      await navigator.clipboard.writeText(report);
      statusText = "网络诊断报告已复制";
    } catch (error) {
      statusText = `网络诊断报告复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function copyStorageDiagnostics(report: string) {
    try {
      await navigator.clipboard.writeText(report);
      statusText = "存储诊断报告已复制";
    } catch (error) {
      statusText = `存储诊断报告复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function copyTransferDiagnostics(report: string) {
    try {
      await navigator.clipboard.writeText(report);
      statusText = "传输诊断报告已复制";
    } catch (error) {
      statusText = `传输诊断报告复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function copyStoragePath(path: string, label: string) {
    try {
      await navigator.clipboard.writeText(path);
      statusText = `${label}已复制`;
    } catch (error) {
      statusText = `${label}复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function patchConversation(
    conversationId: string,
    patch: Partial<Pick<ConversationSummary, "pinned" | "muted" | "archived">>
  ) {
    const current = conversations.find((conversation) => conversation.id === conversationId);
    if (!current) return;
    const next = { ...current, ...patch };
    try {
      await updateConversationPreferences({
        id: next.id,
        pinned: next.pinned,
        muted: next.muted,
        archived: next.archived
      });
      conversations = conversations.map((conversation) => (conversation.id === conversationId ? next : conversation));
      statusText = "会话设置已更新";
    } catch (error) {
      statusText = `会话设置保存失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function toggleConversationPinned(conversationId: string) {
    const current = conversations.find((conversation) => conversation.id === conversationId);
    if (current) await patchConversation(conversationId, { pinned: !current.pinned });
  }

  async function toggleConversationMuted(conversationId: string) {
    const current = conversations.find((conversation) => conversation.id === conversationId);
    if (current) await patchConversation(conversationId, { muted: !current.muted });
  }

  async function toggleConversationArchived(conversationId: string) {
    const current = conversations.find((conversation) => conversation.id === conversationId);
    if (current) await patchConversation(conversationId, { archived: !current.archived });
  }

  async function removeConversation(conversationId: string) {
    await deleteConversation(conversationId);
    clearLocalConversationState(conversationId);
    conversations = conversations.filter((conversation) => conversation.id !== conversationId);
    if (activeConversation === conversationId) {
      const next = initialConversationId(conversations, peers);
      if (next) {
        await loadConversation(next);
      } else {
        messages = [];
        hasMoreMessages = false;
        await loadConversation("");
      }
    }
    statusText = "会话已删除";
  }

  function openConversationContextMenu(conversation: ConversationSummary, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    messageMenu = null;
    contactMenu = null;
    transferMenu = null;
    textEditMenu = null;
    appMenu = null;
    conversationMenu = {
      ...clampContextMenuPosition(event, 190, 290),
      conversation
    };
    focusContextMenuAfterRender();
  }

  function conversationForPeerContext(peer: PeerProfile): ConversationSummary {
    const conversationId = `direct:${peer.peer_id}`;
    return (
      conversations.find((conversation) => conversation.id === conversationId) ?? {
        id: conversationId,
        title: peer.peer_id,
        group_owner_peer_id: "",
        last_message_at: Date.now(),
        last_message_preview: "",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: ""
      }
    );
  }

  function openPeerConversationContextMenu(peer: PeerProfile, event: MouseEvent) {
    openConversationContextMenu(conversationForPeerContext(peer), event);
  }

  function openContactContextMenu(peer: PeerProfile, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    messageMenu = null;
    conversationMenu = null;
    transferMenu = null;
    textEditMenu = null;
    appMenu = null;
    contactMenu = {
      ...clampContextMenuPosition(event, 190, 310),
      peer
    };
    focusContextMenuAfterRender();
  }

  async function openContactConversationFromMenu() {
    if (!contactMenu) return;
    const peerId = contactMenu.peer.peer_id;
    contactMenu = null;
    await loadConversation(`direct:${peerId}`);
  }

  function openPeerDetails(peer: PeerProfile) {
    focusedContactPeerId = peer.peer_id;
    activeSection = "contacts";
    statusText = `已打开联系人详情：${displayPeerName(peer)}`;
  }

  function openContactDetailsFromMenu() {
    if (!contactMenu) return;
    const peer = contactMenu.peer;
    contactMenu = null;
    openPeerDetails(peer);
  }

  async function toggleContactFavoriteFromMenu() {
    if (!contactMenu) return;
    const peerId = contactMenu.peer.peer_id;
    const nextFavorite = !contactMetadataFor(peerId).favorite;
    contactMenu = null;
    updateContactDraft(peerId, { favorite: nextFavorite });
    await saveContactMetadata(peerId);
  }

  async function toggleContactBlockedFromMenu() {
    if (!contactMenu) return;
    const peerId = contactMenu.peer.peer_id;
    const nextBlocked = !contactMetadataFor(peerId).blocked;
    contactMenu = null;
    updateContactDraft(peerId, { blocked: nextBlocked });
    await saveContactMetadata(peerId);
  }

  async function copyContactFingerprintFromMenu() {
    if (!contactMenu) return;
    const peer = contactMenu.peer;
    contactMenu = null;
    await copyIdentityValue(peer.fingerprint, `${displayPeerName(peer)} 指纹`);
  }

  async function copyContactDeviceIdFromMenu() {
    if (!contactMenu) return;
    const peer = contactMenu.peer;
    contactMenu = null;
    await copyIdentityValue(peer.peer_id, `${displayPeerName(peer)} 设备 ID`);
  }

  async function copyContactEndpointFromMenu() {
    if (!contactMenu) return;
    const peer = contactMenu.peer;
    const endpoints = peer.endpoints.join(" ");
    contactMenu = null;
    if (!endpoints) {
      statusText = `${displayPeerName(peer)} 暂无可复制端点`;
      return;
    }
    try {
      await navigator.clipboard.writeText(endpoints);
      statusText = `${displayPeerName(peer)} 端点已复制，可用于网络排障`;
    } catch (error) {
      statusText = `${displayPeerName(peer)} 端点复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function contactDiagnosticReport(peer: PeerProfile) {
    const metadata = contactMetadataFor(peer.peer_id);
    const conversationId = `direct:${peer.peer_id}`;
    const conversation = conversations.find((item) => item.id === conversationId);
    const trustedPeer = trustedPeers.find((item) => item.peer_id === peer.peer_id);
    const relatedTransfers = transferTasks.filter((task) => task.conversationId === conversationId);
    const loadedMessages = activeConversation === conversationId ? messages : [];
    const activeTransfers = relatedTransfers.filter(isActiveTransferTask);
    const failedTransfers = relatedTransfers.filter((task) => {
      const normalized = task.status.toLowerCase();
      return normalized === "failed" || task.status === "失败";
    });
    const trustSummary = trustedPeer
      ? trustedPeer.fingerprint === peer.fingerprint
        ? `已信任，信任时间 ${new Date(trustedPeer.trusted_at).toLocaleString("zh-CN")}`
        : `信任指纹不一致，已信任 ${trustedPeer.fingerprint}`
      : "未建立信任记录";

    return [
      "灵犀内网通联系人诊断",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `联系人：${displayPeerName(peer)}`,
      `设备 ID：${peer.peer_id}`,
      `主机：${peer.hostname || "未知"}`,
      `状态：${peer.status === "online" ? "可联系" : "暂不可达"}`,
      `备注：${metadata.remark || "无"}`,
      `分组：${metadata.group_name || "默认"}`,
      `星标：${metadata.favorite ? "是" : "否"}`,
      `阻止：${metadata.blocked ? "是" : "否"}`,
      `端点：${peer.endpoints.join(", ") || "等待发现"}`,
      `指纹：${peer.fingerprint || "未知"}`,
      `信任状态：${trustSummary}`,
      `会话 ID：${conversationId}`,
      `会话未读：${conversation?.unread_count ?? 0}`,
      `最近消息：${conversation?.last_message_preview || "无"}`,
      `已加载消息：${activeConversation === conversationId ? String(loadedMessages.length) : "未加载"}`,
      `传输任务：${relatedTransfers.length}`,
      `活跃传输：${activeTransfers.length}`,
      `失败传输：${failedTransfers.length}`,
      `最近网络警告：${networkWarnings.join(" | ") || networkWarning || "无"}`
    ].join("\n");
  }

  async function copyContactDiagnosticFromMenu() {
    if (!contactMenu) return;
    const peer = contactMenu.peer;
    const report = contactDiagnosticReport(peer);
    contactMenu = null;
    try {
      await navigator.clipboard.writeText(report);
      statusText = `${displayPeerName(peer)} 联系人诊断报告已复制`;
    } catch (error) {
      statusText = `${displayPeerName(peer)} 联系人诊断报告复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function openConversationFromMenu() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    await loadConversation(conversationId);
  }

  async function copyConversationIdFromMenu() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    try {
      await navigator.clipboard?.writeText(conversationId);
      statusText = "会话 ID 已复制";
    } catch (error) {
      statusText = `会话 ID 复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function conversationDiagnosticReportFromSummary(conversation: ConversationSummary) {
    const title = conversationDisplayTitle(conversation, peers, contactMetadata);
    const isTargetActive = conversation.id === activeConversation;
    const loadedMessages = isTargetActive ? messages : [];
    const relatedTransfers = transferTasks.filter((task) => task.conversationId === conversation.id);
    const directPeer = directConversationPeer(conversation, peers);
    const type = conversation.id.startsWith("group:") ? "群聊" : "直连";
    const failedTransfers = relatedTransfers.filter((task) => {
      const normalized = task.status.toLowerCase();
      return normalized === "failed" || task.status === "失败";
    });
    const activeTransfers = relatedTransfers.filter(isActiveTransferTask);
    const failedMessages = loadedMessages.filter((message) => message.status === "failed").length;
    const retryingMessages = loadedMessages.filter((message) => ["queued", "sending"].includes(message.status)).length;
    const attachmentCount = loadedMessages.reduce((sum, message) => sum + message.attachments.length, 0);
    const attachmentFileCount = loadedMessages.reduce(
      (sum, message) =>
        sum + message.attachments.reduce((attachmentSum, attachment) => attachmentSum + attachment.manifest.files.length, 0),
      0
    );
    const memberOrPeer = directPeer
      ? `${displayPeerName(directPeer)} ${directPeer.status === "online" ? "可联系" : "暂不可达"}，主机 ${directPeer.hostname || "未知"}，端点 ${
          directPeer.endpoints.join(", ") || "等待发现"
        }`
      : conversation.id.startsWith("group:")
        ? isTargetActive
          ? `成员 ${activeGroupMemberCount}，可联系 ${activeGroupMembers.filter((peer) => peer.status === "online").length}`
          : "群成员需打开会话详情后查看"
        : "未发现直连联系人";

    return [
      "灵犀内网通会话诊断",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `会话：${title}`,
      `会话 ID：${conversation.id}`,
      `类型：${type}`,
      `成员/联系人：${memberOrPeer}`,
      `置顶：${conversation.pinned ? "是" : "否"}`,
      `免打扰：${conversation.muted ? "是" : "否"}`,
      `归档：${conversation.archived ? "是" : "否"}`,
      `未读：${conversation.unread_count}`,
      `草稿：${conversation.draft_preview || "无"}`,
      `最近消息：${conversation.last_message_preview || "无"}`,
      `已加载消息：${isTargetActive ? String(loadedMessages.length) : "未加载"}`,
      `待发送/发送中消息：${retryingMessages}`,
      `失败消息：${failedMessages}`,
      `附件消息：${attachmentCount}`,
      `附件文件：${attachmentFileCount}`,
      `传输任务：${relatedTransfers.length}`,
      `活跃传输：${activeTransfers.length}`,
      `失败传输：${failedTransfers.length}`,
      `最近网络警告：${networkWarnings.join(" | ") || networkWarning || "无"}`
    ].join("\n");
  }

  async function copyConversationDiagnosticFromMenu() {
    if (!conversationMenu) return;
    const report = conversationDiagnosticReportFromSummary(conversationMenu.conversation);
    conversationMenu = null;
    try {
      await navigator.clipboard?.writeText(report);
      statusText = "会话诊断报告已复制";
    } catch (error) {
      statusText = `会话诊断报告复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function openMenuConversationDetails() {
    if (!conversationMenu) return;
    const conversation = conversationMenu.conversation;
    conversationMenu = null;
    try {
      if (activeConversation !== conversation.id) {
        await loadConversation(conversation.id);
      }
      activeSection = "messages";
      inspectorTab = conversation.id.startsWith("group:") ? "members" : "details";
      inspectorOpen = true;
      statusText = `已打开会话详情：${conversationDisplayTitle(conversation, peers, contactMetadata)}`;
    } catch (error) {
      statusText = `打开会话详情失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function toggleMenuConversationPinned() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    await toggleConversationPinned(conversationId);
  }

  async function toggleMenuConversationMuted() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    await toggleConversationMuted(conversationId);
  }

  async function toggleMenuConversationArchived() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    await toggleConversationArchived(conversationId);
  }

  async function markConversationReadById(conversationId: string) {
    try {
      await markConversationRead(conversationId);
      conversations = markConversationReadInList(conversations, conversationId);
      clearMentionedConversation(conversationId);
      if (conversationId === activeConversation) {
        messages = messages.map((message) => (message.status === "received" ? { ...message, status: "read" } : message));
      }
      statusText = "会话已标为已读";
    } catch (error) {
      statusText = `标为已读失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function markConversationUnreadById(conversationId: string) {
    try {
      await markConversationUnread(conversationId);
      conversations = markConversationUnreadInList(conversations, conversationId);
      statusText = "会话已标为未读";
    } catch (error) {
      statusText = `标为未读失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function markMenuConversationRead() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    await markConversationReadById(conversationId);
  }

  async function markMenuConversationUnread() {
    if (!conversationMenu) return;
    const conversationId = conversationMenu.conversation.id;
    conversationMenu = null;
    await markConversationUnreadById(conversationId);
  }

  async function markEveryConversationRead() {
    try {
      const changed = await markAllConversationsRead();
      conversations = markAllConversationsReadInList(conversations);
      clearAllMentionedConversations();
      messages = messages.map((message) => (message.status === "received" ? { ...message, status: "read" } : message));
      statusText = changed > 0 ? `已标记 ${changed} 条未读为已读` : "没有未读会话";
    } catch (error) {
      statusText = `全部标为已读失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function deleteMenuConversation() {
    if (!conversationMenu) return;
    const conversation = conversationMenu.conversation;
    confirmDeleteConversation(conversation.id, conversationDisplayTitle(conversation, peers, contactMetadata));
  }

  function confirmDeleteConversation(conversationId: string, title: string) {
    openConfirmDialog({
      title: "确认删除会话",
      body: `此操作会将“${title}”从本机会话列表中移除，并删除本机保存的会话记录；不会删除对方设备上的数据。`,
      confirmLabel: "确认删除",
      danger: true,
      onConfirm: () => removeConversation(conversationId)
    });
  }

  function confirmDeleteConversationById(conversationId: string) {
    confirmDeleteConversation(conversationId, conversationTitleFor(conversationId));
  }

  async function exportMenuConversation() {
    if (!conversationMenu) return;
    const conversation = conversationMenu.conversation;
    conversationMenu = null;
    await exportConversation(conversation.id, conversationDisplayTitle(conversation, peers, contactMetadata));
  }

  async function clearConversationHistory(conversationId: string) {
    try {
      const cleared = await clearConversationMessages(conversationId);
      if (conversationId === activeConversation) {
        messages = [];
        hasMoreMessages = false;
        conversationSearchResults = [];
        focusedMessageId = "";
      }
      searchResults = searchResults.filter((message) => message.conversation_id !== conversationId);
      favoriteMessages = favoriteMessages.filter((message) => message.conversation_id !== conversationId);
      pinnedMessages = pinnedMessages.filter((message) => message.conversation_id !== conversationId);
      todoMessages = todoMessages.filter((message) => message.conversation_id !== conversationId);
      outboxMessages = outboxMessages.filter((message) => message.conversation_id !== conversationId);
      conversations = markConversationReadInList(conversations, conversationId);
      statusText = `已清空 ${cleared} 条聊天记录`;
    } catch (error) {
      statusText = `清空聊天记录失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function confirmClearConversationHistory(conversationId: string, title: string) {
    openConfirmDialog({
      title: "确认清空聊天记录",
      body: `此操作只会清空本机历史记录，不会通知对方，也不会删除会话“${title}”。`,
      confirmLabel: "确认清空",
      danger: true,
      onConfirm: () => clearConversationHistory(conversationId)
    });
  }

  async function clearActiveConversationMessages() {
    confirmClearConversationHistory(activeConversation, activeConversationTitle || activeConversation);
  }

  async function clearMenuConversationMessages() {
    if (!conversationMenu) return;
    const conversation = conversationMenu.conversation;
    const title = conversationDisplayTitle(conversation, peers, contactMetadata);
    confirmClearConversationHistory(conversation.id, title);
  }

  async function handleTrustPeer(peer: PeerProfile | null = activePeer) {
    if (!peer) {
      trustStatus = "没有可信任的联系人";
      return;
    }
    try {
      await trustPeer(peer.peer_id, peer.fingerprint);
      trustedPeers = await listTrustedPeers();
      trustStatus = `已信任 ${peer.display_name}`;
    } catch (error) {
      trustStatus = error instanceof Error ? error.message : String(error);
    }
  }

  async function forgetTrustedPeerNow(peerId: string) {
    try {
      const removed = await removeTrustedPeer(peerId);
      trustedPeers = await listTrustedPeers();
      trustStatus = removed ? "已移除该设备信任，下次发现时会重新执行 TOFU" : "未找到该设备的信任记录";
    } catch (error) {
      trustStatus = error instanceof Error ? error.message : String(error);
    }
  }

  function forgetTrustedPeer(peerId: string) {
    openConfirmDialog({
      title: "确认移除设备信任",
      body: "移除后，本机会忘记该设备的证书指纹；下次发现该设备时会重新执行 TOFU 信任流程。",
      confirmLabel: "确认移除",
      danger: true,
      onConfirm: () => forgetTrustedPeerNow(peerId)
    });
  }

  async function enableNotifications() {
    if (!hasTauriRuntime()) {
      notificationReady = true;
      statusText = "浏览器预览模式：已模拟开启通知";
      return;
    }

    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    notificationReady = granted;
    statusText = granted ? "系统通知已开启" : "系统通知授权被拒绝";
    if (granted) {
      sendNotification({ title: "灵犀内网通", body: "系统通知已开启" });
    }
  }

  async function minimizeWindowToTray() {
    if (!hasTauriRuntime()) {
      trayStatus = "浏览器预览模式：桌面版可隐藏到系统托盘";
      statusText = trayStatus;
      return;
    }

    await minimizeToTray();
    trayStatus = "已隐藏到系统托盘，可从托盘图标恢复";
    statusText = trayStatus;
  }

  async function refreshStorageOverview() {
    storageOverview = await getStorageOverview();
    statusText = "存储信息已刷新";
  }

  async function clearClipboardStagingNow() {
    await clearStagedFiles();
    storageOverview = await getStorageOverview();
    statusText = "剪贴板暂存已清理";
  }

  function clearClipboardStaging() {
    openConfirmDialog({
      title: "确认清理剪贴板暂存",
      body: "此操作会删除剪贴板、拖拽或截图产生的暂存文件；不会删除已经发送、接收或保存到接收目录的文件。",
      confirmLabel: "确认清理",
      danger: true,
      onConfirm: clearClipboardStagingNow
    });
  }

  async function openStorage(kind: "data" | "received" | "staged") {
    await openStorageLocation(kind);
    statusText = "已打开存储位置";
  }

  async function chooseAndMigrateStorageDirectory() {
    if (storageMigrationActive) return;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择新的灵犀内网通数据目录"
      });
      if (!selected || Array.isArray(selected)) return;
      storageMigrationActive = true;
      storageMigrationProgress = {
        phase: "preparing",
        completed: 0,
        total: 0,
        current_path: selected
      };
      statusText = "正在迁移数据目录，请勿关闭应用";
      storageOverview = await migrateStorageDirectory(selected);
      storageMigrationProgress = {
        phase: "done",
        completed: 1,
        total: 1,
        current_path: storageOverview.data_dir
      };
      statusText = "数据目录迁移完成，正在重启以切换新目录";
      await restartApp();
    } catch (error) {
      storageMigrationActive = false;
      statusText = `数据目录迁移失败：${errorMessage(error)}`;
    }
  }

  async function openTransfer(transferId: string) {
    await openTransferLocation(transferId);
    statusText = "已打开传输目录";
  }

  function isActiveTransferTask(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return !["delivered", "downloaded", "failed", "cancelled", "canceled", "已完成", "失败"].includes(normalized);
  }

  function transferTaskStatusLabel(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    if (normalized === "indexed" || task.status === "已广播") return "等待下载";
    if (normalized === "sending" || normalized === "downloading") return "传输中";
    if (normalized === "downloaded" || normalized === "delivered") return "已完成";
    if (normalized === "failed" || task.status === "失败") return "失败";
    if (normalized === "cancelled" || normalized === "canceled") return "已取消";
    return task.status || "未知";
  }

  function transferTaskProgress(task: TransferTask) {
    if (task.totalBytes <= 0) return 0;
    return Math.min(100, Math.round((task.sentBytes / task.totalBytes) * 100));
  }

  function cannotResumeTransferTask(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return !task.resumable && ["failed", "cancelled", "canceled", "失败"].includes(normalized);
  }

  function transferTaskDiagnosticReport(task: TransferTask) {
    return [
      "灵犀内网通传输记录",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `任务 ID：${task.id}`,
      `会话：${task.conversationId}`,
      `名称：${task.name || task.id}`,
      `状态：${transferTaskStatusLabel(task)} (${task.status || "unknown"})`,
      `进度：${transferTaskProgress(task)}%`,
      `已传输：${formatBytes(task.sentBytes)} / ${formatBytes(task.totalBytes)}`,
      `文件数量：${task.files.length}`,
      `文件清单：${(task.files.length > 0 ? task.files : [task.name]).join("\n") || "无"}`,
      `错误：${task.errorMessage || "无"}`,
      `可重新广播：${task.resumable ? "是" : "否"}`,
      `本地源状态：${cannotResumeTransferTask(task) ? "缺少可重新广播的源文件或授权信息" : "可用或无需续传"}`
    ].join("\n");
  }

  function openTransferContextMenu(task: TransferTask, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    messageMenu = null;
    conversationMenu = null;
    contactMenu = null;
    textEditMenu = null;
    appMenu = null;
    transferMenu = {
      ...clampContextMenuPosition(event, 190, 280),
      task
    };
    focusContextMenuAfterRender();
  }

  async function openTransferFromMenu() {
    if (!transferMenu) return;
    const transferId = transferMenu.task.id;
    transferMenu = null;
    await openTransfer(transferId);
  }

  async function copyTransferIdFromMenu() {
    if (!transferMenu) return;
    const transferId = transferMenu.task.id;
    transferMenu = null;
    try {
      await navigator.clipboard?.writeText(transferId);
      statusText = "传输 ID 已复制";
    } catch (error) {
      statusText = `传输 ID 复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function copyTransferFileListFromMenu() {
    if (!transferMenu) return;
    const task = transferMenu.task;
    const fileList = (task.files.length > 0 ? task.files : [task.name]).join("\n");
    transferMenu = null;
    try {
      await navigator.clipboard?.writeText(fileList);
      statusText = "文件清单已复制";
    } catch (error) {
      statusText = `文件清单复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function copyTransferDiagnosticFromMenu() {
    if (!transferMenu) return;
    const report = transferTaskDiagnosticReport(transferMenu.task);
    transferMenu = null;
    await copyTransferDiagnostics(report);
  }

  async function cancelTransferFromMenu() {
    if (!transferMenu) return;
    const transferId = transferMenu.task.id;
    transferMenu = null;
    await stopTransfer(transferId);
  }

  async function resumeTransferFromMenu() {
    if (!transferMenu) return;
    const transferId = transferMenu.task.id;
    transferMenu = null;
    await resumeStoppedTransfer(transferId);
  }

  function deleteTransferFromMenu() {
    if (!transferMenu) return;
    const transferId = transferMenu.task.id;
    transferMenu = null;
    confirmDeleteTransfer(transferId);
  }

  async function removeTransfer(transferId: string) {
    const changed = await deleteTransfer(transferId);
    transferTasks = transferTasks.filter((task) => task.id !== transferId);
    storageOverview = await getStorageOverview();
    statusText = changed ? "传输记录已删除，相关传输索引已清理" : "传输记录不存在或已删除";
  }

  function confirmDeleteTransfer(transferId: string) {
    const task = transferTasks.find((item) => item.id === transferId);
    const label = task?.name || transferId;
    openConfirmDialog({
      title: "确认删除传输记录",
      body: `此操作只会删除“${label}”的传输任务记录，不会删除已经接收或暂存的文件。`,
      confirmLabel: "确认删除",
      danger: true,
      onConfirm: () => removeTransfer(transferId)
    });
  }

  async function stopTransfer(transferId: string) {
    const changed = await cancelTransfer(transferId);
    transferTasks = await listTransfers();
    storageOverview = await getStorageOverview();
    statusText = changed ? "传输已取消" : "传输已处于终态";
  }

  async function resumeStoppedTransfer(transferId: string) {
    try {
      const task = await resumeTransfer(transferId);
      upsertTransfer(task);
      storageOverview = await getStorageOverview();
      statusText = `已重新广播传输：${task.name}`;
    } catch (error) {
      statusText = `重新广播失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function clearFinishedTransfersNow() {
    const removed = await clearCompletedTransfers();
    transferTasks = await listTransfers();
    storageOverview = await getStorageOverview();
    statusText = `已清理 ${removed} 条已完成/失败传输记录，聊天文件转发索引已保留`;
  }

  function clearFinishedTransfers() {
    openConfirmDialog({
      title: "确认清理传输记录",
      body: "此操作会删除所有已完成、失败或取消的传输任务记录，不会删除已经接收或暂存的文件。",
      confirmLabel: "确认清理",
      danger: true,
      onConfirm: clearFinishedTransfersNow
    });
  }

  function openMessageContextMenu(message: ChatMessage, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    conversationMenu = null;
    contactMenu = null;
    transferMenu = null;
    textEditMenu = null;
    appMenu = null;
    messageMenu = {
      ...clampContextMenuPosition(event, 190, 290),
      message
    };
    focusContextMenuAfterRender();
  }

  function startMessageSelection(message?: ChatMessage) {
    messageSelectionMode = true;
    messageMenu = null;
    conversationMenu = null;
    contactMenu = null;
    transferMenu = null;
    appMenu = null;
    textEditMenu = null;
    if (message && !selectedMessageIds.includes(message.id)) {
      selectedMessageIds = [...selectedMessageIds, message.id];
    }
  }

  function toggleMessageSelection(messageId: string) {
    messageSelectionMode = true;
    selectedMessageIds = selectedMessageIds.includes(messageId)
      ? selectedMessageIds.filter((id) => id !== messageId)
      : [...selectedMessageIds, messageId];
  }

  function toggleSelectAllLoadedMessages() {
    const loadedIds = messages.map((message) => message.id);
    if (loadedIds.length === 0) return;
    messageSelectionMode = true;
    const selected = new Set(selectedMessageIds);
    const allLoadedSelected = loadedIds.every((id) => selected.has(id));
    if (allLoadedSelected) {
      const loaded = new Set(loadedIds);
      selectedMessageIds = selectedMessageIds.filter((id) => !loaded.has(id));
      return;
    }
    selectedMessageIds = Array.from(new Set([...selectedMessageIds, ...loadedIds]));
  }

  function cancelMessageSelection() {
    messageSelectionMode = false;
    selectedMessageIds = [];
  }

  function selectedMessageCopyBlock(message: ChatMessage) {
    const payload = messageCopyPayload(message);
    if (!payload.text) return "";
    return [
      `${messageSenderLabel(message)} · ${new Date(message.created_at).toLocaleString("zh-CN")}`,
      payload.text
    ].join("\n");
  }

  async function copySelectedMessages() {
    const blocks = selectedMessages
      .filter((message) => !message.recalled)
      .map(selectedMessageCopyBlock)
      .filter(Boolean);
    if (blocks.length === 0) {
      statusText = selectedMessages.length > 0 ? "已选消息没有可复制内容" : "请选择要复制的消息";
      chatNotice = statusText;
      return;
    }
    try {
      await navigator.clipboard.writeText(blocks.join("\n\n"));
      statusText = `已复制 ${blocks.length} 条消息`;
      chatNotice = statusText;
      cancelMessageSelection();
    } catch (error) {
      statusText = `批量复制失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function favoriteSelectedMessages() {
    const targets = selectedMessages.filter((message) => !message.recalled && !message.favorited);
    if (targets.length === 0) {
      statusText = selectedMessages.length > 0 ? "已选消息无需重复收藏" : "请选择要收藏的消息";
      chatNotice = statusText;
      return;
    }
    try {
      for (const message of targets) {
        const updated = await setMessageFavorite(message, true);
        if (updated.conversation_id === activeConversation) {
          upsertMessage(updated);
        }
        favoriteMessages = syncFavoriteMessageList(favoriteMessages, updated);
        searchResults = replaceMessageInList(searchResults, updated);
        conversationSearchResults = replaceMessageInList(conversationSearchResults, updated);
      }
      statusText = `已收藏 ${targets.length} 条消息`;
      chatNotice = statusText;
      cancelMessageSelection();
    } catch (error) {
      statusText = `批量收藏失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function pinSelectedMessages() {
    const targets = selectedMessages.filter((message) => !message.recalled && !isMessagePinned(message));
    if (targets.length === 0) {
      statusText = selectedMessages.length > 0 ? "已选消息无需重复置顶" : "请选择要置顶的消息";
      chatNotice = statusText;
      return;
    }
    try {
      for (const message of targets) {
        const updated = await setMessagePin(message, true);
        if (updated.conversation_id === activeConversation) {
          upsertMessage(updated);
          pinnedMessages = syncPinnedMessageList(pinnedMessages, updated, true);
        }
        searchResults = replaceMessageInList(searchResults, updated);
        conversationSearchResults = replaceMessageInList(conversationSearchResults, updated);
      }
      statusText = `已置顶 ${targets.length} 条消息`;
      chatNotice = statusText;
      cancelMessageSelection();
    } catch (error) {
      statusText = `批量置顶失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  function isMessageTodo(message: ChatMessage) {
    return todoMessages.some((item) => item.id === message.id);
  }

  async function todoSelectedMessages() {
    const targets = selectedMessages.filter((message) => !message.recalled && !isMessageTodo(message));
    if (targets.length === 0) {
      statusText = selectedMessages.length > 0 ? "已选消息已在待办中" : "请选择要加入待办的消息";
      chatNotice = statusText;
      return;
    }
    try {
      for (const message of targets) {
        const updated = await setMessageTodo(message, true);
        if (updated.conversation_id === activeConversation) {
          upsertMessage(updated);
        }
        todoMessages = syncTodoMessageList(todoMessages, updated, true);
        searchResults = replaceMessageInList(searchResults, updated);
        conversationSearchResults = replaceMessageInList(conversationSearchResults, updated);
      }
      statusText = `已加入待办 ${targets.length} 条消息`;
      chatNotice = statusText;
      cancelMessageSelection();
    } catch (error) {
      statusText = `批量加入待办失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  function openSelectedForwardDialog() {
    if (selectedForwardableMessages.length === 0) {
      statusText = selectedMessages.length > 0 ? "撤回消息不能转发" : "请选择要转发的消息";
      chatNotice = statusText;
      return;
    }
    forwardingMessage = null;
    forwardingMessages = [...selectedForwardableMessages];
    forwardQuery = "";
    messageMenu = null;
  }

  function confirmDeleteSelectedMessages() {
    if (selectedMessages.length === 0) {
      statusText = "请选择要删除的消息";
      chatNotice = statusText;
      return;
    }
    const count = selectedMessages.length;
    openConfirmDialog({
      title: "确认删除多条消息",
      body: `此操作只会从本机聊天记录中删除选中的 ${count} 条消息，不会撤回消息，也不会删除对方设备上的记录。`,
      confirmLabel: "确认删除",
      danger: true,
      onConfirm: deleteSelectedMessages
    });
  }

  async function deleteSelectedMessages() {
    const ids = selectedMessages.map((message) => message.id);
    if (ids.length === 0) return;
    try {
      for (const messageId of ids) {
        await deleteMessage(messageId);
        clearLocalMessageReferences(messageId);
      }
      statusText = `已删除 ${ids.length} 条消息`;
      chatNotice = statusText;
      cancelMessageSelection();
    } catch (error) {
      statusText = `批量删除失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function refreshPeersFromAppMenu() {
    appMenu = null;
    await refreshPeers();
  }

  function openContactsFromAppMenu() {
    appMenu = null;
    activeSection = "contacts";
  }

  function openFilesFromAppMenu() {
    appMenu = null;
    activeSection = "files";
  }

  function openSettingsFromAppMenu() {
    appMenu = null;
    openSettings("profile");
  }

  function openSignatureFromAppMenu() {
    appMenu = null;
    openSettings("profile");
    statusText = "可在个人资料中编辑签名";
  }

  function openAvatarFromAppMenu() {
    appMenu = null;
    openSettings("profile");
    statusText = "可在个人资料中设置头像文字";
  }

  async function updateStatusFromAppMenu(status: PeerStatus) {
    appMenu = null;
    profileStatus = status;
    await saveProfile();
  }

  function openAppProfileMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    messageMenu = null;
    conversationMenu = null;
    contactMenu = null;
    transferMenu = null;
    textEditMenu = null;
    appMenu = clampContextMenuPosition(event, 278, 360);
    focusContextMenuAfterRender();
  }

  function toggleThemeFromAppMenu() {
    appMenu = null;
    toggleThemePreference();
  }

  async function minimizeToTrayFromAppMenu() {
    appMenu = null;
    await minimizeWindowToTray();
  }

  async function unlockApp() {
    loginUnlockError = "";
    const password = loginUnlockDraft.trim();
    if (!password) {
      loginUnlockError = "请输入登录密码";
      return;
    }
    const hash = await sha256Hex(password);
    if (hash !== loginPasswordHash) {
      loginUnlockError = "密码不正确";
      return;
    }
    appLocked = false;
    loginUnlockDraft = "";
    statusText = "登录成功";
  }

  async function saveLoginSettings() {
    try {
      if (!loginEnabled) {
        loginPasswordHash = "";
        loginPasswordDraft = "";
        loginPasswordConfirmDraft = "";
        await saveAppPreferencesPatch({ login_enabled: false, login_password_hash: "" });
        statusText = "登录密码已关闭";
        return;
      }
      if (!loginPasswordReady) {
        statusText = loginPasswordDraft.length < 4 ? "登录密码至少 4 位" : "两次输入的登录密码不一致";
        return;
      }
      const nextHash = await sha256Hex(loginPasswordDraft);
      loginPasswordHash = nextHash;
      loginPasswordDraft = "";
      loginPasswordConfirmDraft = "";
      await saveAppPreferencesPatch({ login_enabled: true, login_password_hash: nextHash });
      statusText = "登录密码已启用，下次启动需要解锁";
    } catch (error) {
      statusText = `登录设置保存失败：${errorMessage(error)}`;
    }
  }

  async function saveProfileExtras() {
    try {
      await saveAppPreferencesPatch({ profile_signature: profileSignature, avatar_label: avatarLabel });
      statusText = "个人签名和头像已保存";
    } catch (error) {
      statusText = `个人扩展资料保存失败：${errorMessage(error)}`;
    }
  }

  async function copyTextEditSelection(cut = false) {
    if (!textEditMenu) return;
    const { element } = textEditMenu;
    const selected = editableSelectionText(element);
    if (!selected) {
      textEditMenu = null;
      return;
    }
    try {
      await navigator.clipboard.writeText(selected);
      if (cut) {
        replaceEditableSelection(element, "");
      }
    } finally {
      textEditMenu = null;
    }
  }

  async function pasteTextEditClipboard() {
    if (!textEditMenu) return;
    const { element } = textEditMenu;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        replaceEditableSelection(element, text);
      }
    } finally {
      textEditMenu = null;
    }
  }

  function selectAllTextEdit() {
    if (!textEditMenu) return;
    textEditMenu.element.focus();
    textEditMenu.element.select();
    textEditMenu = null;
  }

  function openConfirmDialog(dialog: ConfirmDialogState) {
    messageMenu = null;
    conversationMenu = null;
    contactMenu = null;
    transferMenu = null;
    appMenu = null;
    textEditMenu = null;
    confirmDialog = dialog;
  }

  function closeConfirmDialog() {
    confirmDialog = null;
  }

  async function confirmDialogAction() {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    confirmDialog = null;
    await action();
  }

  async function copyContextMessage() {
    if (!messageMenu) return;
    if (messageMenu.message.recalled) {
      statusText = "撤回消息没有可复制内容";
      chatNotice = statusText;
      messageMenu = null;
      return;
    }
    const copyPayload = messageCopyPayload(messageMenu.message);
    if (!copyPayload.text) {
      statusText = "消息没有可复制内容";
      chatNotice = statusText;
      messageMenu = null;
      return;
    }
    try {
      await navigator.clipboard.writeText(copyPayload.text);
      statusText = copyPayload.statusText;
    } catch (error) {
      statusText = `${copyPayload.failureLabel}复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
    chatNotice = statusText;
    messageMenu = null;
  }

  async function copyAttachmentFiles(fileList: string) {
    const text = fileList.trim();
    if (!text) {
      statusText = "附件清单为空";
      chatNotice = statusText;
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      statusText = "附件清单已复制";
    } catch (error) {
      statusText = `附件清单复制失败：${errorMessage(error)}`;
    }
    chatNotice = statusText;
  }

  async function resendContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    messageMenu = null;
    await resendMessage(message);
  }

  async function resendMessage(message: ChatMessage) {
    try {
      const retried = await retryMessage(message);
      if (retried.conversation_id === activeConversation) {
        upsertMessage(retried);
      }
      outboxMessages = syncOutboxMessageList(outboxMessages, retried);
      statusText = "消息已重新加入发送队列";
    } catch (error) {
      statusText = `重新发送失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  async function retryOutboxMessages() {
    const targets = outboxMessages.filter((message) => !message.recalled && ["queued", "sending", "failed"].includes(message.status));
    if (targets.length === 0) {
      statusText = "发件箱暂无可重试消息";
      return;
    }

    const results = await Promise.allSettled(targets.map((message) => retryMessage(message)));
    let successCount = 0;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      successCount += 1;
      const retried = result.value;
      if (retried.conversation_id === activeConversation) {
        upsertMessage(retried);
      }
      outboxMessages = syncOutboxMessageList(outboxMessages, retried);
    }
    const failedCount = results.length - successCount;
    statusText = failedCount > 0
      ? `发件箱已重试 ${successCount} 条，${failedCount} 条失败`
      : `发件箱已重试 ${successCount} 条消息`;
    chatNotice = statusText;
  }

  function quoteContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    if (message.recalled) {
      statusText = "撤回消息不能引用";
      messageMenu = null;
      return;
    }
    replyQuote = {
      message_id: message.id,
      sender_id: message.sender_id,
      body_preview: messageQuotePreview(message)
    };
    scheduleDraftSave();
    statusText = "已加入引用回复";
    messageMenu = null;
  }

  function openForwardContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    if (message.recalled) {
      statusText = "撤回消息不能转发";
      messageMenu = null;
      return;
    }
    forwardingMessage = message;
    forwardingMessages = [];
    forwardQuery = "";
    messageMenu = null;
  }

  function closeForwardDialog() {
    forwardingMessage = null;
    forwardingMessages = [];
    forwardQuery = "";
  }

  async function confirmForwardMessage(conversationId: string) {
    if (forwardingMessageList.length === 0) return;
    const sources = [...forwardingMessageList];
    try {
      const forwardedMessages: ChatMessage[] = [];
      for (const source of sources) {
        const forwarded = await forwardMessage(source, conversationId);
        forwardedMessages.push(forwarded);
        if (forwarded.conversation_id === activeConversation) {
          upsertMessage(forwarded);
        }
        conversations = upsertConversationForMessage(forwarded, {
          incrementUnread: false,
          markRead: forwarded.conversation_id === activeConversation
        });
      }
      statusText =
        forwardedMessages.length === 1
          ? `已转发到 ${conversationTitleFor(conversationId)}`
          : `已转发 ${forwardedMessages.length} 条消息到 ${conversationTitleFor(conversationId)}`;
      chatNotice = statusText;
      cancelMessageSelection();
      closeForwardDialog();
    } catch (error) {
      statusText = `转发失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function toggleFavoriteContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    const actionLabel = message.favorited ? "取消收藏" : "收藏";
    messageMenu = null;
    try {
      const updated = await setMessageFavorite(message, !message.favorited);
      if (updated.conversation_id === activeConversation) {
        upsertMessage(updated);
      }
      favoriteMessages = syncFavoriteMessageList(favoriteMessages, updated);
      searchResults = replaceMessageInList(searchResults, updated);
      statusText = updated.favorited ? "消息已收藏" : "已取消收藏";
    } catch (error) {
      statusText = `${actionLabel}失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  function isMessagePinned(message: ChatMessage) {
    return pinnedMessages.some((item) => item.id === message.id);
  }

  async function toggleTodoContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    const todo = isMessageTodo(message);
    messageMenu = null;
    try {
      const updated = await setMessageTodo(message, !todo);
      if (updated.conversation_id === activeConversation) {
        upsertMessage(updated);
      }
      todoMessages = syncTodoMessageList(todoMessages, updated, !todo);
      searchResults = replaceMessageInList(searchResults, updated);
      conversationSearchResults = replaceMessageInList(conversationSearchResults, updated);
      statusText = todo ? "已完成消息待办" : "已加入消息待办";
      chatNotice = statusText;
    } catch (error) {
      statusText = `${todo ? "完成待办" : "加入待办"}失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function togglePinContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    const pinned = isMessagePinned(message);
    messageMenu = null;
    try {
      const updated = await setMessagePin(message, !pinned);
      if (updated.conversation_id === activeConversation) {
        upsertMessage(updated);
        pinnedMessages = syncPinnedMessageList(pinnedMessages, updated, !pinned);
      }
      statusText = pinned ? "已取消置顶消息" : "消息已置顶到会话顶部";
      chatNotice = statusText;
    } catch (error) {
      statusText = `${pinned ? "取消置顶" : "置顶"}失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function unpinPinnedMessage(message: ChatMessage) {
    try {
      const updated = await setMessagePin(message, false);
      if (updated.conversation_id === activeConversation) {
        upsertMessage(updated);
        pinnedMessages = syncPinnedMessageList(pinnedMessages, updated, false);
      }
      statusText = "已取消置顶消息";
      chatNotice = statusText;
    } catch (error) {
      statusText = `取消置顶失败：${errorMessage(error)}`;
      chatNotice = statusText;
    }
  }

  async function toggleReactionContextMessage(reaction: string) {
    if (!messageMenu || !self) return;
    const message = messageMenu.message;
    messageMenu = null;
    await toggleMessageReaction(message, reaction);
  }

  async function toggleMessageReaction(message: ChatMessage, reaction: string) {
    if (!self) return;
    if (message.recalled) {
      statusText = "撤回消息不能添加回应";
      return;
    }
    const active = !(message.reactions ?? []).some(
      (item) => item.sender_id === self.peer_id && item.reaction === reaction
    );
    try {
      const updated = await setMessageReaction(message, reaction, active);
      if (updated.conversation_id === activeConversation) {
        upsertMessage(updated);
      }
      favoriteMessages = syncFavoriteMessageList(favoriteMessages, updated);
      searchResults = replaceMessageInList(searchResults, updated);
      statusText = active ? "已添加消息回应" : "已取消消息回应";
    } catch (error) {
      statusText = `回应失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  async function revokeContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    messageMenu = null;
    try {
      const revoked = await revokeMessage(message);
      if (revoked.conversation_id === activeConversation) {
        upsertMessage(revoked);
      }
      favoriteMessages = syncFavoriteMessageList(favoriteMessages, revoked);
      searchResults = replaceMessageInList(searchResults, revoked);
      statusText = "消息已撤回";
    } catch (error) {
      statusText = `撤回失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  async function deleteContextMessage() {
    if (!messageMenu) return;
    const message = messageMenu.message;
    openConfirmDialog({
      title: "确认删除消息",
      body: "此操作只会从本机聊天记录中删除这条消息，不会撤回消息，也不会删除对方设备上的记录。",
      confirmLabel: "确认删除",
      danger: true,
      onConfirm: () => deleteMessageById(message.id)
    });
  }

  async function deleteMessageById(messageId: string) {
    try {
      await deleteMessage(messageId);
      clearLocalMessageReferences(messageId);
      statusText = "消息已删除";
    } catch (error) {
      statusText = `删除失败：${error instanceof Error ? error.message : String(error)}`;
      chatNotice = statusText;
    }
  }

  function openContextMessageDetails() {
    if (!messageMenu) return;
    inspectorTab = activeConversation.startsWith("group:") ? "members" : "details";
    inspectorOpen = true;
    activeSection = "messages";
    messageMenu = null;
  }

  function openContextMessageInfo() {
    if (!messageMenu) return;
    detailMessage = messageMenu.message;
    messageDeliveryReceipts = [];
    void loadMessageDeliveryReceipts(detailMessage.id);
    messageDetailStatus = "";
    messageMenu = null;
  }

  function closeMessageDetails() {
    detailMessage = null;
    messageDeliveryReceipts = [];
    messageDeliveryReceiptsLoading = false;
    messageDetailStatus = "";
  }

  async function loadMessageDeliveryReceipts(messageId: string) {
    messageDeliveryReceiptsLoading = true;
    try {
      const receipts = await listMessageDeliveryReceipts(messageId);
      if (detailMessage?.id === messageId) {
        messageDeliveryReceipts = receipts;
      }
    } catch (error) {
      if (detailMessage?.id === messageId) {
        messageDetailStatus = `送达明细读取失败：${errorMessage(error)}`;
      }
    } finally {
      if (detailMessage?.id === messageId) {
        messageDeliveryReceiptsLoading = false;
      }
    }
  }

  async function copyMessageDetailValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      messageDetailStatus = `${label} 已复制`;
    } catch (error) {
      messageDetailStatus = `${label} 复制失败：${error instanceof Error ? error.message : String(error)}`;
    }
    statusText = messageDetailStatus;
  }

  async function copyMessageDetailAttachmentList(manifest: TransferManifest) {
    const fileList = transferManifestFileList(manifest);
    if (!fileList) {
      messageDetailStatus = "附件清单为空";
      statusText = messageDetailStatus;
      return;
    }
    try {
      await navigator.clipboard.writeText(fileList);
      messageDetailStatus = "附件清单已复制";
    } catch (error) {
      messageDetailStatus = `附件清单复制失败：${errorMessage(error)}`;
    }
    statusText = messageDetailStatus;
  }

  function messageDetailAuditReport(message: ChatMessage) {
    const lines = [
      "灵犀内网通消息审计",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `消息 ID：${message.id}`,
      `会话：${message.conversation_id}`,
      `方向：${messageDirectionLabel(message)}`,
      `发送人：${messageSenderLabel(message)}`,
      `时间：${new Date(message.created_at).toLocaleString("zh-CN")}`,
      `状态：${messageStatusLabel(message.status)}`,
      `发送尝试：${messageSendAttemptLabel(message)}`,
      `最后尝试：${messageLastAttemptLabel(message)}`,
      `标记：${messageFlagLabel(message)}`,
      `回应：${messageReactionSummary(message)}`,
      "",
      "交付审计：",
      ...messageDeliveryAuditItems(message).map((item) => `${item.label}：${item.value}`)
    ];

    if (message.recalled) {
      lines.push("", "正文：", "消息已撤回");
    } else if (message.body.trim()) {
      lines.push("", "正文：", message.body.trim());
    }

    if (message.quote) {
      lines.push(
        "",
        "引用：",
        `消息 ID：${message.quote.message_id}`,
        `发送人：${messageSenderLabels[message.quote.sender_id] ?? message.quote.sender_id}`,
        `摘要：${message.quote.body_preview || "无正文摘要"}`
      );
    }

    if (message.sender_id === self?.peer_id) {
      lines.push("", "逐成员送达：");
      if (messageDeliveryReceiptsLoading) {
        lines.push("正在读取送达明细");
      } else if (messageDeliveryReceipts.length === 0) {
        lines.push("没有可审计收件人");
      } else {
        lines.push(messageDeliveryReceiptSummary(messageDeliveryReceipts));
        lines.push(
          ...messageDeliveryReceipts.map(
            (receipt) => `${messageDeliveryPeerLabel(receipt.peer_id)}：${messageDeliveryReceiptStatus(receipt)}`
          )
        );
      }
    }

    if (message.attachments.length > 0) {
      lines.push("", "附件清单：");
      for (const attachment of message.attachments) {
        lines.push(
          `${attachment.manifest.files.length} 个文件 · ${formatBytes(attachment.manifest.total_bytes)} · ${attachment.manifest.transfer_id}`,
          `SHA-256：${attachment.manifest.sha256}`,
          ...attachment.manifest.files.map(
            (file) => `${attachmentFileDisplayName(file)} · ${formatBytes(file.size)} · SHA-256：${file.sha256}`
          )
        );
      }
    }

    return lines.join("\n");
  }

  async function copyMessageDetailAuditReport(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(messageDetailAuditReport(message));
      messageDetailStatus = "消息审计报告已复制";
    } catch (error) {
      messageDetailStatus = `消息审计报告复制失败：${errorMessage(error)}`;
    }
    statusText = messageDetailStatus;
  }

  function messageSenderLabel(message: ChatMessage) {
    if (message.sender_id === self?.peer_id) return "我";
    return messageSenderLabels[message.sender_id] ?? message.sender_id;
  }

  function messageStatusLabel(status: ChatMessage["status"]) {
    return {
      queued: "排队中",
      sending: "发送中",
      delivered: "已送达",
      read: "已读",
      failed: "发送失败",
      received: "已接收"
    }[status];
  }

  function messageSendAttemptLabel(message: ChatMessage) {
    const attempts = Math.max(0, message.send_attempts ?? 0);
    return `${attempts} 次`;
  }

  function messageLastAttemptLabel(message: ChatMessage) {
    const timestamp = message.last_attempt_at ?? 0;
    return timestamp > 0 ? new Date(timestamp).toLocaleString("zh-CN") : "尚未尝试";
  }

  function canRetryLocalMessage(message: ChatMessage) {
    return message.sender_id === self?.peer_id && ["queued", "sending", "failed"].includes(message.status) && !message.recalled;
  }

  function messageDirectionLabel(message: ChatMessage) {
    return message.sender_id === self?.peer_id ? "我发送的消息" : "收到的消息";
  }

  function messageFlagLabel(message: ChatMessage) {
    if (message.recalled) return "已撤回";
    if (message.favorited) return "已收藏";
    return "普通消息";
  }

  function messageReactionSummary(message: ChatMessage) {
    if (message.reactions.length === 0) return "暂无回应";
    return message.reactions
      .map((item) => `${messageSenderLabels[item.sender_id] ?? (item.sender_id === self?.peer_id ? "我" : item.sender_id)} ${item.reaction}`)
      .join("、");
  }

  function messageDeliveryAuditItems(message: ChatMessage) {
    const isLocal = message.sender_id === self?.peer_id;
    const statusDetail: Record<ChatMessage["status"], string> = {
      queued: "消息已写入本地 outbox，等待发现对端后补发。",
      sending: "正在通过局域网直连发送，等待对端 ACK。",
      delivered: "对端已确认收到消息。",
      read: "对端已发送已读回执。",
      failed: "发送失败，可从消息右键菜单重新发送。",
      received: "已写入本机加密历史；会话标为已读时会发送已读回执。"
    };
    const fileCount = message.attachments.reduce((total, attachment) => total + attachment.manifest.files.length, 0);
    const totalBytes = message.attachments.reduce((total, attachment) => total + attachment.manifest.total_bytes, 0);
    return [
      {
        label: "可靠状态",
        value: statusDetail[message.status]
      },
      {
        label: "传输路径",
        value: isLocal ? "发送前先落本地库，直连失败时保留队列状态。" : "已写入本机加密历史，不依赖中间服务器留存。"
      },
      {
        label: "附件传输",
        value:
          fileCount > 0
            ? `包含 ${fileCount} 个文件，${formatBytes(totalBytes)}；附件目录可从详情或文件面板定位。`
            : "不含附件。"
      }
    ];
  }

  function messageDeliveryPeerLabel(peerId: string) {
    if (peerId === self?.peer_id) return "我";
    const peer = peers.find((item) => item.peer_id === peerId);
    return peer ? displayPeerName(peer) : messageSenderLabels[peerId] ?? peerId;
  }

  function messageDeliveryReceiptStatus(receipt: MessageDeliveryReceipt) {
    if (!receipt.acknowledged_at) return "等待 ACK";
    return `已送达 · ${new Date(receipt.acknowledged_at).toLocaleString("zh-CN")}`;
  }

  function messageDeliveryReceiptSummary(receipts: MessageDeliveryReceipt[]) {
    const delivered = receipts.filter((receipt) => Boolean(receipt.acknowledged_at)).length;
    return `已送达 ${delivered}/${receipts.length}，等待 ACK ${receipts.length - delivered}`;
  }

  async function startScreenshotWorkflow() {
    try {
      await startScreenCapture();
      chatNotice = screenshotNotice;
      statusText = screenshotNotice;
    } catch (error) {
      chatNotice = `截图启动失败：${error instanceof Error ? error.message : String(error)}`;
      statusText = chatNotice;
    }
  }

  function handleDesktopDragDropPaths(paths: string[]) {
    const normalizedPaths = paths.map((path) => path.trim()).filter(Boolean);
    if (normalizedPaths.length === 0) return;
    if (fileTransferBlockReason) {
      statusText = fileTransferBlockReason;
      chatNotice = fileTransferBlockReason;
      return;
    }
    queuePathDrafts(normalizedPaths, "桌面拖拽", false);
    statusText = `已从桌面拖拽加入 ${normalizedPaths.length} 个项目`;
  }

  function pendingDraftId(index: number) {
    return `file-draft-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addPendingFileDrafts(drafts: PendingFileDraft[]) {
    if (drafts.length === 0) return;
    const existingKeys = new Set(pendingFileDrafts.map((item) => `${item.path}::${item.directory ? "folder" : "file"}`));
    const nextDrafts = drafts.filter((item) => !existingKeys.has(`${item.path}::${item.directory ? "folder" : "file"}`));
    if (nextDrafts.length === 0) {
      statusText = "文件已在待发送列表";
      return;
    }
    pendingFileDrafts = [...pendingFileDrafts, ...nextDrafts].slice(-100);
    chatNotice = "";
    statusText = `已加入待发送：${nextDrafts.length} 个文件`;
  }

  function queuePathDrafts(paths: string[], sourceLabel: string, directory = false) {
    addPendingFileDrafts(
      paths.map((path, index) => ({
        id: pendingDraftId(index),
        name: fileName(path),
        path,
        sourceLabel,
        size: null,
        directory
      }))
    );
  }

  function removePendingFileDraft(id: string) {
    pendingFileDrafts = pendingFileDrafts.filter((item) => item.id !== id);
  }

  function clearPendingFileDrafts() {
    pendingFileDrafts = [];
    statusText = "待发送文件已清空";
  }

  async function sendPendingFileDrafts() {
    if (pendingFileDrafts.length === 0) return;
    if (fileTransferBlockReason) {
      statusText = fileTransferBlockReason;
      chatNotice = fileTransferBlockReason;
      return;
    }
    const drafts = [...pendingFileDrafts];
    const sent = await sendSelectedPaths(drafts.map((item) => item.path), "待发送文件");
    if (sent) {
      pendingFileDrafts = [];
    }
  }

  async function handlePickedFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    if (fileTransferBlockReason) {
      statusText = fileTransferBlockReason;
      chatNotice = fileTransferBlockReason;
      return;
    }
    const fileList = Array.from(files);
    const totalBytes = fileList.reduce((sum, file) => sum + file.size, 0);

    if (hasTauriRuntime()) {
      try {
        const paths = await stageClipboardFiles(fileList);
        if (paths.length === 0) return;
        addPendingFileDrafts(
          paths.map((path, index) => ({
            id: pendingDraftId(index),
            name: fileList[index]?.name ?? fileName(path),
            path,
            sourceLabel: "剪贴板/拖拽",
            size: fileList[index]?.size ?? null,
            directory: false
          }))
        );
      } catch (error) {
        statusText = `暂存剪贴板文件失败：${error instanceof Error ? error.message : String(error)}`;
      }
      return;
    }

    addPendingFileDrafts(
      fileList.map((file, index) => ({
        id: pendingDraftId(index),
        name: file.name,
        path: file.name,
        sourceLabel: "浏览器预览",
        size: file.size,
        directory: false
      }))
    );
    statusText = `已从拖拽/剪贴板加入 ${fileList.length} 个文件，合计 ${formatBytes(totalBytes)}`;
  }

  async function chooseDesktopFiles() {
    if (fileTransferBlockReason) {
      statusText = fileTransferBlockReason;
      chatNotice = fileTransferBlockReason;
      return;
    }
    if (!hasTauriRuntime()) {
      statusText = "浏览器预览模式无法读取真实文件路径，请在桌面版中发送文件";
      return;
    }

    const selected = await open({
      multiple: true,
      directory: false,
      title: "选择要发送的文件"
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length === 0) return;

    queuePathDrafts(paths, "文件", false);
  }

  async function chooseDesktopFolder() {
    if (fileTransferBlockReason) {
      statusText = fileTransferBlockReason;
      chatNotice = fileTransferBlockReason;
      return;
    }
    if (!hasTauriRuntime()) {
      statusText = "浏览器预览模式无法读取真实文件夹路径，请在桌面版中发送文件夹";
      return;
    }

    const selected = await open({
      multiple: true,
      directory: true,
      title: "选择要递归发送的文件夹"
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length === 0) return;

    queuePathDrafts(paths, "文件夹", true);
  }

  async function sendSelectedPaths(paths: string[], sourceLabel: string): Promise<boolean> {
    let message: ChatMessage;
    try {
      message = await sendFiles(activeConversation, paths);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      statusText = `${sourceLabel}发送失败：${reason}`;
      chatNotice = statusText;
      return false;
    }
    const manifest = message.attachments.find((attachment) => attachment.type === "transfer")?.manifest;
    if (!manifest) {
      statusText = `${sourceLabel}发送失败：缺少文件清单`;
      chatNotice = statusText;
      return false;
    }
    upsertTransfer({
      id: manifest.transfer_id,
      conversationId: activeConversation,
      name: manifest.files.length === 1 ? fileName(manifest.files[0].path) : `${manifest.files.length} 个文件`,
      status: "已广播",
      errorMessage: "",
      totalBytes: manifest.total_bytes,
      sentBytes: 0,
      files: manifest.files.map((file) => fileName(file.path)),
      resumable: false
    });
    upsertMessage(message);
    statusText = `${sourceLabel}已加入传输：${manifest.files.length} 个文件`;
    return true;
  }

  function upsertMessage(message: ChatMessage) {
    messages = messages.some((item) => item.id === message.id)
      ? messages.map((item) => (item.id === message.id ? message : item))
      : [...messages, message];
  }

  function handleIncomingMessage(message: ChatMessage) {
    const isActiveConversation = message.conversation_id === activeConversation;
    const existing = conversations.find((conversation) => conversation.id === message.conversation_id);
    const muted = existing?.muted ?? false;
    const blocked = contactMetadataFor(message.sender_id).blocked;
    const policy = incomingConversationPolicy({ isActiveConversation, muted, blocked });
    const mentionsSelf = messageMentionsLocalUser(message);

    if (policy.drop) {
      statusText = `已忽略被阻止联系人的消息：${message.sender_id}`;
      return;
    }

    if (isActiveConversation) {
      upsertMessage({ ...message, status: "read" });
      void markConversationRead(message.conversation_id);
      clearMentionedConversation(message.conversation_id);
    } else if (mentionsSelf) {
      markMentionedConversation(message.conversation_id);
    }

    conversations = upsertConversationForMessage(message, {
      incrementUnread: policy.incrementUnread,
      markRead: policy.markRead
    });

    if (policy.notify) {
      const title = mentionsSelf
        ? `[有人 @ 你] ${conversationTitleFor(message.conversation_id)}`
        : conversationTitleFor(message.conversation_id);
      notify(title, messagePreview(message), message.conversation_id);
    }
  }

  function upsertConversationForMessage(
    message: ChatMessage,
    options: { incrementUnread: boolean; markRead: boolean }
  ): ConversationSummary[] {
    const existing = conversations.find((conversation) => conversation.id === message.conversation_id);
    const lastMessagePreview = messagePreview(message);
    const next: ConversationSummary = existing
      ? {
          ...existing,
          last_message_at: Math.max(existing.last_message_at, message.created_at),
          last_message_preview:
            message.created_at >= existing.last_message_at ? lastMessagePreview : existing.last_message_preview,
          unread_count: options.markRead ? 0 : existing.unread_count + (options.incrementUnread ? 1 : 0),
          manual_unread: options.markRead || options.incrementUnread ? false : existing.manual_unread
        }
      : {
          id: message.conversation_id,
          title: conversationTitleFor(message.conversation_id),
          group_owner_peer_id: "",
          last_message_at: message.created_at,
          last_message_preview: lastMessagePreview,
          unread_count: options.incrementUnread ? 1 : 0,
          manual_unread: false,
          pinned: false,
          muted: false,
          archived: false,
          draft_preview: ""
        };

    return sortConversationSummaries([next, ...conversations.filter((conversation) => conversation.id !== message.conversation_id)]);
  }

  function upsertConversationSummary(summary: ConversationSummary) {
    return sortConversationSummaries([summary, ...conversations.filter((conversation) => conversation.id !== summary.id)]);
  }

  function conversationTitleFor(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation) {
      return conversationDisplayTitle(conversation, peers, contactMetadata);
    }
    if (conversationId.startsWith("group:")) return "内网群聊";
    const peer = directConversationPeer(
      {
        id: conversationId,
        title: conversationId,
        group_owner_peer_id: "",
        last_message_at: 0,
        last_message_preview: "",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: ""
      },
      peers
    );
    return peer ? displayPeerName(peer) : conversationId;
  }

  function upsertPeer(current: PeerProfile[], peer: PeerProfile) {
    return [...current.filter((item) => item.peer_id !== peer.peer_id), peer].sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    );
  }

  function upsertTransfer(task: TransferTask) {
    transferTasks = transferTasks.some((item) => item.id === task.id)
      ? transferTasks.map((item) => (item.id === task.id ? { ...item, ...task } : item))
      : [task, ...transferTasks].slice(0, 50);
  }

  async function openNotificationConversation(conversationId: string, focusWindow: boolean) {
    const target = conversationId.trim();
    pendingNotificationConversationId = "";
    if (!target) return;
    try {
      if (focusWindow && hasTauriRuntime()) {
        await showMainWindow();
      }
      await loadConversation(target);
      activeSection = "messages";
      statusText = `已打开通知会话：${conversationTitleFor(target)}`;
    } catch (error) {
      statusText = `打开通知会话失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function notify(title: string, body: string, conversationId = "") {
    if (notificationReady && hasTauriRuntime()) {
      pendingNotificationConversationId = conversationId.trim();
      sendNotification(messageNotificationOptions(title, body, pendingNotificationConversationId, notificationPreviewEnabled(showNotificationPreview, privacyMode)));
    }
  }

  function shouldNotifyConversation(conversationId: string) {
    const target = conversationId.trim();
    if (!target || target === activeConversation) return false;
    return !(conversations.find((conversation) => conversation.id === target)?.muted ?? false);
  }

  function fileName(path: string) {
    return path.split(/[\\/]/).pop() ?? path;
  }

  function attachmentFileDisplayName(file: { path: string; relative_path?: string | null }) {
    return (file.relative_path?.trim() || fileName(file.path) || "未命名文件").trim();
  }

  function messageAttachmentFileList(message: ChatMessage) {
    return message.attachments
      .filter((attachment) => attachment.type === "transfer")
      .flatMap((attachment) =>
        attachment.manifest.files.map(attachmentFileDisplayName)
      )
      .filter(Boolean)
      .join("\n");
  }

  function transferManifestFileList(manifest: TransferManifest) {
    return manifest.files
      .map(attachmentFileDisplayName)
      .filter(Boolean)
      .join("\n");
  }

  function messageAttachmentNames(message: ChatMessage) {
    return message.attachments
      .filter((attachment) => attachment.type === "transfer")
      .flatMap((attachment) =>
        attachment.manifest.files.map(attachmentFileDisplayName)
      )
      .filter(Boolean);
  }

  function messageAttachmentInlineSummary(message: ChatMessage) {
    const names = messageAttachmentNames(message);
    if (names.length === 0) return message.attachments.length > 0 ? "[附件]" : "";
    if (names.length === 1) return `[文件] ${names[0]}`;
    return `[文件] ${names.slice(0, 3).join("、")}${names.length > 3 ? ` 等 ${names.length} 个` : ""}`;
  }

  function messageCopyPayload(message: ChatMessage) {
    const text = message.body.trim();
    if (text) {
      return {
        text,
        statusText: "消息内容已复制",
        failureLabel: "消息"
      };
    }
    const attachmentList = messageAttachmentFileList(message);
    return {
      text: attachmentList,
      statusText: "附件清单已复制",
      failureLabel: "附件清单"
    };
  }

  function messageQuotePreview(message: ChatMessage) {
    const text = message.body.trim();
    const preview = text || messagePreview(message);
    return (preview || "附件消息").slice(0, 120);
  }

  function messagePreview(message: ChatMessage) {
    if (message.recalled) return "消息已撤回";
    const text = message.body.trim();
    if (text) return text.length > 120 ? `${text.slice(0, 120)}...` : text;
    return messageAttachmentInlineSummary(message);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function safeFileStem(value: string) {
    return value.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 48) || "conversation";
  }
</script>

<svelte:window on:keydown={handleAppKeydown} />

<main
  class:app-dark={dark}
  class:messages-layout={showMessageShell}
  class:welcome-home={showMessageShell && !activeConversation}
  class:workspace-layout={!showMessageShell}
  class:inspector-visible={showInspector}
  class="app"
>
  {#if bootstrapping}
    <section class="startup-progress" role="status" aria-label="启动进度" aria-live="polite">
      <div class="startup-progress-card">
        <span class="startup-logo">灵</span>
        <div>
          <strong>灵犀内网通</strong>
          <p>{bootLabel}</p>
        </div>
        <progress value={bootProgress} max="100">{bootProgress}%</progress>
        <small>{bootProgress}%</small>
      </div>
    </section>
  {/if}
  {#if !appLocked}
  <Rail
    {activeSection}
    {dark}
    unreadCount={totalUnreadCount}
    avatarLabel={railAvatarLabel}
    onSelect={selectSection}
    onToggleTheme={toggleThemePreference}
    onOpenProfileMenu={openAppProfileMenu}
  />

  {#if showMessageShell && !showInspector && (statusText.startsWith("已清空 ") || statusText === "会话已删除")}
    <p class="message-status-toast" role="status" aria-live="polite">{statusText}</p>
  {/if}

  {#if showMessageShell}
    <ConversationList
      {self}
      {peers}
      {contactMetadata}
      {conversations}
      {activeConversation}
      {mentionedConversationIds}
      {todoConversationCounts}
      {outboxConversationCounts}
      {failedOutboxConversationCounts}
      {typingPreviewByConversation}
      {privacyMode}
      onSelectConversation={loadConversation}
      onOpenPeerDetails={openPeerDetails}
      onSearchMessages={searchMessages}
      onOpenMessageResult={openMessageResult}
      onOpenConversationSearch={openSidebarConversationSearch}
      onRefreshPeers={refreshPeers}
      onMarkAllRead={markEveryConversationRead}
      onConversationContext={openConversationContextMenu}
      onPeerContext={openPeerConversationContextMenu}
    />
  {/if}

  {#if showMessageShell && activeConversation}
    <ChatWorkspace
      title={activeConversationTitle}
      conversation={activeConversationSummary}
      {activePeer}
      selfPeerId={self?.peer_id ?? "local-demo"}
      selfDisplayName={self?.display_name ?? ""}
      {messages}
      {transferTasks}
      {draft}
      notice={chatNotice || (statusText.startsWith("已清空 ") ? "" : statusText)}
      {quickReplies}
      isGroup={activeConversation.startsWith("group:")}
      memberCount={activeGroupMemberCount}
      {messageSenderLabels}
      mentionableMembers={activeGroupMembers}
      sendDisabledReason={outgoingBlockReason}
      conversationActionsDisabledReason={noActiveConversationReason}
      {fileActionsDisabled}
      fileActionsDisabledReason={fileTransferBlockReason}
      {pendingFileDrafts}
      {replyQuote}
      {conversationSearchOpen}
      {nudgePulseKey}
      {conversationSearchFocus}
      {conversationSearchQuery}
      {conversationSearchDate}
      {conversationSearchResults}
      {pinnedMessages}
      {todoMessages}
      {focusedMessageId}
      {messageSelectionMode}
      {selectedMessageIds}
      {hasMoreMessages}
      {loadingOlderMessages}
      onClearReplyQuote={() => {
        replyQuote = null;
        scheduleDraftSave();
      }}
      typingText={typingText}
      {sendShortcut}
      onDraftChange={handleDraftChange}
      onSend={handleSend}
      onSendNudge={handleSendNudge}
      onPickFiles={handlePickedFiles}
      onChooseDesktopFiles={chooseDesktopFiles}
      onChooseDesktopFolder={chooseDesktopFolder}
      onRemovePendingFile={removePendingFileDraft}
      onClearPendingFiles={clearPendingFileDrafts}
      onSendPendingFiles={sendPendingFileDrafts}
      onStartScreenshot={startScreenshotWorkflow}
      onShowDetails={() => {
        inspectorTab = activeConversation.startsWith("group:") ? "members" : "details";
        inspectorOpen = true;
      }}
      onShowTransfers={() => {
        inspectorTab = "transfers";
        inspectorOpen = true;
      }}
      onOpenTransfer={openTransfer}
      onCopyAttachmentFiles={copyAttachmentFiles}
      onRetryMessage={resendMessage}
      onMarkConversationRead={() => markConversationReadById(activeConversation)}
      onMarkConversationUnread={() => markConversationUnreadById(activeConversation)}
      onTogglePin={() => toggleConversationPinned(activeConversation)}
      onToggleMute={() => toggleConversationMuted(activeConversation)}
      onToggleArchive={() => toggleConversationArchived(activeConversation)}
      onToggleConversationSearch={toggleConversationSearch}
      onOpenConversationDateJump={openConversationDateJump}
      onConversationSearchQueryChange={(value) => (conversationSearchQuery = value)}
      onConversationSearchDateChange={(value) => (conversationSearchDate = value)}
      onRunConversationSearch={runConversationSearch}
      onRunConversationDateJump={jumpConversationDate}
      onFocusConversationSearchResult={focusConversationSearchResult}
      onClearConversationSearch={clearConversationSearchState}
      onLoadOlderMessages={loadOlderMessages}
      onMessageContext={openMessageContextMenu}
      onReactMessage={toggleMessageReaction}
      onStartMessageSelection={() => startMessageSelection()}
      onToggleMessageSelection={toggleMessageSelection}
      onCancelMessageSelection={cancelMessageSelection}
      onToggleSelectAllMessages={toggleSelectAllLoadedMessages}
      onBulkCopyMessages={copySelectedMessages}
      onBulkFavoriteMessages={favoriteSelectedMessages}
      onBulkPinMessages={pinSelectedMessages}
      onBulkTodoMessages={todoSelectedMessages}
      onBulkForwardMessages={openSelectedForwardDialog}
      onBulkDeleteMessages={confirmDeleteSelectedMessages}
      onUnpinPinnedMessage={unpinPinnedMessage}
    />
  {:else if showMessageShell}
    <section class="empty-workspace-panel" aria-label="空会话">
      <div class="empty-workspace-card welcome-launchpad">
        <div class="welcome-main">
          <div class="welcome-copy">
            <span class="welcome-kicker">
              <ShieldCheck size={15} />
              局域网直连 · 无中间服务器
            </span>
            <h1>
              <span>内网消息</span>
              <span>即刻直连</span>
            </h1>
            <p>发现同网段设备、发起直连会话、继续文件传输，都在这个工作台完成。</p>
          </div>
          <div class:warning={Boolean(networkWarning)} class="welcome-dashboard" aria-label="直连态势">
            <header>
              {#if networkWarning}
                <BellOff size={18} />
              {:else}
                <CheckCircle2 size={18} />
              {/if}
              <span>
                <strong>{networkWarning ? "网络需要关注" : "直连态势"}</strong>
                <small>{welcomeSignalText}</small>
              </span>
            </header>
            <div class="welcome-dashboard-meter">
              <b>{reachablePeerCount}</b>
              <span>可联系设备</span>
            </div>
            <div class="welcome-dashboard-grid">
              <span>
                <RefreshCw size={14} />
                UDP 发现
                <b>{peers.length}</b>
              </span>
              <span>
                <MessageSquareText size={14} />
                会话
                <b>{conversations.length}</b>
              </span>
              <span>
                <UploadCloud size={14} />
                文件传输
                <b>{transferTasks.length}</b>
              </span>
              <span>
                <ShieldCheck size={14} />
                待处理
                <b>{pendingOutboxCount + totalUnreadCount}</b>
              </span>
            </div>
          </div>
	          <div class="welcome-status-strip" aria-label="当前概览">
	            <span><b>{reachablePeerCount}</b> 可联系</span>
	            <span><b>{conversations.length}</b> 会话</span>
	            <span><b>{pendingOutboxCount + totalUnreadCount}</b> 待处理</span>
	          </div>
	          <section class="welcome-recent-card" aria-label="最近消息">
	            {#if welcomeRecentConversation}
	              <button type="button" on:click={() => loadConversation(welcomeRecentConversation?.id ?? "")}>
	                <span class="welcome-recent-icon">
	                  <MessageSquareText size={18} />
	                </span>
	                <span class="welcome-recent-copy">
	                  <small>最近消息</small>
	                  <strong>{welcomeRecentTitle}</strong>
	                  <em>{welcomeRecentPreview}</em>
	                </span>
	                <span class="welcome-recent-meta">
	                  <time>{welcomeRecentTime}</time>
	                  {#if welcomeRecentConversation.unread_count > 0}
	                    <b>{welcomeRecentConversation.unread_count > 99 ? "99+" : welcomeRecentConversation.unread_count}</b>
	                  {/if}
	                </span>
	              </button>
	            {:else}
	              <div>
	                <span class="welcome-recent-icon">
	                  <MessageSquareText size={18} />
	                </span>
	                <span class="welcome-recent-copy">
	                  <small>最近消息</small>
	                  <strong>等待第一条内网消息</strong>
	                  <em>发现设备后可直接开聊，文件与图片也会出现在这里。</em>
	                </span>
	              </div>
	            {/if}
	          </section>
	          <div class="welcome-route-grid" aria-label="快速入口">
            <button type="button" on:click={() => (activeSection = "contacts")}>
              <UserRound size={15} />
              <span>
                <strong>找人开聊</strong>
                <small>{reachablePeerCount} 台设备可联系，{unavailablePeerCount} 台暂不可达</small>
              </span>
            </button>
            <button type="button" on:click={refreshPeers}>
              <RefreshCw size={15} />
              <span>
                <strong>重新发现</strong>
                <small>刷新 UDP 发现结果和在线状态</small>
              </span>
            </button>
            <button type="button" on:click={() => (activeSection = "files")}>
              <UploadCloud size={15} />
              <span>
                <strong>文件传输</strong>
                <small>查看断点续传和接收目录</small>
              </span>
            </button>
            <button type="button" on:click={() => (activeSection = "settings")}>
              <Settings size={15} />
              <span>
                <strong>调好体验</strong>
                <small>通知、托盘、主题和安全信任</small>
              </span>
            </button>
          </div>
          <div class="empty-workspace-actions">
            <button class="tool-button primary-welcome-action" type="button" aria-label="查看联系人" on:click={() => (activeSection = "contacts")}>
              <UserRound size={15} />
              查看联系人
            </button>
            <button class="tool-button" type="button" aria-label="刷新联系人" on:click={refreshPeers}>
              <RefreshCw size={15} />
              刷新联系人
            </button>
            <button class="tool-button" type="button" aria-label="打开设置" on:click={() => (activeSection = "settings")}>
              <Settings size={15} />
              打开设置
            </button>
          </div>
        </div>
        <aside class="welcome-network-panel" aria-label="内网直连状态">
          <div class="welcome-topology" aria-hidden="true">
            <span class="topology-node local">本机</span>
            <span class="topology-link link-a"></span>
            <span class="topology-link link-b"></span>
            <span class="topology-link link-c"></span>
            <span class="topology-node peer peer-a">{reachablePeerCount}</span>
            <span class="topology-node peer peer-b">{conversations.length}</span>
            <span class="topology-node peer peer-c">{pendingOutboxCount + totalUnreadCount}</span>
          </div>
          <div class:warning={Boolean(networkWarning)} class="welcome-signal-card">
            {#if networkWarning}
              <BellOff size={18} />
            {:else}
              <CheckCircle2 size={18} />
            {/if}
            <div>
              <strong>{networkWarning ? "网络需要关注" : "直连状态正常"}</strong>
              <span>{welcomeSignalText}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  {:else}
    <WorkspacePanel
      section={activeSection}
      {peers}
      {self}
      {focusedContactPeerId}
      {contactMetadata}
      {selectedPeerIds}
      {searchResults}
      {favoriteMessages}
      {todoMessages}
      {outboxMessages}
      conversationTitles={conversationTitleMap}
      {query}
      {settings}
      {transportConfig}
      {transferTasks}
      {profileName}
      {profileHostname}
      {profileStatus}
      {notificationReady}
      {dark}
      {sendShortcut}
      shortcuts={appShortcuts}
      {showNotificationPreview}
      {privacyMode}
      {closeToTray}
      {loginEnabled}
      {loginPasswordDraft}
      {loginPasswordConfirmDraft}
      {loginPasswordReady}
      {profileSignature}
      {avatarLabel}
      {requireContactForMessaging}
      {statusText}
      {trustStatus}
      {trayStatus}
      {networkInputWarning}
      {networkWarnings}
      {storageOverview}
      {storageMigrationProgress}
      {storageMigrationActive}
      {trustedPeers}
      {settingsTab}
      onTogglePeer={togglePeer}
      onContactMetadataChange={updateContactDraft}
      onSaveContactMetadata={saveContactMetadata}
      onContactContext={openContactContextMenu}
      onOpenSettingsTab={openSettings}
      onSelectConversation={loadConversation}
      onOpenMessageResult={openMessageResult}
      onMessageContext={openMessageContextMenu}
      onRetryOutboxMessages={retryOutboxMessages}
      onCreateGroup={handleCreateGroup}
      onRefreshPeers={refreshPeers}
      onSearch={handleSearch}
      onRefreshFavorites={async () => {
        const refreshed = await refreshMessageCollections();
        statusText = `已刷新消息资料：收藏 ${refreshed.favorites.length} 条，待办 ${refreshed.todos.length} 条，发件箱 ${refreshed.outbox.length} 条`;
      }}
      onCopyNetworkDiagnostics={copyNetworkDiagnostics}
      onTrustPeer={handleTrustPeer}
      onRemoveTrustedPeer={forgetTrustedPeer}
      onProfileNameChange={(value) => (profileName = value)}
      onProfileHostnameChange={(value) => (profileHostname = value)}
      onProfileStatusChange={(value) => (profileStatus = value)}
      onSaveProfile={saveProfile}
      onCopyIdentityValue={copyIdentityValue}
      onEnableNotifications={enableNotifications}
      onMinimizeToTray={minimizeWindowToTray}
      onToggleTheme={toggleThemePreference}
      onSetSendShortcut={setSendShortcutPreference}
      onSetScreenshotShortcut={setScreenshotShortcutPreference}
      onSetWindowShortcut={setWindowShortcutPreference}
      onToggleNotificationPreview={toggleNotificationPreviewPreference}
      onTogglePrivacyMode={togglePrivacyModePreference}
      onToggleCloseToTray={toggleCloseToTrayPreference}
      onToggleRequireContactForMessaging={toggleRequireContactForMessaging}
      onLoginEnabledChange={(value) => (loginEnabled = value)}
      onLoginPasswordDraftChange={(value) => (loginPasswordDraft = value)}
      onLoginPasswordConfirmChange={(value) => (loginPasswordConfirmDraft = value)}
      onSaveLoginSettings={saveLoginSettings}
      onProfileSignatureChange={(value) => (profileSignature = value)}
      onAvatarLabelChange={(value) => (avatarLabel = value)}
      onSaveProfileExtras={saveProfileExtras}
      onRefreshStorage={refreshStorageOverview}
      onMigrateStorageDirectory={chooseAndMigrateStorageDirectory}
      onClearStagedFiles={clearClipboardStaging}
      onOpenStorage={openStorage}
      onCopyStoragePath={copyStoragePath}
      onCopyStorageDiagnostics={copyStorageDiagnostics}
      onCopyTrustedFingerprint={copyIdentityValue}
      onOpenTransfer={openTransfer}
      onDeleteTransfer={confirmDeleteTransfer}
      onCancelTransfer={stopTransfer}
      onResumeTransfer={resumeStoppedTransfer}
      onTransferContext={openTransferContextMenu}
      onClearCompletedTransfers={clearFinishedTransfers}
      onCopyTransferId={copyStoragePath}
    />
  {/if}

  {#if showInspector}
    <Inspector
    tab={inspectorTab}
    conversation={activeConversationSummary}
    {settings}
    {activePeer}
    {messages}
    selfPeerId={self?.peer_id ?? ""}
    {contactMetadata}
    peers={activeConversation.startsWith("group:") ? activeGroupMembers : peers}
    allPeers={peers}
    isGroup={activeConversation.startsWith("group:")}
    {groupNameDraft}
    {groupAnnouncementDraft}
    {groupMemberDraftIds}
    canManageGroup={activeGroupCanManage}
    {transferTasks}
    {storageOverview}
    {networkWarning}
    {networkWarnings}
    {networkInputWarning}
    {trustStatus}
    {statusText}
    onTabChange={(value) => (inspectorTab = value)}
    onCopyNetworkDiagnostics={copyNetworkDiagnostics}
    onTrustPeer={() => handleTrustPeer(activePeer)}
    onGroupNameChange={(value) => (groupNameDraft = value)}
    onGroupAnnouncementChange={(value) => (groupAnnouncementDraft = value)}
    onToggleGroupMember={toggleGroupMemberDraft}
    onSaveGroup={saveActiveGroup}
    onExportConversation={exportActiveConversation}
    onTogglePin={() => toggleConversationPinned(activeConversation)}
    onToggleMute={() => toggleConversationMuted(activeConversation)}
    onToggleArchive={() => toggleConversationArchived(activeConversation)}
    onClearConversationMessages={clearActiveConversationMessages}
    onDeleteConversation={() => confirmDeleteConversationById(activeConversation)}
    onOpenTransfer={openTransfer}
    onDeleteTransfer={confirmDeleteTransfer}
    onCancelTransfer={stopTransfer}
    onResumeTransfer={resumeStoppedTransfer}
    onRefreshStorage={refreshStorageOverview}
    onClearStagedFiles={clearClipboardStaging}
    onOpenStorage={openStorage}
    onCopyStoragePath={copyStoragePath}
    onCopyStorageDiagnostics={copyStorageDiagnostics}
    onCopyIdentityValue={copyIdentityValue}
    onOpenDirectConversation={(peerId) => loadConversation(`direct:${peerId}`)}
    onContactMetadataChange={updateContactDraft}
    onSaveContactMetadata={saveContactMetadata}
    />
  {/if}
  {/if}

  {#if appLocked}
    <div class="modal-backdrop login-lock-backdrop" role="presentation">
      <div
        class="login-lock-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="登录解锁"
      >
        <form class="login-lock-form" on:submit|preventDefault={unlockApp}>
          <span class="startup-logo">灵</span>
          <div>
            <span class="eyebrow">本机登录</span>
            <h2>灵犀内网通已锁定</h2>
            <p>请输入本机登录密码，解锁后继续内网直连会话。</p>
          </div>
          <label class="field">
            <span>登录密码</span>
            <input
              type="password"
              autocomplete="current-password"
              value={loginUnlockDraft}
              on:input={(event) => (loginUnlockDraft = (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          {#if loginUnlockError}
            <p class="warning">{loginUnlockError}</p>
          {/if}
          <button class="primary-action" type="submit">解锁进入</button>
        </form>
      </div>
    </div>
  {/if}

  {#if storageMigrationActive}
    <div class="modal-backdrop migration-lock" role="presentation">
      <div class="migration-dialog" role="dialog" aria-modal="true" aria-label="数据目录迁移中">
        <span class="eyebrow">存储迁移</span>
        <h2>正在迁移数据目录</h2>
        <p>为避免数据丢失，迁移完成前暂时不能操作应用。完成后会自动重启并从新目录打开数据库。</p>
        {#if storageMigrationProgress}
          <progress
            max={Math.max(storageMigrationProgress.total, 1)}
            value={Math.min(storageMigrationProgress.completed, Math.max(storageMigrationProgress.total, 1))}
          ></progress>
          <small>
            {storageMigrationProgress.total > 0
              ? `${storageMigrationProgress.completed}/${storageMigrationProgress.total}`
              : "准备迁移文件"}
          </small>
          <span title={storageMigrationProgress.current_path}>{storageMigrationProgress.current_path}</span>
        {/if}
      </div>
    </div>
  {/if}

  {#if messageMenu}
    <div
      bind:this={contextMenuElement}
      class="context-menu"
      style={`left: ${messageMenu.x}px; top: ${messageMenu.y}px;`}
      role="menu"
      aria-label="消息快捷菜单"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => handleContextMenuKeydown(event, () => (messageMenu = null))}
    >
      <button type="button" role="menuitem" on:click={copyContextMessage}>
        <Copy size={13} />
        复制消息
      </button>
      {#if !messageMenu.message.recalled}
        <div class="reaction-menu-row" role="group" aria-label="快捷回应">
          {#each quickReactions as reaction}
            <button
              class:active={(messageMenu.message.reactions ?? []).some(
                (item) => item.sender_id === self?.peer_id && item.reaction === reaction
              )}
              type="button"
              title={`回应 ${reaction}`}
              on:click={() => toggleReactionContextMessage(reaction)}
            >
              {reaction}
            </button>
          {/each}
        </div>
        <button type="button" role="menuitem" on:click={quoteContextMessage}>
          <Reply size={13} />
          引用回复
        </button>
        <button type="button" role="menuitem" on:click={openForwardContextMessage}>
          <UploadCloud size={13} />
          转发消息
        </button>
        <button type="button" role="menuitem" on:click={() => startMessageSelection(messageMenu?.message)}>
          <CheckSquare size={13} />
          多选消息
        </button>
        <button type="button" role="menuitem" on:click={toggleFavoriteContextMessage}>
          <Star size={13} />
          {messageMenu.message.favorited ? "取消收藏" : "收藏消息"}
        </button>
        <button type="button" role="menuitem" on:click={toggleTodoContextMessage}>
          <CheckSquare size={13} />
          {isMessageTodo(messageMenu.message) ? "完成待办" : "加入待办"}
        </button>
        <button type="button" role="menuitem" on:click={togglePinContextMessage}>
          {#if isMessagePinned(messageMenu.message)}<PinOff size={13} />{:else}<Pin size={13} />{/if}
          {isMessagePinned(messageMenu.message) ? "取消置顶" : "置顶消息"}
        </button>
      {/if}
      {#if canRetryLocalMessage(messageMenu.message)}
        <button type="button" role="menuitem" on:click={resendContextMessage}>
          <RefreshCw size={13} />
          重新发送
        </button>
      {/if}
      {#if messageMenu.message.sender_id === self?.peer_id && !messageMenu.message.recalled}
        <button type="button" role="menuitem" on:click={revokeContextMessage}>
          <Reply size={13} />
          撤回消息
        </button>
      {/if}
      <button type="button" role="menuitem" on:click={openContextMessageInfo}>
        <Info size={13} />
        消息详情
      </button>
      <button type="button" role="menuitem" on:click={openContextMessageDetails}>
        <MessageSquareText size={13} />
        会话详情
      </button>
      <button class="danger" type="button" role="menuitem" on:click={deleteContextMessage}>
        <Trash2 size={13} />
        删除消息
      </button>
    </div>
  {/if}

  {#if conversationMenu}
    <div
      bind:this={contextMenuElement}
      class="context-menu"
      style={`left: ${conversationMenu.x}px; top: ${conversationMenu.y}px;`}
      role="menu"
      aria-label="会话快捷菜单"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => handleContextMenuKeydown(event, () => (conversationMenu = null))}
    >
      <button type="button" role="menuitem" on:click={openConversationFromMenu}>
        <MessageSquareText size={13} />
        打开会话
      </button>
      <button type="button" role="menuitem" on:click={openMenuConversationDetails}>
        <Info size={13} />
        会话详情
      </button>
      <button type="button" role="menuitem" on:click={copyConversationIdFromMenu}>
        <Copy size={13} />
        复制会话 ID
      </button>
      <button type="button" role="menuitem" on:click={copyConversationDiagnosticFromMenu}>
        <FileText size={13} />
        复制会话诊断
      </button>
      <button type="button" role="menuitem" on:click={toggleMenuConversationPinned}>
        {#if conversationMenu.conversation.pinned}<PinOff size={13} />{:else}<Pin size={13} />{/if}
        {conversationMenu.conversation.pinned ? "取消置顶" : "置顶"}
      </button>
      <button type="button" role="menuitem" on:click={toggleMenuConversationMuted}>
        {#if conversationMenu.conversation.muted}<Volume2 size={13} />{:else}<BellOff size={13} />{/if}
        {conversationMenu.conversation.muted ? "取消免打扰" : "免打扰"}
      </button>
      <button type="button" role="menuitem" on:click={toggleMenuConversationArchived}>
        <Archive size={13} />
        {conversationMenu.conversation.archived ? "取消归档" : "归档"}
      </button>
      {#if conversationMenu.conversation.unread_count > 0}
        <button type="button" role="menuitem" on:click={markMenuConversationRead}>
          <CheckCheck size={13} />
          标为已读
        </button>
      {:else}
        <button type="button" role="menuitem" on:click={markMenuConversationUnread}>
          <MessageSquareText size={13} />
          标为未读
        </button>
      {/if}
      <button type="button" role="menuitem" on:click={exportMenuConversation}>
        <FileText size={13} />
        导出聊天记录
      </button>
      <button class="danger" type="button" role="menuitem" on:click={clearMenuConversationMessages}>
        <Trash2 size={13} />
        清空聊天记录
      </button>
      <button class="danger" type="button" role="menuitem" on:click={deleteMenuConversation}>
        <Trash2 size={13} />
        删除会话
      </button>
    </div>
  {/if}

  {#if contactMenu}
    <div
      bind:this={contextMenuElement}
      class="context-menu contact-context-menu"
      style={`left: ${contactMenu.x}px; top: ${contactMenu.y}px;`}
      role="menu"
      aria-label="联系人快捷菜单"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => handleContextMenuKeydown(event, () => (contactMenu = null))}
    >
      <button type="button" role="menuitem" disabled={contactMetadataFor(contactMenu.peer.peer_id).blocked} on:click={openContactConversationFromMenu}>
        <MessageSquareText size={13} />
        发起聊天
      </button>
      <button type="button" role="menuitem" on:click={openContactDetailsFromMenu}>
        <UserRound size={13} />
        联系人详情
      </button>
      <button type="button" role="menuitem" on:click={copyContactDiagnosticFromMenu}>
        <FileText size={13} />
        复制联系人诊断
      </button>
      <button type="button" role="menuitem" on:click={toggleContactFavoriteFromMenu}>
        <Star size={13} />
        {contactMetadataFor(contactMenu.peer.peer_id).favorite ? "取消星标" : "星标联系人"}
      </button>
      <button class="danger" type="button" role="menuitem" on:click={toggleContactBlockedFromMenu}>
        <Ban size={13} />
        {contactMetadataFor(contactMenu.peer.peer_id).blocked ? "取消阻止" : "阻止联系人"}
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label={`复制${displayPeerName(contactMenu.peer)}设备 ID`}
        title={`复制${displayPeerName(contactMenu.peer)}设备 ID`}
        on:click={copyContactDeviceIdFromMenu}
      >
        <Copy size={13} />
        复制设备 ID
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label={`复制${displayPeerName(contactMenu.peer)}端点`}
        title={`复制${displayPeerName(contactMenu.peer)}端点`}
        disabled={contactMenu.peer.endpoints.length === 0}
        on:click={copyContactEndpointFromMenu}
      >
        <Copy size={13} />
        复制端点
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label={`复制${displayPeerName(contactMenu.peer)}指纹`}
        title={`复制${displayPeerName(contactMenu.peer)}指纹`}
        on:click={copyContactFingerprintFromMenu}
      >
        <ShieldCheck size={13} />
        复制指纹
      </button>
    </div>
  {/if}

  {#if transferMenu}
    <div
      bind:this={contextMenuElement}
      class="context-menu transfer-context-menu"
      style={`left: ${transferMenu.x}px; top: ${transferMenu.y}px;`}
      role="menu"
      aria-label="传输快捷菜单"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => handleContextMenuKeydown(event, () => (transferMenu = null))}
    >
      <button type="button" role="menuitem" on:click={openTransferFromMenu}>
        <HardDrive size={13} />
        定位传输目录
      </button>
      <button type="button" role="menuitem" on:click={copyTransferIdFromMenu}>
        <Copy size={13} />
        复制传输 ID
      </button>
      <button type="button" role="menuitem" on:click={copyTransferFileListFromMenu}>
        <Copy size={13} />
        复制文件清单
      </button>
      <button type="button" role="menuitem" on:click={copyTransferDiagnosticFromMenu}>
        <FileText size={13} />
        复制传输记录
      </button>
      {#if isActiveTransferTask(transferMenu.task)}
        <button type="button" role="menuitem" on:click={cancelTransferFromMenu}>
          <X size={13} />
          取消传输
        </button>
      {/if}
      {#if transferMenu.task.resumable}
        <button type="button" role="menuitem" on:click={resumeTransferFromMenu}>
          <RefreshCw size={13} />
          重新广播
        </button>
      {/if}
      <button class="danger" type="button" role="menuitem" on:click={deleteTransferFromMenu}>
        <Trash2 size={13} />
        删除记录
      </button>
    </div>
  {/if}

  {#if appMenu}
    <div
      bind:this={contextMenuElement}
      class="context-menu app-context-menu"
      style={`left: ${appMenu.x}px; top: ${appMenu.y}px;`}
      role="menu"
      aria-label="个人快捷菜单"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => handleContextMenuKeydown(event, () => (appMenu = null))}
    >
      <div class="profile-menu-card" role="presentation">
        <span class="profile-menu-avatar">{railAvatarLabel}</span>
        <div>
          <strong>{displaySelfName}</strong>
          <small>{profileSignature || "内网直连已就绪"}</small>
          <em>{self?.hostname || "本机设备"} · {self?.endpoints[0] || `${transportConfig.listen_port}/QUIC`}</em>
        </div>
        <span class={`profile-menu-status ${profileStatus}`}>{profileStatusText}</span>
      </div>
      <div class="profile-menu-status-grid" role="group" aria-label="切换在线状态">
        {#each profileMenuStatusChoices as choice (choice.value)}
          <button
            class:active={profileStatus === choice.value}
            class="profile-menu-status-choice"
            type="button"
            role="menuitemradio"
            aria-checked={profileStatus === choice.value}
            on:click={() => updateStatusFromAppMenu(choice.value)}
          >
            <span class={`presence-dot ${choice.tone}`}></span>
            {choice.label}
          </button>
        {/each}
      </div>
      <button type="button" role="menuitem" on:click={openSignatureFromAppMenu}>
        <FileText size={13} />
        编辑签名
      </button>
      <button type="button" role="menuitem" on:click={openAvatarFromAppMenu}>
        <UserRound size={13} />
        设置头像
      </button>
      <button type="button" role="menuitem" on:click={refreshPeersFromAppMenu}>
        <RefreshCw size={13} />
        刷新联系人
      </button>
      <button type="button" role="menuitem" on:click={openContactsFromAppMenu}>
        <UserRound size={13} />
        联系人
      </button>
      <button type="button" role="menuitem" on:click={openFilesFromAppMenu}>
        <UploadCloud size={13} />
        文件传输
      </button>
      <button type="button" role="menuitem" on:click={openSettingsFromAppMenu}>
        <Settings size={13} />
        打开设置
      </button>
      <button type="button" role="menuitem" on:click={minimizeToTrayFromAppMenu}>
        <Minimize2 size={13} />
        最小化到托盘
      </button>
      <button type="button" role="menuitem" on:click={toggleThemeFromAppMenu}>
        <Palette size={13} />
        {dark ? "浅色主题" : "深色主题"}
      </button>
    </div>
  {/if}

  {#if textEditMenu}
    <div
      bind:this={contextMenuElement}
      class="context-menu text-edit-context-menu"
      style={`left: ${textEditMenu.x}px; top: ${textEditMenu.y}px;`}
      role="menu"
      aria-label="文本编辑菜单"
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => handleContextMenuKeydown(event, () => (textEditMenu = null))}
    >
      <button type="button" role="menuitem" on:click={() => copyTextEditSelection(false)}>
        <Copy size={13} />
        复制
      </button>
      <button type="button" role="menuitem" on:click={() => copyTextEditSelection(true)}>
        <Scissors size={13} />
        剪切
      </button>
      <button type="button" role="menuitem" on:click={pasteTextEditClipboard}>
        <FileText size={13} />
        粘贴
      </button>
      <button type="button" role="menuitem" on:click={selectAllTextEdit}>
        <CheckSquare size={13} />
        全选
      </button>
    </div>
  {/if}

  {#if detailMessage}
    <div class="modal-backdrop" role="presentation" on:click={closeMessageDetails}>
      <div
        class="message-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="消息详情"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={(event) => {
          if (event.key === "Escape") closeMessageDetails();
        }}
      >
        <header>
          <div>
            <span class="eyebrow">详情</span>
            <h2>消息详情</h2>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭" on:click={closeMessageDetails}>
            <X size={15} />
          </button>
        </header>
        <div class="message-detail-content">
          <dl class="message-detail-grid">
            <div>
              <dt>消息 ID</dt>
              <dd>{detailMessage.id}</dd>
            </div>
            <div>
              <dt>方向</dt>
              <dd>{messageDirectionLabel(detailMessage)}</dd>
            </div>
            <div>
              <dt>会话</dt>
              <dd>{detailMessage.conversation_id}</dd>
            </div>
            <div>
              <dt>发送人</dt>
              <dd>{messageSenderLabel(detailMessage)}</dd>
            </div>
            <div>
              <dt>时间</dt>
              <dd>{new Date(detailMessage.created_at).toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{messageStatusLabel(detailMessage.status)}</dd>
            </div>
            <div>
              <dt>发送尝试</dt>
              <dd>{messageSendAttemptLabel(detailMessage)}</dd>
            </div>
            <div>
              <dt>最后尝试</dt>
              <dd>{messageLastAttemptLabel(detailMessage)}</dd>
            </div>
            <div>
              <dt>附件</dt>
              <dd>{detailMessage.attachments.length} 个</dd>
            </div>
            <div>
              <dt>回应</dt>
              <dd>{messageReactionSummary(detailMessage)}</dd>
            </div>
            <div>
              <dt>标记</dt>
              <dd>{messageFlagLabel(detailMessage)}</dd>
            </div>
          </dl>
          <section class="message-detail-audit" aria-label="交付审计">
            <strong>交付审计</strong>
            {#each messageDeliveryAuditItems(detailMessage) as item}
              <div>
                <span>{item.label}</span>
                <p>{item.value}</p>
              </div>
            {/each}
          </section>
          {#if detailMessage.sender_id === self?.peer_id}
            <section class="message-detail-recipients" aria-label="逐成员送达">
              <strong>逐成员送达</strong>
              {#if messageDeliveryReceiptsLoading}
                <p class="hint">正在读取送达明细...</p>
              {:else if messageDeliveryReceipts.length === 0}
                <p class="hint">没有可审计收件人。</p>
              {:else}
                <p class="message-detail-receipt-summary">{messageDeliveryReceiptSummary(messageDeliveryReceipts)}</p>
                {#each messageDeliveryReceipts as receipt (receipt.peer_id)}
                  <div>
                    <span>{messageDeliveryPeerLabel(receipt.peer_id)}</span>
                    <p>{messageDeliveryReceiptStatus(receipt)}</p>
                  </div>
                {/each}
              {/if}
            </section>
          {/if}
          {#if !detailMessage.recalled && detailMessage.body.trim()}
            <div class="message-detail-body">
              <strong>消息正文</strong>
              <p>{detailMessage.body}</p>
            </div>
          {/if}
          {#if detailMessage.quote}
            <div class="message-detail-quote">
              <strong>引用</strong>
              <span>{detailMessage.quote.sender_id} · {detailMessage.quote.body_preview}</span>
            </div>
          {/if}
          {#if detailMessage.attachments.length > 0}
            <div class="message-detail-attachments">
              <strong>附件清单</strong>
              {#each detailMessage.attachments as attachment (attachment.manifest.transfer_id)}
                <div class="message-detail-attachment">
                  <span>{attachment.manifest.files.length} 个文件 · {formatBytes(attachment.manifest.total_bytes)} · {attachment.manifest.transfer_id}</span>
                  <ul>
                    {#each attachment.manifest.files.slice(0, 6) as file}
                      <li>{attachmentFileDisplayName(file)} · {formatBytes(file.size)}</li>
                    {/each}
                  </ul>
                  {#if attachment.manifest.files.length > 6}
                    <small>还有 {attachment.manifest.files.length - 6} 个文件</small>
                  {/if}
                  <small>SHA-256 · {attachment.manifest.sha256}</small>
                  <div class="message-detail-attachment-actions">
                    <button class="row-action" type="button" on:click={() => openTransfer(attachment.manifest.transfer_id)}>
                      <HardDrive size={13} />
                      打开附件目录
                    </button>
                    <button class="row-action" type="button" on:click={() => copyMessageDetailAttachmentList(attachment.manifest)}>
                      <Copy size={13} />
                      复制附件清单
                    </button>
                    <button class="row-action" type="button" on:click={() => copyMessageDetailValue(attachment.manifest.transfer_id, "附件传输 ID")}>
                      <Copy size={13} />
                      复制附件传输 ID
                    </button>
                    <button class="row-action" type="button" on:click={() => copyMessageDetailValue(attachment.manifest.sha256, "附件 SHA-256")}>
                      <Copy size={13} />
                      复制附件 SHA-256
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <div class="message-detail-actions">
          <button class="row-action" type="button" on:click={() => copyMessageDetailAuditReport(detailMessage)}>
            <Copy size={13} />
            复制审计报告
          </button>
          <button class="row-action" type="button" on:click={() => copyMessageDetailValue(detailMessage.id, "消息 ID")}>
            <Copy size={13} />
            复制消息 ID
          </button>
          <button class="row-action" type="button" on:click={() => copyMessageDetailValue(detailMessage.conversation_id, "会话 ID")}>
            <Copy size={13} />
            复制会话 ID
          </button>
        </div>
        {#if messageDetailStatus}
          <p class="hint message-detail-status">{messageDetailStatus}</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if confirmDialog}
    <div class="modal-backdrop" role="presentation" on:click={closeConfirmDialog}>
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={confirmDialog.title}
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={(event) => {
          if (event.key === "Escape") closeConfirmDialog();
        }}
      >
        <header>
          <div>
            <span class="eyebrow">危险操作</span>
            <h2>{confirmDialog.title}</h2>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭" on:click={closeConfirmDialog}>
            <X size={15} />
          </button>
        </header>
        <p>{confirmDialog.body}</p>
        <div class="confirm-dialog-actions">
          <button class="row-action" type="button" on:click={closeConfirmDialog}>
            <X size={13} />
            取消
          </button>
          <button class:danger={confirmDialog.danger} class="row-action" type="button" on:click={confirmDialogAction}>
            {#if confirmDialog.danger}
              <Trash2 size={13} />
            {:else}
              <CheckCircle2 size={13} />
            {/if}
            {confirmDialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if forwardingMessageList.length > 0}
    <div class="modal-backdrop" role="presentation" on:click={closeForwardDialog}>
      <div
        class="forward-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="转发消息"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={(event) => {
          if (event.key === "Escape") closeForwardDialog();
        }}
      >
        <header>
          <div>
            <span class="eyebrow">转发</span>
            <h2>{forwardingTitle}</h2>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭" on:click={closeForwardDialog}>
            <X size={15} />
          </button>
        </header>
        <div class="forward-preview">
          {#if forwardingMessageList.length === 1}
            {@const onlyMessage = forwardingMessageList[0]}
            <strong>{onlyMessage.sender_id === self?.peer_id ? "我" : "对方"}</strong>
            <span>
              {messagePreview(onlyMessage) || "空消息"}
            </span>
          {:else}
            <strong>逐条转发</strong>
            <span>{forwardingMessageList.length} 条消息，将按当前聊天顺序发送到目标会话</span>
            <div class="forward-preview-list" aria-label="转发消息预览">
              {#each forwardingMessageList.slice(0, 3) as message (message.id)}
                <p>
                  <b>{message.sender_id === self?.peer_id ? "我" : messageSenderLabel(message)}</b>
                  <span>{messagePreview(message) || "空消息"}</span>
                </p>
              {/each}
              {#if forwardingMessageList.length > 3}
                <small>还有 {forwardingMessageList.length - 3} 条消息</small>
              {/if}
            </div>
          {/if}
        </div>
        <input
          class="forward-search"
          value={forwardQuery}
          placeholder="搜索会话"
          on:input={(event) => (forwardQuery = (event.currentTarget as HTMLInputElement).value)}
        />
        <div class="forward-target-list">
          {#each forwardTargets as conversation (conversation.id)}
            <button type="button" on:click={() => confirmForwardMessage(conversation.id)}>
              <i aria-hidden="true">{conversationDisplayTitle(conversation, peers, contactMetadata).slice(0, 1)}</i>
              <span>
                <strong>{conversationDisplayTitle(conversation, peers, contactMetadata)}</strong>
                <small>{conversation.id}</small>
              </span>
              <b>
                <Send size={13} />
                {conversation.archived ? "归档" : conversation.muted ? "免扰" : "发送"}
              </b>
            </button>
          {:else}
            <p class="empty-note">没有匹配的会话</p>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</main>
