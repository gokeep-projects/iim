<script lang="ts">
  import Ban from "lucide-svelte/icons/ban";
  import Bell from "lucide-svelte/icons/bell";
  import CheckSquare from "lucide-svelte/icons/check-square";
  import Copy from "lucide-svelte/icons/copy";
  import Database from "lucide-svelte/icons/database";
  import HardDrive from "lucide-svelte/icons/hard-drive";
  import Keyboard from "lucide-svelte/icons/keyboard";
  import MessageSquareText from "lucide-svelte/icons/message-square-text";
  import Minimize2 from "lucide-svelte/icons/minimize-2";
  import Network from "lucide-svelte/icons/network";
  import Palette from "lucide-svelte/icons/palette";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Save from "lucide-svelte/icons/save";
  import Search from "lucide-svelte/icons/search";
  import ShieldCheck from "lucide-svelte/icons/shield-check";
  import Scissors from "lucide-svelte/icons/scissors";
  import Square from "lucide-svelte/icons/square";
  import Star from "lucide-svelte/icons/star";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UploadCloud from "lucide-svelte/icons/upload-cloud";
  import Users from "lucide-svelte/icons/users";
  import {
    defaultAppShortcuts,
    defaultTransportConfig,
    type AppShortcuts,
    type ChatMessage,
    type ContactMetadata,
    type NetworkSettings,
    type PeerProfile,
    type PeerStatus,
    type ScreenshotShortcut,
    type SendShortcut,
    type StorageMigrationProgress,
    type StorageOverview,
    type TransferTask,
    type TransportConfig,
    type TrustedPeer,
    type WindowShortcut
  } from "../api";
  import type { Section } from "./Rail.svelte";

  type SettingsTab = "profile" | "network" | "storage" | "security" | "preferences";
  type TransferStatusFilter = "all" | "active" | "failed" | "done";
  type ContactFilter = "all" | "online" | "favorite" | "blocked";

  export let section: Section = "contacts";
  export let peers: PeerProfile[] = [];
  export let self: PeerProfile | null = null;
  export let focusedContactPeerId = "";
  export let contactMetadata: Record<string, ContactMetadata> = {};
  export let selectedPeerIds: string[] = [];
  export let searchResults: ChatMessage[] = [];
  export let favoriteMessages: ChatMessage[] = [];
  export let todoMessages: ChatMessage[] = [];
  export let outboxMessages: ChatMessage[] = [];
  export let conversationTitles: Record<string, string> = {};
  export let query = "";
  export let settings: NetworkSettings;
  export let transportConfig: TransportConfig = defaultTransportConfig;
  export let transferTasks: TransferTask[] = [];
  export let profileName = "";
  export let profileHostname = "";
  export let profileStatus: PeerStatus = "online";
  export let notificationReady = false;
  export let dark = false;
  export let sendShortcut: "enter" | "ctrl_enter" = "enter";
  export let shortcuts: AppShortcuts = defaultAppShortcuts;
  export let showNotificationPreview = true;
  export let privacyMode = false;
  export let closeToTray = true;
  export let loginEnabled = false;
  export let loginPasswordDraft = "";
  export let loginPasswordConfirmDraft = "";
  export let loginPasswordReady = true;
  export let profileSignature = "";
  export let avatarLabel = "";
  export let requireContactForMessaging = false;
  export let statusText = "";
  export let trustStatus = "";
  export let trayStatus = "";
  export let networkInputWarning = "";
  export let networkWarnings: string[] = [];
  export let storageOverview: StorageOverview | null = null;
  export let storageMigrationProgress: StorageMigrationProgress | null = null;
  export let storageMigrationActive = false;
  export let trustedPeers: TrustedPeer[] = [];
  export let settingsTab: SettingsTab = "profile";
  export let onTogglePeer: (peerId: string) => void = () => {};
  export let onSelectConversation: (id: string) => void | Promise<void> = () => {};
  export let onOpenMessageResult: (message: ChatMessage) => void | Promise<void> = () => {};
  export let onMessageContext: (message: ChatMessage, event: MouseEvent) => void = () => {};
  export let onRetryOutboxMessages: () => void | Promise<void> = () => {};
  export let onCreateGroup: () => void | Promise<void> = () => {};
  export let onRefreshPeers: () => void | Promise<void> = () => {};
  export let onSearch: () => void | Promise<void> = () => {};
  export let onRefreshFavorites: () => void | Promise<void> = () => {};
  export let onCopyNetworkDiagnostics: (report: string) => void | Promise<void> = () => {};
  export let onTrustPeer: (peer?: PeerProfile | null) => void | Promise<void> = () => {};
  export let onRemoveTrustedPeer: (peerId: string) => void | Promise<void> = () => {};
  export let onProfileNameChange: (value: string) => void = () => {};
  export let onProfileHostnameChange: (value: string) => void = () => {};
  export let onProfileStatusChange: (value: PeerStatus) => void = () => {};
  export let onSaveProfile: () => void | Promise<void> = () => {};
  export let onCopyIdentityValue: (value: string, label: string) => void | Promise<void> = () => {};
  export let onEnableNotifications: () => void | Promise<void> = () => {};
  export let onMinimizeToTray: () => void | Promise<void> = () => {};
  export let onToggleTheme: () => void = () => {};
  export let onSetSendShortcut: (shortcut: SendShortcut) => void | Promise<void> = () => {};
  export let onSetScreenshotShortcut: (shortcut: ScreenshotShortcut) => void | Promise<void> = () => {};
  export let onSetWindowShortcut: (shortcut: WindowShortcut) => void | Promise<void> = () => {};
  export let onToggleNotificationPreview: () => void | Promise<void> = () => {};
  export let onTogglePrivacyMode: () => void | Promise<void> = () => {};
  export let onToggleCloseToTray: () => void | Promise<void> = () => {};
  export let onToggleRequireContactForMessaging: (value: boolean) => void | Promise<void> = () => {};
  export let onLoginEnabledChange: (value: boolean) => void = () => {};
  export let onLoginPasswordDraftChange: (value: string) => void = () => {};
  export let onLoginPasswordConfirmChange: (value: string) => void = () => {};
  export let onSaveLoginSettings: () => void | Promise<void> = () => {};
  export let onProfileSignatureChange: (value: string) => void = () => {};
  export let onAvatarLabelChange: (value: string) => void = () => {};
  export let onSaveProfileExtras: () => void | Promise<void> = () => {};
  export let onRefreshStorage: () => void | Promise<void> = () => {};
  export let onMigrateStorageDirectory: () => void | Promise<void> = () => {};
  export let onClearStagedFiles: () => void | Promise<void> = () => {};
  export let onOpenStorage: (kind: "data" | "received" | "staged") => void | Promise<void> = () => {};
  export let onCopyStoragePath: (path: string, label: string) => void | Promise<void> = () => {};
  export let onCopyStorageDiagnostics: (report: string) => void | Promise<void> = () => {};
  export let onCopyTrustedFingerprint: (fingerprint: string, label: string) => void | Promise<void> = () => {};
  export let onOpenTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onDeleteTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onCancelTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onResumeTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onTransferContext: (task: TransferTask, event: MouseEvent) => void = () => {};
  export let onClearCompletedTransfers: () => void | Promise<void> = () => {};
  export let onCopyTransferId: (transferId: string, label: string) => void | Promise<void> = () => {};
  export let onContactMetadataChange: (peerId: string, patch: Partial<ContactMetadata>) => void = () => {};
  export let onSaveContactMetadata: (peerId: string) => void | Promise<void> = () => {};
  export let onContactContext: (peer: PeerProfile, event: MouseEvent) => void = () => {};
  export let onOpenSettingsTab: (tab: SettingsTab) => void = () => {};

  let focusedContactId = "";
  let contactFilter: ContactFilter = "all";
  let transferQuery = "";
  let transferStatusFilter: TransferStatusFilter = "all";
  let trustedDeviceQuery = "";
  let networkDiagnosticsRefreshing = false;

  const settingsTabs: Array<{ id: SettingsTab; label: string; icon: typeof Users }> = [
    { id: "profile", label: "个人", icon: Users },
    { id: "network", label: "网络", icon: Network },
    { id: "storage", label: "存储", icon: HardDrive },
    { id: "security", label: "安全", icon: ShieldCheck },
    { id: "preferences", label: "偏好", icon: Palette }
  ];
  const sendShortcutOptions: Array<{ value: SendShortcut; label: string }> = [
    { value: "enter", label: "Enter" },
    { value: "ctrl_enter", label: "Ctrl+Enter" }
  ];
  const screenshotShortcutOptions: Array<{ value: ScreenshotShortcut; label: string }> = [
    { value: "ctrl_alt_a", label: "Ctrl+Alt+A" },
    { value: "ctrl_shift_a", label: "Ctrl+Shift+A" },
    { value: "none", label: "关闭" }
  ];
  const windowShortcutOptions: Array<{ value: WindowShortcut; label: string }> = [
    { value: "ctrl_alt_i", label: "Ctrl+Alt+I" },
    { value: "ctrl_shift_i", label: "Ctrl+Shift+I" },
    { value: "none", label: "关闭" }
  ];
  const storageMigrationSteps = [
    { phase: "preparing", title: "准备", detail: "检查目标目录" },
    { phase: "copying", title: "复制", detail: "迁移数据库与文件" },
    { phase: "switching", title: "切换", detail: "写入新目录配置" },
    { phase: "done", title: "重启", detail: "从新目录打开" }
  ];

  const profileStatusChoices: Array<{ value: PeerStatus; label: string; tone: "online" | "away" | "offline" }> = [
    { value: "online", label: "在线", tone: "online" },
    { value: "away", label: "离开", tone: "away" },
    { value: "offline", label: "隐身", tone: "offline" }
  ];
  const transferStatusFilters: Array<{ id: TransferStatusFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "active", label: "活跃" },
    { id: "failed", label: "失败" },
    { id: "done", label: "已完成" }
  ];
  const contactFilters: Array<{ id: ContactFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "online", label: "可联系" },
    { id: "favorite", label: "星标" },
    { id: "blocked", label: "阻止" }
  ];

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function openSettingsCategory(tab: SettingsTab) {
    settingsTab = tab;
    onOpenSettingsTab(tab);
  }

  function formatTrustTime(seconds: number) {
    if (!seconds) return "未知时间";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(seconds * 1000));
  }

  function formatTrustAuditTime(seconds: number) {
    if (!seconds) return "未知时间";
    return new Date(seconds * 1000).toLocaleString("zh-CN");
  }

  function transferProgress(task: TransferTask) {
    if (task.totalBytes <= 0) return 0;
    return Math.min(100, Math.round((task.sentBytes / task.totalBytes) * 100));
  }

  function isActiveTransfer(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return !["delivered", "downloaded", "failed", "cancelled", "canceled", "已完成", "失败"].includes(normalized);
  }

  function isFailedTransfer(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return normalized === "failed" || task.status === "失败";
  }

  function isDoneTransfer(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return normalized === "downloaded" || normalized === "delivered" || task.status === "已完成";
  }

  function transferSearchText(task: TransferTask) {
    return [task.id, task.name, task.status, transferStatusLabel(task), task.errorMessage, ...task.files].join(" ").toLowerCase();
  }

  function matchesTransferStatusFilter(task: TransferTask, filter: TransferStatusFilter) {
    if (filter === "active") return isActiveTransfer(task);
    if (filter === "failed") return isFailedTransfer(task);
    if (filter === "done") return isDoneTransfer(task);
    return true;
  }

  function matchesTransferFilters(task: TransferTask, query: string, filter: TransferStatusFilter) {
    const needle = query.trim().toLowerCase();
    return matchesTransferStatusFilter(task, filter) && (!needle || transferSearchText(task).includes(needle));
  }

  function canResumeTransfer(task: TransferTask) {
    return task.resumable;
  }

  function cannotResumeTerminalTransfer(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return !task.resumable && ["failed", "cancelled", "canceled", "失败"].includes(normalized);
  }

  function transferStatusLabel(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    if (normalized === "indexed" || task.status === "已广播") return "等待下载";
    if (normalized === "sending" || normalized === "downloading") return "传输中";
    if (normalized === "downloaded" || normalized === "delivered") return "已完成";
    if (normalized === "failed" || task.status === "失败") return "失败";
    if (normalized === "cancelled" || normalized === "canceled") return "已取消";
    return task.status || "未知";
  }

  function transferStatusTone(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    if (normalized === "failed" || task.status === "失败") return "failed";
    if (normalized === "cancelled" || normalized === "canceled") return "canceled";
    if (normalized === "downloaded" || normalized === "delivered") return "done";
    return "active";
  }

  function networkDiagnosticReport() {
    return [
      "灵犀内网通网络诊断",
      `自动发现：${settings.auto_discovery ? "开启" : "关闭"}`,
      `局域网广播：${settings.multicast ? "开启" : "关闭"}`,
      `发现设备：${discoveredPeerCount}`,
      `可联系设备：${onlinePeerCount}`,
      `发现间隔：${settings.discovery_interval_secs}s`,
      `离线判定：${settings.peer_ttl_secs}s`,
      `QUIC 监听端口：${transportConfig.listen_port}`,
      `QUIC 心跳：${transportConfig.heartbeat_secs}s`,
      `空闲超时：${transportConfig.max_idle_timeout_secs}s`,
      `outbox 重试：${Math.round(transportConfig.outbox.retry_after_millis / 1000)}s / ${transportConfig.outbox.max_attempts} 次 / 每批 ${transportConfig.outbox.batch_limit}`,
      `最近警告：${networkWarnings.join(" | ") || "无"}`,
      `诊断建议：${networkDiagnostics.map((item) => `${item.title} - ${item.detail}`).join(" / ")}`
    ].join("\n");
  }

  function storageDiagnosticReport() {
    const failedTasks = transferTasks.filter(isFailedTransfer);
    const resumableFailedTasks = failedTasks.filter(canResumeTransfer);
    const recentFailures = failedTasks
      .slice(0, 3)
      .map((task) => `${task.name || task.id} - ${task.errorMessage || transferStatusLabel(task)}`)
      .join(" / ");

    return [
      "灵犀内网通存储诊断",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `数据目录：${storageOverview?.data_dir ?? "未加载"}`,
      `数据库：${storageOverview?.database_path ?? "未加载"}`,
      `密钥文件：${storageOverview?.database_key_path ?? "未加载"}`,
      `密钥保护：${storageOverview?.database_key_protection ?? "未加载"}`,
      `接收目录：${storageOverview?.received_files_dir ?? "未加载"}`,
      `暂存目录：${storageOverview?.staged_files_dir ?? "未加载"}`,
      `数据库占用：${storageOverview ? formatBytes(storageOverview.database_bytes) : "未加载"}`,
      `接收缓存：${storageOverview ? formatBytes(storageOverview.received_bytes) : "未加载"}`,
      `暂存缓存：${storageOverview ? formatBytes(storageOverview.staged_bytes) : "未加载"}`,
      `缓存占用：${storageOverview ? formatBytes(storageCacheBytes) : "未加载"}`,
      `传输任务：${storageOverview?.transfer_task_count ?? transferTasks.length}`,
      `活跃任务：${activeTransferTasks.length}`,
      `历史任务：${historyTransferTasks.length}`,
      `失败任务：${failedTasks.length}`,
      `可续传失败：${resumableFailedTasks.length}`,
      `最近失败：${recentFailures || "无"}`
    ].join("\n");
  }

  function transferDiagnosticReport() {
    const activeTasks = transferTasks.filter(isActiveTransfer);
    const historyTasks = transferTasks.filter((task) => !isActiveTransfer(task));
    const failedTasks = transferTasks.filter(isFailedTransfer);
    const resumableTasks = failedTasks.filter(canResumeTransfer);
    const missingSourceTasks = transferTasks.filter(cannotResumeTerminalTransfer);
    const failedSummary = failedTasks
      .map((task) => `${task.name || task.id} (${task.id}) - ${task.errorMessage || transferStatusLabel(task)}`)
      .join("；");

    return [
      "灵犀内网通传输诊断",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `活跃任务：${activeTasks.length}`,
      `历史任务：${historyTasks.length}`,
      `失败任务：${failedTasks.length}`,
      `可续传失败：${resumableTasks.length}`,
      `缺少本地源：${missingSourceTasks.length}`,
      `文件数量：${transferTasks.reduce((sum, task) => sum + task.files.length, 0)}`,
      `累计字节：${formatBytes(transferTasks.reduce((sum, task) => sum + task.totalBytes, 0))}`,
      `筛选条件：${transferQuery.trim() || "无"} / ${transferStatusFilter}`,
      `失败清单：${failedSummary || "无"}`
    ].join("\n");
  }

  function storagePathRows(overview: StorageOverview | null) {
    return [
      { label: "应用数据", value: overview?.data_dir ?? "", fallback: "等待加载", copyLabel: "应用数据路径", openLabel: "应用数据路径", kind: "data" as const },
      { label: "加密数据库", value: overview?.database_path ?? "", fallback: "等待加载", copyLabel: "加密数据库路径", openLabel: "", kind: null },
      { label: "密钥保护", value: overview?.database_key_protection ?? "", fallback: "等待加载", copyLabel: "", openLabel: "", kind: null },
      { label: "密钥文件", value: overview?.database_key_path ?? "", fallback: "等待加载", copyLabel: "密钥文件路径", openLabel: "", kind: null },
      { label: "接收文件", value: overview?.received_files_dir ?? "", fallback: "等待加载", copyLabel: "接收文件路径", openLabel: "接收文件路径", kind: "received" as const },
      { label: "剪贴板暂存", value: overview?.staged_files_dir ?? "", fallback: "等待加载", copyLabel: "剪贴板暂存路径", openLabel: "暂存路径", kind: "staged" as const }
    ];
  }

  function storageMigrationPhaseLabel(phase: string) {
    if (phase === "preparing") return "准备迁移";
    if (phase === "copying") return "复制文件";
    if (phase === "switching") return "切换目录";
    if (phase === "done") return "迁移完成";
    return "等待开始";
  }

  function storageMigrationStepState(phase: string) {
    if (!storageMigrationProgress) return "";
    const currentIndex = storageMigrationSteps.findIndex((step) => step.phase === storageMigrationProgress?.phase);
    const stepIndex = storageMigrationSteps.findIndex((step) => step.phase === phase);
    if (storageMigrationProgress.phase === "done" || stepIndex < currentIndex) return "done";
    if (stepIndex === currentIndex) return "active";
    return "";
  }

  function statusLabel(status: PeerStatus) {
    return status === "online" ? "可联系" : "暂不可达";
  }

  function peerPresenceLabel(peer: PeerProfile) {
    return `${peerLabel(peer)} ${statusLabel(peer.status)}状态`;
  }

  function primaryEndpoint(peer: PeerProfile) {
    return peer.endpoints[0] ?? "";
  }

  function metadataFor(peer: PeerProfile): ContactMetadata {
    return contactMetadata[peer.peer_id] ?? { peer_id: peer.peer_id, remark: "", group_name: "", favorite: false, blocked: false };
  }

  function peerLabel(peer: PeerProfile) {
    return metadataFor(peer).remark || peer.display_name;
  }

  function trustedPeerLabel(record: TrustedPeer, peerList = peers) {
    const peer = peerList.find((item) => item.peer_id === record.peer_id);
    return peer ? peerLabel(peer) : record.peer_id.slice(0, 18);
  }

  function trustedPeerCurrentPeer(record: TrustedPeer, peerList = peers) {
    return peerList.find((item) => item.peer_id === record.peer_id) ?? null;
  }

  function trustedPeerFingerprintMismatch(record: TrustedPeer, peerList = peers) {
    const peer = trustedPeerCurrentPeer(record, peerList);
    return Boolean(peer && peer.fingerprint !== record.fingerprint);
  }

  function trustedPeerFingerprintState(record: TrustedPeer, peerList = peers) {
    const peer = trustedPeerCurrentPeer(record, peerList);
    if (!peer) return "当前未发现";
    return peer.fingerprint === record.fingerprint ? "当前发现指纹一致" : "当前发现指纹与信任记录不一致";
  }

  function isSecurityWarning(warning: string) {
    const normalized = warning.toLowerCase();
    return (
      normalized.includes("fingerprint") ||
      normalized.includes("identity rejected") ||
      normalized.includes("signature rejected") ||
      normalized.includes("ack rejected")
    );
  }

  function trustedPeerSearchText(record: TrustedPeer, peerList = peers) {
    return [record.peer_id, trustedPeerLabel(record, peerList), record.fingerprint].join(" ").toLowerCase();
  }

  function trustedPeerAuditReport(record: TrustedPeer, peerList = peers) {
    const peer = peerList.find((item) => item.peer_id === record.peer_id);
    const lines = [
      "灵犀内网通信任记录",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `设备：${trustedPeerLabel(record, peerList)}`,
      `设备 ID：${record.peer_id}`,
      `信任指纹：${record.fingerprint}`,
      `信任时间：${formatTrustAuditTime(record.trusted_at)}`
    ];

    if (!peer) {
      lines.push("当前发现状态：未发现");
      return lines.join("\n");
    }

    lines.push(
      `当前发现状态：${statusLabel(peer.status)}`,
      `当前显示名：${peer.display_name}`,
      `当前主机名：${peer.hostname || "未知"}`,
      `当前端点：${peer.endpoints.length ? peer.endpoints.join(", ") : "暂无"}`,
      `当前上报指纹：${peer.fingerprint}`,
      `指纹校验：${peer.fingerprint === record.fingerprint ? "一致" : "不一致"}`
    );
    return lines.join("\n");
  }

  function contactAuditReport(peer: PeerProfile) {
    const metadata = metadataFor(peer);
    const trusted = trustedPeers.find((record) => record.peer_id === peer.peer_id);
    const lines = [
      "灵犀内网通联系人记录",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `显示名：${peer.display_name}`,
      `备注：${metadata.remark || "未设置"}`,
      `分组：${metadata.group_name || "默认"}`,
      `状态：${statusLabel(peer.status)}`,
      `安全策略：${metadata.blocked ? "已阻止通信" : "允许通信"}`,
      `主机名：${peer.hostname || "未知"}`,
      `直连端点：${peer.endpoints.length ? peer.endpoints.join(", ") : "等待发现"}`,
      `设备 ID：${peer.peer_id}`,
      `当前指纹：${peer.fingerprint}`,
      `TOFU 信任：${trusted ? "已信任" : "未信任"}`
    ];

    if (trusted) {
      lines.push(
        `信任指纹：${trusted.fingerprint}`,
        `信任时间：${formatTrustAuditTime(trusted.trusted_at)}`,
        `指纹校验：${trusted.fingerprint === peer.fingerprint ? "一致" : "不一致"}`
      );
    }

    return lines.join("\n");
  }

  function securityDiagnosticReport() {
    const mismatches = trustedPeers.filter((record) => trustedPeerFingerprintMismatch(record));
    const warnings = networkWarnings.filter(isSecurityWarning);
    return [
      "灵犀内网通安全诊断",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `通信模式：${requireContactForMessaging ? "仅联系人可通信" : "局域网发现即可通信"}`,
      `已信任设备：${trustedPeers.length}`,
      `已发现设备：${peers.length}`,
      `指纹不一致：${mismatches.length}`,
      `安全告警：${warnings.length}`,
      `不一致清单：${mismatches.map((record) => `${trustedPeerLabel(record)} (${record.peer_id})`).join("；") || "无"}`,
      `最近安全告警：${warnings.join(" | ") || "无"}`,
      `信任记录：${trustedPeers.map((record) => `${trustedPeerLabel(record)} ${record.peer_id} ${record.fingerprint} ${trustedPeerFingerprintState(record)}`).join("；") || "无"}`
    ].join("\n");
  }

  function conversationLabel(conversationId: string) {
    return conversationTitles[conversationId]?.trim() || conversationId;
  }

  function fileName(path: string) {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  }

  function messageResultPreview(message: ChatMessage) {
    if (privacyMode) return "消息预览已隐藏";
    const body = message.body.trim();
    if (message.recalled) return "消息已撤回";
    if (body) return body;
    const transfer = message.attachments.find((attachment) => attachment.type === "transfer");
    if (!transfer) return "空消息";
    const files = transfer.manifest.files;
    if (files.length === 1) return `文件：${fileName(files[0].path)}`;
    const fileNames = files.slice(0, 3).map((file) => fileName(file.path)).join("、");
    if (files.length <= 3) return `文件：${fileNames}`;
    return `文件：${fileNames} 等 ${files.length} 个附件`;
  }

  function outboxMessageStatusLabel(message: ChatMessage) {
    if (message.status === "failed") return "发送失败";
    if (message.status === "sending") return "发送中";
    if (message.status === "queued") return "待发送";
    return message.status;
  }

  function outboxMessageTone(message: ChatMessage) {
    if (message.status === "failed") return "failed";
    if (message.status === "queued") return "canceled";
    return "active";
  }

  function peerSearchText(peer: PeerProfile) {
    const metadata = metadataFor(peer);
    return [
      peer.peer_id,
      peer.display_name,
      peer.hostname,
      peer.status,
      peer.endpoints.join(" "),
      metadata.remark,
      metadata.group_name,
      metadata.favorite ? "favorite starred" : "",
      metadata.blocked ? "blocked hidden 阻止 黑名单" : ""
    ]
      .join(" ")
      .toLowerCase();
  }

  function matchesContactFilter(peer: PeerProfile, filter: ContactFilter) {
    const metadata = metadataFor(peer);
    if (filter === "online") return peer.status === "online" && !metadata.blocked;
    if (filter === "favorite") return metadata.favorite && !metadata.blocked;
    if (filter === "blocked") return metadata.blocked;
    return true;
  }

  function matchesContactFilters(peer: PeerProfile, needle: string, filter: ContactFilter) {
    return matchesContactFilter(peer, filter) && (!needle || peerSearchText(peer).includes(needle));
  }

  function openContactContext(peer: PeerProfile, event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea")) return;
    focusedContactId = peer.peer_id;
    onContactContext(peer, event);
  }

  async function refreshNetworkDiagnostics() {
    if (networkDiagnosticsRefreshing) return;
    networkDiagnosticsRefreshing = true;
    try {
      await onRefreshPeers();
    } finally {
      networkDiagnosticsRefreshing = false;
    }
  }

  $: normalizedQuery = query.trim().toLowerCase();
  $: visiblePeers = peers.filter((peer) => matchesContactFilters(peer, normalizedQuery, contactFilter)).sort((a, b) => {
    const aMeta = metadataFor(a);
    const bMeta = metadataFor(b);
    return (
      Number(bMeta.favorite) - Number(aMeta.favorite) ||
      aMeta.group_name.localeCompare(bMeta.group_name, "zh-CN") ||
      peerLabel(a).localeCompare(peerLabel(b), "zh-CN")
    );
  });
  $: workspaceSection = section === "notifications" ? "settings" : section;
  $: hasContactFilters = normalizedQuery.length > 0 || contactFilter !== "all";
  $: reachablePeers = visiblePeers.filter((peer) => peer.status === "online");
  $: unreachablePeers = visiblePeers.filter((peer) => peer.status !== "online");
  $: if (
    section === "contacts" &&
    focusedContactPeerId &&
    focusedContactId !== focusedContactPeerId &&
    visiblePeers.some((peer) => peer.peer_id === focusedContactPeerId)
  ) {
    focusedContactId = focusedContactPeerId;
  }
  $: if (section === "contacts" && visiblePeers.length > 0 && !visiblePeers.some((peer) => peer.peer_id === focusedContactId)) {
    focusedContactId = visiblePeers[0].peer_id;
  }
  $: focusedContact = visiblePeers.find((peer) => peer.peer_id === focusedContactId) ?? visiblePeers[0] ?? null;
  $: selfDeviceId = self?.peer_id ?? "等待身份初始化";
  $: selfFingerprint = self?.fingerprint ?? "等待身份初始化";
  $: shortSelfDeviceId = selfDeviceId.length > 18 ? `${selfDeviceId.slice(0, 18)}...` : selfDeviceId;
  $: shortSelfFingerprint = selfFingerprint.length > 24 ? `${selfFingerprint.slice(0, 24)}...` : selfFingerprint;
  $: profileDisplayName = profileName.trim() || self?.display_name || "本机用户";
  $: profileHostLabel = profileHostname.trim() || self?.hostname || "等待主机名";
  $: profileEndpointLabel = self?.endpoints[0] ?? `${transportConfig.listen_port}/QUIC`;
  $: trimmedProfileSignature = profileSignature.trim();
  $: profileAvatarSource = avatarLabel.trim() || profileDisplayName.trim();
  $: profileAvatarInitial = Array.from(profileAvatarSource).slice(0, 2).join("") || "我";
  $: storageCacheBytes = storageOverview ? storageOverview.received_bytes + storageOverview.staged_bytes : 0;
  $: activeTransferTasks = transferTasks.filter(isActiveTransfer);
  $: historyTransferTasks = transferTasks.filter((task) => !isActiveTransfer(task));
  $: filteredTransferTasks = transferTasks.filter((task) => matchesTransferFilters(task, transferQuery, transferStatusFilter));
  $: filteredActiveTransferTasks = filteredTransferTasks.filter(isActiveTransfer);
  $: filteredHistoryTransferTasks = filteredTransferTasks.filter((task) => !isActiveTransfer(task));
  $: visibleTransferTasks = [...filteredTransferTasks].sort((a, b) => Number(isActiveTransfer(b)) - Number(isActiveTransfer(a)));
  $: hasTransferFilters = transferQuery.trim().length > 0 || transferStatusFilter !== "all";
  $: trustedDeviceNeedle = trustedDeviceQuery.trim().toLowerCase();
  $: visibleTrustedPeers = trustedDeviceNeedle
    ? trustedPeers.filter((record) => trustedPeerSearchText(record, peers).includes(trustedDeviceNeedle))
    : trustedPeers;
  $: trustedFingerprintMismatchCount = trustedPeers.filter((record) => trustedPeerFingerprintMismatch(record)).length;
  $: transferFileCount = transferTasks.reduce((sum, task) => sum + task.files.length, 0);
  $: transferTotalBytes = transferTasks.reduce((sum, task) => sum + task.totalBytes, 0);
  $: discoveredPeerCount = peers.length;
  $: onlinePeerCount = peers.filter((peer) => peer.status === "online").length;
  $: latestNetworkWarning = networkWarnings[0] ?? "";
  $: networkDiagnostics = [
    {
      tone: settings.auto_discovery ? "ok" : "danger",
      title: settings.auto_discovery ? "自动发现运行中" : "自动发现已关闭",
      detail: settings.auto_discovery ? "本机会持续广播并监听局域网设备。" : "开启自动发现后，同网段设备才能主动出现在联系人列表。"
    },
    {
      tone: onlinePeerCount > 0 ? "ok" : "warning",
      title: onlinePeerCount > 0 ? `可联系设备 ${onlinePeerCount} 台` : "没有发现可联系设备",
      detail: onlinePeerCount > 0 ? "已发现可直连设备，可尝试发送消息或文件。" : "检查 Windows 防火墙、确认双方同网段，然后刷新联系人。"
    },
    {
      tone: settings.multicast ? "ok" : "warning",
      title: settings.multicast ? "局域网发现就绪" : "默认发现受限",
      detail: settings.multicast
        ? "同网段设备会自动出现在联系人列表，联系人页就是发现和管理入口。"
        : "广播不可用时只能依赖已缓存联系人；请检查系统网络和防火墙策略。"
    },
    {
      tone: latestNetworkWarning ? "danger" : "ok",
      title: latestNetworkWarning ? "最近网络警告" : "暂无网络警告",
      detail: latestNetworkWarning || "发现、QUIC 和文件传输暂未报告异常。"
    },
    {
      tone: storageOverview ? "ok" : "warning",
      title: storageOverview ? "本地存储可用" : "存储状态未加载",
      detail: storageOverview ? "历史记录、outbox 和传输任务可写入加密数据库。" : "刷新存储信息，确认加密数据库和接收目录可访问。"
    }
  ];
</script>

<section class="workspace-panel" aria-label="功能工作区">
  {#if workspaceSection === "contacts"}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">联系人</span>
        <h1>内网设备</h1>
        <p>选择成员可创建无服务器群聊；点击联系人进入直连会话。</p>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <div class="workspace-head-actions">
        <button class="tool-button" type="button" on:click={onRefreshPeers}>
          <RefreshCw size={15} />
          刷新设备
        </button>
        <button class="tool-button" type="button" disabled={selectedPeerIds.length === 0} on:click={onCreateGroup}>
          <Users size={15} />
          创建群聊
        </button>
      </div>
    </header>
	    <div class:empty={visiblePeers.length === 0} class="contacts-layout">
	      <div class="contacts-directory">
	        <div class="contact-directory-summary" aria-label="联系人概览">
	          <span>发现设备 {visiblePeers.length}</span>
	          <span>在线 {reachablePeers.length}</span>
	          <span>已选 {selectedPeerIds.length}</span>
	          {#if hasContactFilters}<span>已筛选</span>{/if}
	        </div>
	        <div class="contact-filter-tabs" role="tablist" aria-label="联系人筛选">
	          {#each contactFilters as item}
            <button
              class:active={contactFilter === item.id}
              type="button"
              role="tab"
              aria-selected={contactFilter === item.id}
              on:click={() => (contactFilter = item.id)}
            >
              {item.label}
            </button>
          {/each}
        </div>

        {#if visiblePeers.length === 0}
          <div class="empty-action-note contact-empty-panel">
            <span class="empty-panel-icon">
              <Network size={16} />
            </span>
            <div class="empty-panel-main">
              {#if hasContactFilters}
                <p class="empty-note">没有匹配的联系人。可切换筛选条件或清空搜索关键字。</p>
                <small>当前筛选未命中任何设备</small>
              {:else}
                <p class="empty-note">暂无联系人。请检查防火墙、确认双方同网段，然后点击右上角“刷新设备”。</p>
                <small>正在等待局域网发现结果</small>
              {/if}
            </div>
            <div class="empty-panel-actions">
              <button class="row-action" type="button" on:click={onRefreshPeers}>
                <RefreshCw size={13} />
                刷新
              </button>
              <button class="row-action" type="button" on:click={() => onOpenSettingsTab("network")}>
                <Network size={13} />
                网络
              </button>
	            </div>
	          </div>
	        {/if}
	
	        {#if visiblePeers.length > 0}
	          <section class="contact-device-list" aria-label="发现设备列表">
	            <header class="contact-list-head">
	              <strong>发现设备</strong>
	              <span>右键可管理联系人，IP 是直连排查的第一信息。</span>
	            </header>
	            <div class="data-grid contacts-grid">
	              {#each visiblePeers as peer (peer.peer_id)}
	                <article
	                  class:active={focusedContact?.peer_id === peer.peer_id}
	                  class:blocked={metadataFor(peer).blocked}
	                  class="data-row contact-device-card"
	                  on:contextmenu={(event) => openContactContext(peer, event)}
	                >
	                  <button
	                    class="peer-check"
	                    type="button"
	                    aria-label={`选择 ${peerLabel(peer)} 加入群聊`}
	                    title="选择群聊成员"
	                    disabled={metadataFor(peer).blocked}
	                    on:click={() => onTogglePeer(peer.peer_id)}
	                  >
	                    {#if selectedPeerIds.includes(peer.peer_id)}
	                      <CheckSquare size={15} />
	                    {:else}
	                      <Square size={15} />
	                    {/if}
	                  </button>
	                  <span
	                    aria-label={peerPresenceLabel(peer)}
	                    class:online={peer.status === "online"}
	                    class:offline={peer.status !== "online"}
	                    class="presence-dot"
	                    title={statusLabel(peer.status)}
	                  ></span>
	                  <div class="contact-main">
	                    <button class="contact-select-summary" type="button" on:click={() => (focusedContactId = peer.peer_id)}>
	                      <strong>
	                        {peerLabel(peer)}
	                        <span class={peer.status === "online" ? "contact-status-chip online" : "contact-status-chip offline"}>{statusLabel(peer)}</span>
	                      </strong>
	                      <small>
	                        {#if metadataFor(peer).remark}
	                          原名 {peer.display_name} ·
	                        {/if}
	                        {metadataFor(peer).group_name || "默认"} · {peer.hostname}
	                        {#if metadataFor(peer).blocked}
	                          · 已阻止
	                        {/if}
	                      </small>
	                      <small class="contact-endpoint-line">
	                        <span class="contact-ip-pill">{primaryEndpoint(peer) || "等待端点"}</span>
	                        {#if peer.endpoints.length > 1}
	                          <span>{peer.endpoints.length} 个端点</span>
	                        {/if}
	                      </small>
	                    </button>
	                    <div class="contact-edit-grid">
	                      <label>
	                        <span>备注</span>
	                        <input
	                          value={metadataFor(peer).remark}
	                          placeholder={peer.display_name}
	                          on:input={(event) =>
	                            onContactMetadataChange(peer.peer_id, { remark: (event.currentTarget as HTMLInputElement).value })}
	                        />
	                      </label>
	                      <label>
	                        <span>分组</span>
	                        <input
	                          value={metadataFor(peer).group_name}
	                          placeholder="默认"
	                          on:input={(event) =>
	                            onContactMetadataChange(peer.peer_id, { group_name: (event.currentTarget as HTMLInputElement).value })}
	                        />
	                      </label>
	                    </div>
	                  </div>
	                  <div class="contact-row-actions">
	                    <button
	                      class:active={metadataFor(peer).favorite}
	                      class="icon-toggle"
	                      type="button"
	                      title="星标联系人"
	                      on:click={() => onContactMetadataChange(peer.peer_id, { favorite: !metadataFor(peer).favorite })}
	                    >
	                      <Star size={15} />
	                    </button>
	                    <button
	                      class:active={metadataFor(peer).blocked}
	                      class="icon-toggle danger-toggle"
	                      type="button"
	                      title={metadataFor(peer).blocked ? "取消阻止联系人" : "阻止联系人"}
	                      on:click={() => onContactMetadataChange(peer.peer_id, { blocked: !metadataFor(peer).blocked })}
	                    >
	                      <Ban size={15} />
	                    </button>
	                    <button class="row-action" type="button" on:click={() => onSaveContactMetadata(peer.peer_id)}>
	                      <Save size={13} />
	                      保存
	                    </button>
	                    <button
	                      class="row-action"
	                      type="button"
	                      aria-label={`和 ${peerLabel(peer)} 聊天`}
	                      disabled={metadataFor(peer).blocked}
	                      on:click={() => onSelectConversation(`direct:${peer.peer_id}`)}
	                    >
	                      <MessageSquareText size={13} />
	                      聊天
	                    </button>
	                  </div>
	                </article>
	              {/each}
	            </div>
	          </section>
	        {/if}
	      </div>

      <section class="contact-profile-card" aria-label="联系人资料">
        {#if focusedContact}
          <div class="contact-profile-head">
            <div class="avatar-mark">{peerLabel(focusedContact).slice(0, 1)}</div>
            <div>
              <span class="eyebrow">联系人资料</span>
              <h2>{peerLabel(focusedContact)}</h2>
              <p>{metadataFor(focusedContact).remark ? focusedContact.display_name : focusedContact.hostname}</p>
            </div>
            <span
              aria-label={peerPresenceLabel(focusedContact)}
              class:online={focusedContact.status === "online"}
              class:offline={focusedContact.status !== "online"}
              class="presence-dot contact-presence-dot"
              title={statusLabel(focusedContact.status)}
            ></span>
          </div>
          <dl class="contact-profile-meta">
            <div>
              <dt>备注</dt>
              <dd>{metadataFor(focusedContact).remark || "未设置"}</dd>
            </div>
            <div>
              <dt>分组</dt>
              <dd>{metadataFor(focusedContact).group_name || "默认"}</dd>
            </div>
            <div>
              <dt>安全状态</dt>
              <dd>{metadataFor(focusedContact).blocked ? "已阻止" : "允许通信"}</dd>
            </div>
            <div>
              <dt>主机名</dt>
              <dd>{focusedContact.hostname}</dd>
            </div>
            <div>
              <dt>直连端点</dt>
              <dd class="identity-value-row">
                <span title={focusedContact.endpoints.join("\n") || "等待发现"}>{focusedContact.endpoints.join("、") || "等待发现"}</span>
                {#if focusedContact.endpoints.length > 0}
                  <button
                    type="button"
                    aria-label="复制联系人直连端点"
                    title="复制联系人直连端点"
                    on:click={() => onCopyIdentityValue(focusedContact.endpoints.join("\n"), "联系人直连端点")}
                  >
                    <Copy size={13} />
                  </button>
                {/if}
              </dd>
            </div>
            <div>
              <dt>设备 ID</dt>
              <dd class="identity-value-row">
                <span title={focusedContact.peer_id}>{focusedContact.peer_id}</span>
                <button
                  type="button"
                  aria-label="复制联系人设备 ID"
                  title="复制联系人设备 ID"
                  on:click={() => onCopyIdentityValue(focusedContact.peer_id, "联系人设备 ID")}
                >
                  <Copy size={13} />
                </button>
              </dd>
            </div>
            <div>
              <dt>设备指纹</dt>
              <dd class="identity-value-row">
                <span title={focusedContact.fingerprint}>{focusedContact.fingerprint}</span>
                <button
                  type="button"
                  aria-label="复制联系人设备指纹"
                  title="复制联系人设备指纹"
                  on:click={() => onCopyIdentityValue(focusedContact.fingerprint, "联系人设备指纹")}
                >
                  <Copy size={13} />
                </button>
              </dd>
            </div>
          </dl>
          <div class="contact-profile-actions">
            <button
              class="contact-primary-action"
              type="button"
              aria-label="发消息"
              disabled={metadataFor(focusedContact).blocked}
              on:click={() => onSelectConversation(`direct:${focusedContact.peer_id}`)}
            >
              <MessageSquareText size={15} />
              <span>
                <strong>发消息</strong>
                <small>{metadataFor(focusedContact).blocked ? "已阻止联系人" : "打开直连会话"}</small>
              </span>
            </button>
            <div class="contact-action-grid">
              <button class="action-card" type="button" aria-label="保存资料" on:click={() => onSaveContactMetadata(focusedContact.peer_id)}>
                <Save size={15} />
                <span>
                  <strong>保存资料</strong>
                  <small>备注与分组</small>
                </span>
              </button>
              <button class="action-card" type="button" aria-label="信任设备" on:click={() => onTrustPeer(focusedContact)}>
                <ShieldCheck size={15} />
                <span>
                  <strong>信任设备</strong>
                  <small>确认指纹</small>
                </span>
              </button>
              <button
                class="action-card"
                type="button"
                aria-label="复制记录"
                on:click={() => onCopyIdentityValue(contactAuditReport(focusedContact), `${peerLabel(focusedContact)} 联系人记录`)}
              >
                <Copy size={15} />
                <span>
                  <strong>复制记录</strong>
                  <small>审计信息</small>
                </span>
              </button>
            </div>
            <button
              class:danger={!metadataFor(focusedContact).blocked}
              class="contact-danger-action"
              type="button"
              aria-label={metadataFor(focusedContact).blocked ? "取消阻止" : "阻止联系人"}
              on:click={() =>
                onContactMetadataChange(focusedContact.peer_id, { blocked: !metadataFor(focusedContact).blocked })}
            >
              <Ban size={15} />
              <span>
                <strong>{metadataFor(focusedContact).blocked ? "取消阻止" : "阻止联系人"}</strong>
                <small>{metadataFor(focusedContact).blocked ? "恢复消息和发现" : "暂停与此联系人互动"}</small>
              </span>
            </button>
          </div>
        {:else}
          <p class="empty-note">暂无可查看的联系人资料。</p>
        {/if}
      </section>
    </div>
  {:else if workspaceSection === "search"}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">全局搜索</span>
        <h1>搜索结果</h1>
        <p>查询“{query}”的本地加密历史记录。</p>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <div class="workspace-head-actions">
        <button class="tool-button" type="button" on:click={onSearch}>
          <Search size={15} />
          重新搜索
        </button>
        <button class="tool-button" type="button" on:click={onRefreshFavorites}>
          <Star size={15} />
          刷新消息资料
        </button>
      </div>
    </header>
    <div class="data-grid">
      {#each searchResults as message (message.id)}
        <article class="data-row search-result" on:contextmenu={(event) => onMessageContext(message, event)}>
          <div>
            <strong>{messageResultPreview(message)}</strong>
            <small>{conversationLabel(message.conversation_id)} · {new Date(message.created_at).toLocaleString("zh-CN")}</small>
          </div>
          <button class="row-action" type="button" on:click={() => onOpenMessageResult(message)}>
            <MessageSquareText size={13} />
            打开
          </button>
        </article>
      {:else}
        <p class="empty-note">没有搜索结果。输入关键词后按 Enter 或点击搜索。</p>
      {/each}
    </div>
    <div class="section-subhead">
      <strong>收藏消息</strong>
      <small>{favoriteMessages.length}</small>
    </div>
    <div class="data-grid">
      {#each favoriteMessages as message (message.id)}
        <article class="data-row search-result" on:contextmenu={(event) => onMessageContext(message, event)}>
          <Star size={15} />
          <div>
            <strong>{messageResultPreview(message)}</strong>
            <small>{conversationLabel(message.conversation_id)} · {new Date(message.created_at).toLocaleString("zh-CN")}</small>
          </div>
          <button class="row-action" type="button" on:click={() => onOpenMessageResult(message)}>
            <MessageSquareText size={13} />
            打开
          </button>
        </article>
      {:else}
        <p class="empty-note">暂无收藏消息。可在聊天消息上右键选择“收藏消息”。</p>
      {/each}
    </div>
    <div class="section-subhead">
      <strong>消息待办</strong>
      <small>{todoMessages.length}</small>
    </div>
    <div class="data-grid">
      {#each todoMessages as message (message.id)}
        <article class="data-row search-result" on:contextmenu={(event) => onMessageContext(message, event)}>
          <CheckSquare size={15} />
          <div>
            <strong>{messageResultPreview(message)}</strong>
            <small>{conversationLabel(message.conversation_id)} · {new Date(message.created_at).toLocaleString("zh-CN")}</small>
          </div>
          <button class="row-action" type="button" on:click={() => onOpenMessageResult(message)}>
            <MessageSquareText size={13} />
            打开
          </button>
        </article>
      {:else}
        <p class="empty-note">暂无待办消息。可在聊天消息上右键选择“加入待办”。</p>
      {/each}
    </div>
    <div class="section-subhead">
      <strong>发件箱</strong>
      <span class="section-heading-actions">
        <small>{outboxMessages.length}</small>
        {#if outboxMessages.length > 0}
          <button class="section-compact-action" type="button" on:click={onRetryOutboxMessages}>
            <RefreshCw size={12} />
            全部重试
          </button>
        {/if}
      </span>
    </div>
    <div class="data-grid">
      {#each outboxMessages as message (message.id)}
        <article class="data-row search-result" on:contextmenu={(event) => onMessageContext(message, event)}>
          <UploadCloud size={15} />
          <div>
            <strong>{messageResultPreview(message)}</strong>
            <small>
              <span class={`transfer-status-badge ${outboxMessageTone(message)}`}>{outboxMessageStatusLabel(message)}</span>
              · {conversationLabel(message.conversation_id)} · {new Date(message.created_at).toLocaleString("zh-CN")}
            </small>
          </div>
          <button class="row-action" type="button" on:click={() => onOpenMessageResult(message)}>
            <MessageSquareText size={13} />
            打开
          </button>
        </article>
      {:else}
        <p class="empty-note">暂无待发送或发送失败消息。</p>
      {/each}
    </div>
  {:else if workspaceSection === "files"}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">文件传输</span>
        <h1>传输任务</h1>
        <p>以历史列表为主，快速检索文件名、任务 ID、状态和失败原因。</p>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <div class="workspace-head-actions">
        <button class="tool-button" type="button" on:click={onClearCompletedTransfers}>
          <Trash2 size={15} />
          清理已完成
        </button>
      </div>
    </header>
    <div class="transfer-workbench">
      <section class="transfer-summary-strip" aria-label="文件传输统计">
        <article>
          <span>活跃</span>
          <strong>{activeTransferTasks.length}</strong>
        </article>
        <article>
          <span>历史</span>
          <strong>{historyTransferTasks.length}</strong>
        </article>
        <article>
          <span>文件</span>
          <strong>{transferFileCount}</strong>
        </article>
        <article>
          <span>总量</span>
          <strong>{formatBytes(transferTotalBytes)}</strong>
        </article>
      </section>
      <section class="transfer-filter-panel" aria-label="传输筛选">
        <label class="search-box transfer-search">
          <Search size={15} />
          <input
            value={transferQuery}
            placeholder="搜索文件名、任务 ID 或状态"
            on:input={(event) => (transferQuery = (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="transfer-filter-tabs" role="tablist" aria-label="传输状态筛选">
          {#each transferStatusFilters as item}
            <button
              class:active={transferStatusFilter === item.id}
              type="button"
              role="tab"
              aria-selected={transferStatusFilter === item.id}
              on:click={() => (transferStatusFilter = item.id)}
            >
              {item.label}
            </button>
          {/each}
        </div>
        <small>匹配 {filteredTransferTasks.length} / {transferTasks.length}</small>
      </section>

      <section class="transfer-section transfer-history-section" aria-label="文件传输历史">
        <div class="section-subhead">
          <strong>文件传输历史</strong>
          <small>{visibleTransferTasks.length} 条</small>
        </div>
        <div class="transfer-history-list">
          {#each visibleTransferTasks as task (task.id)}
            <article class={isActiveTransfer(task) ? "transfer-history-row active-transfer" : "transfer-history-row"} on:contextmenu={(event) => onTransferContext(task, event)}>
              <div class="transfer-history-icon">
                <UploadCloud size={16} />
              </div>
              <div class="transfer-history-main">
                <div class="transfer-history-title">
                  <strong>{task.name}</strong>
                  <span class={`transfer-status-badge ${transferStatusTone(task)}`}>{transferStatusLabel(task)}{isActiveTransfer(task) ? ` · ${transferProgress(task)}%` : ""}</span>
                </div>
                <small>{task.files.length} 个文件 · {formatBytes(task.sentBytes)} / {formatBytes(task.totalBytes)} · {task.id}</small>
                {#if isActiveTransfer(task)}
                  <div
                    class="transfer-progress"
                    role="progressbar"
                    aria-label={`${task.name} 传输进度`}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={transferProgress(task)}
                  >
                    <span style={`width: ${transferProgress(task)}%`}></span>
                  </div>
                {/if}
                {#if task.errorMessage}
                  <small class="transfer-error">失败原因：{task.errorMessage}</small>
                {/if}
                {#if cannotResumeTerminalTransfer(task)}
                  <small class="transfer-error">本机缺少可重新广播的源文件或授权信息</small>
                {/if}
              </div>
              <div class="transfer-task-actions transfer-history-actions" aria-label={`${task.name} 传输操作`}>
                {#if canResumeTransfer(task)}
                  <button class="row-action" type="button" on:click={() => onResumeTransfer(task.id)}>
                    <RefreshCw size={13} />
                    重新广播
                  </button>
                {/if}
                <button class="row-action" type="button" aria-label={`复制 ${task.name} 传输任务 ID`} title={`复制 ${task.name} 传输任务 ID`} on:click={() => onCopyTransferId(task.id, `${task.name} 传输任务 ID`)}>
                  <Copy size={13} />
                  复制 ID
                </button>
                <button class="row-action" type="button" on:click={() => onOpenTransfer(task.id)}>
                  <HardDrive size={13} />
                  定位
                </button>
                {#if isActiveTransfer(task)}
                  <button class="row-action danger" type="button" on:click={() => onCancelTransfer(task.id)}>
                    <Trash2 size={13} />
                    取消
                  </button>
                {:else}
                  <button class="row-action danger" type="button" on:click={() => onDeleteTransfer(task.id)}>
                    <Trash2 size={13} />
                    删除
                  </button>
                {/if}
              </div>
            </article>
          {:else}
            <div class="transfer-empty-panel">
              <span class="empty-panel-icon">
                <HardDrive size={16} />
              </span>
              <div class="empty-panel-main">
                <p class="empty-note">{hasTransferFilters ? "没有匹配的文件传输记录。" : "暂无文件传输记录。"}</p>
                <small>{hasTransferFilters ? "当前条件下没有可回看的任务" : "发送、接收或断点续传任务会显示在这里"}</small>
              </div>
              {#if hasTransferFilters}
                <div class="empty-panel-actions">
                  <button class="row-action" type="button" on:click={() => {
                    transferQuery = "";
                    transferStatusFilter = "all";
                  }}>
                    <RefreshCw size={13} />
                    清空筛选
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>
  {:else}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">设置</span>
        <h1>工作台配置</h1>
        <p>集中管理个人资料、网络状态、存储、安全信任、通知与外观。</p>
      </div>
    </header>

    <div class="settings-shell">
      <nav class="settings-nav" aria-label="设置分类">
        {#each settingsTabs as item}
          <button class:active={settingsTab === item.id} type="button" on:click={() => openSettingsCategory(item.id)}>
            <svelte:component this={item.icon} size={15} />
            {item.label}
          </button>
        {/each}
      </nav>

      <div class="settings-section">
        {#if settingsTab === "profile"}
          <section class="settings-profile-hero" aria-label="个人名片">
            <div class="profile-avatar-button" aria-label="头像">
              <span>{profileAvatarInitial}</span>
            </div>
            <div class="profile-hero-copy">
              <span class="eyebrow">本机资料</span>
              <strong>{profileDisplayName}</strong>
              {#if trimmedProfileSignature}
                <p class="profile-signature">{trimmedProfileSignature}</p>
              {/if}
              <div class="profile-hero-meta">
                <span>{profileHostLabel}</span>
                <span>{profileEndpointLabel}</span>
              </div>
            </div>
            <div class="profile-status-buttons" role="group" aria-label="本机在线状态">
              {#each profileStatusChoices as choice (choice.value)}
                <button
                  class:active={profileStatus === choice.value}
                  class="status-choice compact"
                  type="button"
                  aria-pressed={profileStatus === choice.value}
                  on:click={() => onProfileStatusChange(choice.value)}
                >
                  <span class={`presence-dot ${choice.tone}`}></span>
                  {choice.label}
                </button>
              {/each}
            </div>
          </section>
          <section class="settings-info-card settings-profile-card" aria-label="设备身份">
            <header>
              <Users size={16} />
              <div>
                <strong>设备身份</strong>
                <span>用于局域网发现、会话签名和 TOFU 信任。</span>
              </div>
            </header>
            <dl class="profile-identity-grid">
              <div>
                <dt>设备 ID</dt>
                <dd class="identity-value-row" title={selfDeviceId}>
                  <span>{shortSelfDeviceId}</span>
                  <button type="button" aria-label="复制设备 ID" title="复制设备 ID" on:click={() => onCopyIdentityValue(selfDeviceId, "设备 ID")}>
                    <Copy size={13} />
                  </button>
                </dd>
              </div>
              <div>
                <dt>证书指纹</dt>
                <dd class="identity-value-row" title={selfFingerprint}>
                  <span>{shortSelfFingerprint}</span>
                  <button type="button" aria-label="复制证书指纹" title="复制证书指纹" on:click={() => onCopyIdentityValue(selfFingerprint, "证书指纹")}>
                    <Copy size={13} />
                  </button>
                </dd>
              </div>
              <div>
                <dt>主机名</dt>
                <dd>{self?.hostname ?? "等待加载"}</dd>
              </div>
            </dl>
          </section>
          <div class="settings-form-grid">
            <label class="field">
              <span>显示名称</span>
              <input value={profileName} placeholder={self?.display_name ?? "本机用户"} on:input={(event) => onProfileNameChange((event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>主机备注</span>
              <input value={profileHostname} placeholder={self?.hostname ?? "windows-pc"} on:input={(event) => onProfileHostnameChange((event.currentTarget as HTMLInputElement).value)} />
            </label>
          </div>
          <div class="settings-action-bar">
            <button class="primary-action settings-primary-action" type="button" on:click={onSaveProfile}>
              <Save size={15} />
              保存本机资料
            </button>
          </div>
        {:else if settingsTab === "network"}
          <section class="settings-info-card" aria-label="网络状态">
            <header>
              <Network size={16} />
              <div>
                <strong>默认内网直连</strong>
                <span>网络发现使用内置默认配置自动运行；联系人页就是设备发现与管理入口。</span>
              </div>
            </header>
            <dl>
              <div>
                <dt>发现端口</dt>
                <dd>24250/UDP</dd>
              </div>
              <div>
                <dt>直连端口</dt>
                <dd>{transportConfig.listen_port}/QUIC</dd>
              </div>
              <div>
                <dt>发现间隔</dt>
                <dd>{settings.discovery_interval_secs}s</dd>
              </div>
              <div>
                <dt>离线阈值</dt>
                <dd>{settings.peer_ttl_secs}s</dd>
              </div>
              <div>
                <dt>可靠重试</dt>
                <dd>{Math.round(transportConfig.outbox.retry_after_millis / 1000)}s</dd>
              </div>
              <div>
                <dt>最大尝试</dt>
                <dd>{transportConfig.outbox.max_attempts} 次</dd>
              </div>
              <div>
                <dt>重试批量</dt>
                <dd>{transportConfig.outbox.batch_limit}</dd>
              </div>
            </dl>
          </section>
	          <section class="network-health-grid" aria-label="发现健康摘要">
            <article class={onlinePeerCount > 0 ? "healthy" : "warning"}>
              <div class="network-health-icon"><Users size={16} /></div>
              <span>发现设备</span>
              <strong>{discoveredPeerCount} 台</strong>
              <small>在线 {onlinePeerCount} · 暂不可达 {Math.max(discoveredPeerCount - onlinePeerCount, 0)}</small>
            </article>
            <article class="healthy">
              <div class="network-health-icon"><Network size={16} /></div>
              <span>直连端口</span>
              <strong>{transportConfig.listen_port}/QUIC</strong>
              <small>发现广播 24250/UDP</small>
            </article>
            <article class={settings.auto_discovery && settings.multicast ? "healthy" : "warning"}>
              <div class="network-health-icon"><CheckSquare size={16} /></div>
              <span>发现策略</span>
              <strong>{settings.auto_discovery ? "自动发现" : "手动发现"}</strong>
              <small>{settings.multicast ? "同网段广播可用" : "广播受限，优先检查网络策略"}</small>
            </article>
            <article class={latestNetworkWarning ? "danger" : "healthy"}>
              <div class="network-health-icon"><ShieldCheck size={16} /></div>
              <span>最近告警</span>
              <strong>{latestNetworkWarning ? "需要处理" : "正常"}</strong>
              <small>{latestNetworkWarning || "发现、QUIC、文件传输暂未报告异常"}</small>
            </article>
          </section>
	          <section class="network-diagnostics" aria-label="网络诊断建议" aria-busy={networkDiagnosticsRefreshing}>
            <header>
              <ShieldCheck size={16} />
              <div>
                <strong>网络诊断</strong>
                <span>根据联系人可达状态和最近警告生成排查建议。</span>
              </div>
              <div class="settings-header-actions">
	                <button
	                  class:loading={networkDiagnosticsRefreshing}
	                  class="section-compact-action diagnostic-refresh-action"
	                  type="button"
	                  aria-label="刷新诊断"
	                  disabled={networkDiagnosticsRefreshing}
	                  on:click={refreshNetworkDiagnostics}
	                >
	                  <RefreshCw size={12} />
	                  {networkDiagnosticsRefreshing ? "刷新中" : "刷新诊断"}
	                </button>
                <button class="section-compact-action" type="button" on:click={() => onCopyNetworkDiagnostics(networkDiagnosticReport())}>
                  <Copy size={12} />
                  复制诊断报告
                </button>
              </div>
            </header>
            <div class="diagnostic-list">
              {#each networkDiagnostics as item}
                <article class={`diagnostic-row ${item.tone}`}>
                  <span class="diagnostic-dot" aria-hidden="true"></span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                </article>
              {/each}
            </div>
            {#if networkWarnings.length > 1}
              <div class="network-warning-stack" aria-label="最近网络警告">
                {#each networkWarnings.slice(0, 3) as warning}
                  <p class="warning">{warning}</p>
                {/each}
              </div>
            {/if}
          </section>
          <p class="warning">
            首次启动如出现 Windows 防火墙提示，请允许专用网络访问；局域网发现、QUIC 直连和文件传输分别使用 24250/UDP、24251/QUIC、24252/TCP。
          </p>
          {#if networkInputWarning}
            <p class="warning">{networkInputWarning}</p>
          {/if}
        {:else if settingsTab === "storage"}
          <section class="settings-info-card" aria-label="加密存储状态">
            <header>
              <Database size={16} />
              <div>
                <strong>SQLCipher</strong>
                <span>本地历史记录、outbox、传输任务和信任指纹均保存在加密 SQLite。</span>
              </div>
            </header>
            <dl>
              <div>
                <dt>密钥保护</dt>
                <dd>{storageOverview?.database_key_protection ?? "等待加载"}</dd>
              </div>
              <div>
                <dt>缓存占用</dt>
                <dd>{storageOverview ? formatBytes(storageCacheBytes) : "读取中"}</dd>
              </div>
              <div>
                <dt>传输任务</dt>
                <dd>{storageOverview?.transfer_task_count ?? transferTasks.length}</dd>
              </div>
            </dl>
          </section>
          <section class="storage-dashboard" aria-label="存储用量概览">
            <article>
              <Database size={18} />
              <span>数据库</span>
              <strong>{storageOverview ? formatBytes(storageOverview.database_bytes) : "读取中"}</strong>
              <small>聊天记录、outbox 与信任指纹</small>
            </article>
            <article>
              <UploadCloud size={18} />
              <span>文件缓存</span>
              <strong>{storageOverview ? formatBytes(storageOverview.received_bytes + storageOverview.staged_bytes) : "读取中"}</strong>
              <small>接收文件 {storageOverview ? formatBytes(storageOverview.received_bytes) : "读取中"} · 暂存 {storageOverview ? formatBytes(storageOverview.staged_bytes) : "读取中"}</small>
            </article>
            <article>
              <HardDrive size={18} />
              <span>传输任务</span>
              <strong>{storageOverview?.transfer_task_count ?? transferTasks.length}</strong>
              <small>当前记录在加密本地库中</small>
            </article>
          </section>
	          <section class="storage-path-panel" aria-label="存储路径">
	            <header>
	              <HardDrive size={16} />
	              <div>
	                <strong>存储路径</strong>
                <span>常用目录可直接打开；数据库和密钥路径可复制用于排查。</span>
              </div>
            </header>
            <dl class="path-list">
              {#each storagePathRows(storageOverview) as row}
                <div>
                  <dt>{row.label}</dt>
                  <dd>
                    <span title={row.value || row.fallback}>{row.value || row.fallback}</span>
                    {#if row.value && row.copyLabel}
                      <button
                        type="button"
                        aria-label={`复制${row.copyLabel}`}
                        title={`复制${row.copyLabel}`}
                        on:click={() => onCopyStoragePath(row.value, row.copyLabel)}
                      >
                        <Copy size={12} />
                        复制
                      </button>
                    {/if}
                    {#if row.value && row.kind && row.openLabel}
                      <button
                        type="button"
                        aria-label={`打开${row.openLabel}`}
                        title={`打开${row.openLabel}`}
                        on:click={() => onOpenStorage(row.kind)}
                      >
                        <HardDrive size={12} />
                        打开
                      </button>
                    {/if}
                  </dd>
                </div>
	              {/each}
	            </dl>
	          </section>
	          <section class="storage-migration-panel" aria-label="数据目录迁移">
	            <header>
	              <HardDrive size={16} />
	              <div>
	                <strong>数据目录迁移</strong>
	                <span>选择新的本地目录后，会复制数据库、密钥、接收文件和剪贴板暂存；迁移完成后自动重启并从新目录打开。</span>
	              </div>
	              <button
	                class="storage-migration-action"
		                type="button"
		                aria-label={storageMigrationActive ? "正在迁移数据目录" : "选择新的数据目录"}
		                disabled={storageMigrationActive}
		                on:click={() => !storageMigrationActive && onMigrateStorageDirectory()}
		              >
	                <HardDrive size={14} />
	                {storageMigrationActive ? "迁移中" : "选择目录"}
	              </button>
	            </header>
	            <dl class="migration-target-grid">
	              <div>
	                <dt>当前目录</dt>
	                <dd title={storageOverview?.data_dir ?? "等待加载"}>{storageOverview?.data_dir ?? "等待加载"}</dd>
	              </div>
	              <div>
	                <dt>迁移内容</dt>
	                <dd>加密数据库、密钥、接收文件、剪贴板暂存</dd>
	              </div>
	              <div>
	                <dt>生效方式</dt>
	                <dd>迁移完成后自动重启</dd>
	              </div>
	            </dl>
	            <div class="storage-migration-flow" aria-label="迁移步骤">
	              {#each storageMigrationSteps as step}
	                <article
	                  class:active={storageMigrationStepState(step.phase) === "active"}
	                  class:done={storageMigrationStepState(step.phase) === "done"}
	                >
	                  <span>{step.title}</span>
	                  <small>{step.detail}</small>
	                </article>
	              {/each}
	            </div>
	          </section>
	          <section class="settings-action-panel settings-command-panel" aria-label="存储维护">
	            <header>
	              <strong>存储维护</strong>
	              <span>刷新状态或复制诊断信息；目录迁移使用上方的迁移卡完成。</span>
	            </header>
	            <div class="settings-action-grid">
	              <button class="action-card" type="button" aria-label="刷新存储信息" on:click={onRefreshStorage}>
	                <RefreshCw size={16} />
	                <span>
                  <strong>刷新存储信息</strong>
	                  <small>重新读取数据库、缓存和目录占用</small>
	                </span>
	              </button>
	              <button class="action-card" type="button" aria-label="复制存储诊断报告" on:click={() => onCopyStorageDiagnostics(storageDiagnosticReport())}>
	                <Copy size={16} />
	                <span>
	                  <strong>复制存储诊断报告</strong>
                  <small>用于排查加密库和文件缓存</small>
                </span>
              </button>
            </div>
          </section>
          <section class="settings-danger-zone" aria-label="危险操作">
            <div>
              <strong>危险操作</strong>
              <span>仅清理剪贴板暂存，不会删除聊天记录或已接收文件。</span>
            </div>
            <button class="danger-action" type="button" on:click={onClearStagedFiles}>
              <Trash2 size={15} />
              清理剪贴板暂存
            </button>
          </section>
	          {#if storageMigrationProgress}
	            <section class="migration-progress-card" aria-label="数据目录迁移进度">
	              <div>
	                <strong>{storageMigrationPhaseLabel(storageMigrationProgress.phase)}</strong>
	                <span>{storageMigrationProgress.current_path}</span>
	              </div>
	              <progress
	                max={Math.max(storageMigrationProgress.total, 1)}
	                value={Math.min(storageMigrationProgress.completed, Math.max(storageMigrationProgress.total, 1))}
              ></progress>
              <small>
                {storageMigrationProgress.total > 0
                  ? `${storageMigrationProgress.completed}/${storageMigrationProgress.total}`
                  : "准备迁移文件"}
              </small>
            </section>
          {/if}
        {:else if settingsTab === "security"}
	          <section class="settings-action-panel security-policy-panel" aria-label="通信权限">
	            <header>
	              <strong>通信权限</strong>
	              <span>默认无需加好友即可内网通信；需要更强边界时，可切换为仅联系人可通信。</span>
	            </header>
	            <div class="security-policy-summary" aria-label="安全策略摘要">
	              <article>
	                <ShieldCheck size={15} />
	                <span>当前模式</span>
	                <strong>{requireContactForMessaging ? "仅联系人可通信" : "无需加好友"}</strong>
	                <small>{requireContactForMessaging ? "加为联系人后设备自动受信任" : "发现后即可会话和传文件"}</small>
	              </article>
	              <article>
	                <Users size={15} />
	                <span>指纹信任</span>
	                <strong>{trustedPeers.length} 台</strong>
	                <small>仅锁定设备 ID 与证书指纹</small>
	              </article>
              <article class:warning={trustedFingerprintMismatchCount > 0}>
                <ShieldCheck size={15} />
                <span>指纹校验</span>
                <strong>{trustedFingerprintMismatchCount > 0 ? `${trustedFingerprintMismatchCount} 个异常` : "一致"}</strong>
                <small>{trustedFingerprintMismatchCount > 0 ? "发现设备与信任记录不一致" : "未发现证书替换风险"}</small>
              </article>
            </div>
            <div class="security-policy-options" role="group" aria-label="通信权限策略">
              <button
                class:active={!requireContactForMessaging}
                type="button"
                aria-label="无需加好友"
	                aria-pressed={!requireContactForMessaging}
	                on:click={() => onToggleRequireContactForMessaging(false)}
	              >
	                <ShieldCheck size={16} />
	                <span>
	                  <strong>默认：无需加好友</strong>
	                  <small>同网段发现后可直接发消息和文件；设备指纹仍会被 TOFU 校验。</small>
	                </span>
	              </button>
	              <button
	                class:active={requireContactForMessaging}
	                type="button"
	                aria-label="仅联系人可通信"
	                aria-pressed={requireContactForMessaging}
	                on:click={() => onToggleRequireContactForMessaging(true)}
	              >
	                <Users size={16} />
	                <span>
	                  <strong>仅联系人可通信</strong>
	                  <small>先添加为联系人再收发消息和文件；加好友后该设备默认受信任。</small>
	                </span>
	              </button>
	            </div>
	            <div class="security-policy-note" aria-label="信任设备说明">
	              <ShieldCheck size={16} />
	              <p>
	                <strong>已信任设备不是好友列表</strong>
	                <span>它只保存设备 ID 与证书指纹。默认模式仍允许发现设备直接通信；仅联系人模式下，添加好友后会自动建立设备信任。</span>
	              </p>
	            </div>
	          </section>
	          <section class="settings-info-card" aria-label="信任概览">
	            <header>
	              <ShieldCheck size={16} />
	              <div>
	                <strong>设备指纹信任</strong>
	                <span>用于 TOFU 指纹锁定，避免同一设备 ID 被证书替换。</span>
	              </div>
	              <button class="section-compact-action" type="button" on:click={() => onCopyIdentityValue(securityDiagnosticReport(), "安全诊断报告")}>
	                <Copy size={12} />
                复制诊断报告
              </button>
            </header>
            <dl>
              <div>
                <dt>已发现</dt>
                <dd>已发现 {peers.length} 台设备</dd>
              </div>
              <div>
                <dt>星标</dt>
                <dd>{peers.filter((peer) => metadataFor(peer).favorite).length}</dd>
              </div>
	              <div>
	                <dt>策略</dt>
	                <dd>{requireContactForMessaging ? "仅联系人" : "默认直连"} + TOFU</dd>
	              </div>
	            </dl>
	          </section>
	          <section class="trusted-device-section discovered-trust-section" aria-label="发现设备指纹">
	            <header>
	              <div>
	                <strong>发现设备指纹</strong>
	                <span>可手动确认设备指纹；添加联系人时也会自动建立信任。</span>
	              </div>
	              <span>{peers.length} 台</span>
	            </header>
	            <div class="data-grid compact">
	              {#each peers as peer (peer.peer_id)}
	                <article class="data-row security-row">
	                  <ShieldCheck size={16} />
	                  <div>
	                    <strong>{peer.display_name}</strong>
	                    <small>{peer.fingerprint}</small>
	                  </div>
	                  <button class="section-compact-action" type="button" on:click={() => onTrustPeer(peer)}>
	                    <ShieldCheck size={12} />
	                    信任
	                  </button>
	                </article>
	              {/each}
	            </div>
	          </section>
	          <section class="trusted-device-section" aria-label="已信任设备">
	            <header>
	              <div>
	                <strong>已信任设备</strong>
	                <span>只记录设备 ID 与指纹，不决定默认是否允许内网通信。</span>
	              </div>
              <span>{visibleTrustedPeers.length} / {trustedPeers.length} 台</span>
            </header>
            <label class="search-box trusted-device-search">
              <Search size={15} />
              <input
                value={trustedDeviceQuery}
                placeholder="搜索设备 ID 或指纹"
                on:input={(event) => (trustedDeviceQuery = (event.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <div class="data-grid compact">
              {#each visibleTrustedPeers as record (record.peer_id)}
                <article class="data-row security-row trusted-device-row">
                  <ShieldCheck size={16} />
                  <div>
                    <strong>{trustedPeerLabel(record)}</strong>
                    <small title={record.fingerprint}>{record.fingerprint}</small>
                    <small>信任时间 {formatTrustTime(record.trusted_at)}</small>
                    <small class:trust-warning={trustedPeerFingerprintMismatch(record)}>{trustedPeerFingerprintState(record)}</small>
                  </div>
                  <div class="trusted-device-actions">
                    <button
                      class="trusted-action"
                      type="button"
                      aria-label={`复制 ${trustedPeerLabel(record)} 指纹`}
                      on:click={() => onCopyTrustedFingerprint(record.fingerprint, `${trustedPeerLabel(record)} 指纹`)}
                    >
                      <Copy size={12} />
                      复制指纹
                    </button>
                    <button
                      class="trusted-action"
                      type="button"
                      aria-label={`复制 ${trustedPeerLabel(record)} 信任记录`}
                      on:click={() => onCopyIdentityValue(trustedPeerAuditReport(record), `${trustedPeerLabel(record)} 信任记录`)}
                    >
                      <Copy size={12} />
                      复制记录
                    </button>
                    <button class="trusted-action danger" type="button" on:click={() => onRemoveTrustedPeer(record.peer_id)}>
                      <Trash2 size={12} />
                      移除信任
                    </button>
                  </div>
                </article>
              {:else}
                <p class="empty-note compact">
                  {trustedDeviceNeedle ? "没有匹配的已信任设备。" : "暂无已信任设备。首次发现联系人时会自动建立 TOFU 信任。"}
                </p>
              {/each}
            </div>
          </section>
          {#if trustStatus}
            <p class="hint">{trustStatus}</p>
          {/if}
        {:else}
          <section class="preference-dashboard" aria-label="偏好概览">
            <header>
              <Palette size={16} />
              <div>
                <strong>工作台偏好</strong>
                <span>通知、隐私、窗口、登录和快捷键都集中在这里配置。</span>
              </div>
            </header>
            <div class="preference-status-grid">
              <article class={notificationReady ? "ok" : "warning"}>
                <Bell size={16} />
                <span>系统通知</span>
                <strong>{notificationReady ? "已开启" : "未授权"}</strong>
                <small>{notificationReady ? "新消息会触发桌面提醒" : "点击下方按钮开启提醒"}</small>
              </article>
              <article class={privacyMode ? "ok" : "neutral"}>
                <ShieldCheck size={16} />
                <span>隐私保护</span>
                <strong>{privacyMode ? "保护中" : "标准模式"}</strong>
                <small>{privacyMode ? "通知内容自动隐藏" : showNotificationPreview ? "通知显示消息摘要" : "通知隐藏消息摘要"}</small>
              </article>
              <article class={closeToTray ? "ok" : "neutral"}>
                <Minimize2 size={16} />
                <span>窗口行为</span>
                <strong>{closeToTray ? "常驻托盘" : "直接关闭"}</strong>
                <small>{trayStatus || (closeToTray ? "关闭按钮会隐藏到托盘" : "关闭按钮退出窗口")}</small>
              </article>
              <article class="neutral">
                <Keyboard size={16} />
                <span>发送快捷键</span>
                <strong>{sendShortcut === "enter" ? "Enter" : "Ctrl+Enter"}</strong>
                <small>只保留沟通高频动作</small>
              </article>
            </div>
          </section>
          <section class="settings-action-panel settings-command-panel settings-preference-panel notification-preference-panel" aria-label="提醒与隐私">
            <header>
              <strong>提醒与隐私</strong>
              <span>通知设置已合并到设置页；没有单独通知菜单，避免入口重复。</span>
            </header>
            <div class="settings-action-grid">
              <button class="action-card primary-card" type="button" aria-label={notificationReady ? "重新检查系统通知" : "开启系统通知"} on:click={onEnableNotifications}>
                <Bell size={16} />
                <span>
                  <strong>{notificationReady ? "重新检查通知" : "开启系统通知"}</strong>
                  <small>{notificationReady ? "重新检查桌面通知权限" : "允许收到新消息和文件提醒"}</small>
                </span>
              </button>
              <button class:enabled={showNotificationPreview && !privacyMode} class="preference-toggle" type="button" aria-label={privacyMode ? "隐私模式已隐藏通知内容" : showNotificationPreview ? "隐藏通知消息内容" : "显示通知消息内容"} on:click={onToggleNotificationPreview}>
                <Bell size={16} />
                <span>
                  <strong>通知预览</strong>
                  <small>{privacyMode ? "隐私模式接管" : showNotificationPreview ? "显示消息摘要" : "隐藏消息摘要"}</small>
                </span>
              </button>
              <button class:enabled={privacyMode} class="preference-toggle" type="button" aria-label={privacyMode ? "关闭隐私模式" : "开启隐私模式"} on:click={onTogglePrivacyMode}>
                <ShieldCheck size={16} />
                <span>
                  <strong>隐私模式</strong>
                  <small>{privacyMode ? "通知与锁屏场景隐藏内容" : "可显示常规消息摘要"}</small>
                </span>
              </button>
            </div>
          </section>
          <section class="settings-action-panel settings-command-panel settings-preference-panel window-preference-panel" aria-label="窗口与外观">
            <header>
              <strong>窗口与外观</strong>
              <span>窗口行为和主题放在一起，保留常驻桌面 IM 的核心控制。</span>
            </header>
            <div class="settings-action-grid">
              <button class:enabled={closeToTray} class="preference-toggle" type="button" aria-label={closeToTray ? "关闭按钮改为关闭窗口" : "关闭按钮隐藏到托盘"} on:click={onToggleCloseToTray}>
                <Minimize2 size={16} />
                <span>
                  <strong>关闭按钮</strong>
                  <small>{closeToTray ? "隐藏到托盘" : "关闭窗口"}</small>
                </span>
              </button>
              <button class:enabled={dark} class="preference-toggle" type="button" aria-label={dark ? "切换浅色主题" : "切换深色主题"} on:click={onToggleTheme}>
                <Palette size={16} />
                <span>
                  <strong>主题</strong>
                  <small>{dark ? "深色工作台" : "浅色工作台"}</small>
                </span>
              </button>
              <button class="action-card" type="button" aria-label="最小化到托盘" on:click={onMinimizeToTray}>
                <Minimize2 size={16} />
                <span>
                  <strong>立即最小化</strong>
                  <small>保持后台收发和系统通知</small>
                </span>
              </button>
            </div>
          </section>
          <section class="settings-action-panel login-preference-panel" aria-label="登录与个人展示">
            <header>
              <strong>登录与个人展示</strong>
              <span>默认无需登录；启用后，下次启动会先要求输入本机密码。</span>
            </header>
            <div class="login-preference-layout">
              <button class:enabled={loginEnabled} class="preference-toggle login-toggle" type="button" aria-label={loginEnabled ? "关闭登录密码" : "启用登录密码"} on:click={() => onLoginEnabledChange(!loginEnabled)}>
                <ShieldCheck size={16} />
                <span>
                  <strong>登录密码</strong>
                  <small>{loginEnabled ? "下次启动需要解锁" : "默认直接进入"}</small>
                </span>
              </button>
              <div class="login-fields">
                <label class="field">
                  <span>新登录密码</span>
                  <input
                    type="password"
                    value={loginPasswordDraft}
                    disabled={!loginEnabled}
                    autocomplete="new-password"
                    placeholder="至少 4 位"
                    on:input={(event) => onLoginPasswordDraftChange((event.currentTarget as HTMLInputElement).value)}
                  />
                </label>
                <label class="field">
                  <span>确认密码</span>
                  <input
                    type="password"
                    value={loginPasswordConfirmDraft}
                    disabled={!loginEnabled}
                    autocomplete="new-password"
                    placeholder="再次输入"
                    on:input={(event) => onLoginPasswordConfirmChange((event.currentTarget as HTMLInputElement).value)}
                  />
                </label>
                <button class="primary-action settings-primary-action" type="button" disabled={loginEnabled && !loginPasswordReady} on:click={onSaveLoginSettings}>
                  <Save size={15} />
                  保存登录设置
                </button>
              </div>
            </div>
            <div class="profile-extra-grid">
              <label class="field">
                <span>个人签名</span>
                <input
                  value={profileSignature}
                  maxlength="80"
                  placeholder="例如：专注内网直连"
                  on:input={(event) => onProfileSignatureChange((event.currentTarget as HTMLInputElement).value)}
                />
              </label>
              <label class="field">
                <span>头像文字</span>
                <input
                  value={avatarLabel}
                  maxlength="2"
                  placeholder="灵"
                  on:input={(event) => onAvatarLabelChange((event.currentTarget as HTMLInputElement).value)}
                />
              </label>
              <button class="primary-action settings-primary-action" type="button" on:click={onSaveProfileExtras}>
                <Save size={15} />
                保存展示资料
              </button>
            </div>
          </section>
          <section class="settings-action-panel shortcut-settings-panel" aria-label="快捷键设置">
            <header>
              <Keyboard size={16} />
              <div>
                <strong>快捷键设置</strong>
                <span>只保留日常沟通最高频的操作，避免把通知、主题等杂项混进快捷键里。</span>
              </div>
            </header>
            <div class="shortcut-settings-grid">
              <article class:enabled={sendShortcut === "ctrl_enter"} class="shortcut-setting-card shortcut-setting-editor" aria-label="发送消息快捷键">
                <MessageSquareText size={16} />
                <span>
                  <strong>发送消息</strong>
                  <small>当前使用 {sendShortcut === "enter" ? "Enter" : "Ctrl+Enter"}</small>
                </span>
                <div class="shortcut-choice-row" role="group" aria-label="发送消息快捷键选项">
                  {#each sendShortcutOptions as option}
                    <button
                      class:active={sendShortcut === option.value}
                      type="button"
                      aria-pressed={sendShortcut === option.value}
                      on:click={() => onSetSendShortcut(option.value)}
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              </article>
              <article class:enabled={shortcuts.screenshot !== "none"} class="shortcut-setting-card shortcut-setting-editor" aria-label="截图快捷键">
                <Scissors size={16} />
                <span>
                  <strong>截图</strong>
                  <small>应用聚焦时启动截图，完成后可粘贴到聊天输入框</small>
                </span>
                <div class="shortcut-choice-row" role="group" aria-label="截图快捷键选项">
                  {#each screenshotShortcutOptions as option}
                    <button
                      class:active={shortcuts.screenshot === option.value}
                      type="button"
                      aria-pressed={shortcuts.screenshot === option.value}
                      on:click={() => onSetScreenshotShortcut(option.value)}
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              </article>
              <article class:enabled={shortcuts.toggle_window !== "none"} class="shortcut-setting-card shortcut-setting-editor" aria-label="打开/关闭窗口快捷键">
                <Minimize2 size={16} />
                <span>
                  <strong>打开/关闭窗口</strong>
                  <small>{closeToTray ? "聚焦时隐藏到托盘，托盘点击恢复窗口" : "聚焦时最小化，托盘设置可恢复"}</small>
                </span>
                <div class="shortcut-choice-row" role="group" aria-label="打开/关闭窗口快捷键选项">
                  {#each windowShortcutOptions as option}
                    <button
                      class:active={shortcuts.toggle_window === option.value}
                      type="button"
                      aria-pressed={shortcuts.toggle_window === option.value}
                      on:click={() => onSetWindowShortcut(option.value)}
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              </article>
            </div>
          </section>
          {#if trayStatus}
            <p class="hint">{trayStatus}</p>
          {/if}
        {/if}

        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
