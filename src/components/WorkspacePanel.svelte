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
  import Square from "lucide-svelte/icons/square";
  import Star from "lucide-svelte/icons/star";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UploadCloud from "lucide-svelte/icons/upload-cloud";
  import Users from "lucide-svelte/icons/users";
  import { defaultTransportConfig, type ChatMessage, type ContactMetadata, type NetworkSettings, type PeerProfile, type PeerStatus, type StorageOverview, type TransferTask, type TransportConfig, type TrustedPeer } from "../api";
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
  export let seedText = "";
  export let rangeText = "";
  export let discoveryIntervalText = "3";
  export let peerTtlText = "15";
  export let transferTasks: TransferTask[] = [];
  export let profileName = "";
  export let profileHostname = "";
  export let profileStatus: PeerStatus = "online";
  export let notificationReady = false;
  export let dark = false;
  export let sendShortcut: "enter" | "ctrl_enter" = "enter";
  export let showNotificationPreview = true;
  export let privacyMode = false;
  export let closeToTray = true;
  export let statusText = "";
  export let trustStatus = "";
  export let trayStatus = "";
  export let networkInputWarning = "";
  export let networkWarnings: string[] = [];
  export let storageOverview: StorageOverview | null = null;
  export let trustedPeers: TrustedPeer[] = [];
  export let settingsTab: SettingsTab = "profile";
  export let onTogglePeer: (peerId: string) => void = () => {};
  export let onSelectConversation: (id: string) => void | Promise<void> = () => {};
  export let onOpenMessageResult: (message: ChatMessage) => void | Promise<void> = () => {};
  export let onMessageContext: (message: ChatMessage, event: MouseEvent) => void = () => {};
  export let onRetryOutboxMessages: () => void | Promise<void> = () => {};
  export let onCreateGroup: () => void | Promise<void> = () => {};
  export let onSearch: () => void | Promise<void> = () => {};
  export let onRefreshFavorites: () => void | Promise<void> = () => {};
  export let onToggleAutoDiscovery: () => void | Promise<void> = () => {};
  export let onToggleMulticast: () => void | Promise<void> = () => {};
  export let onSeedTextChange: (value: string) => void = () => {};
  export let onRangeTextChange: (value: string) => void = () => {};
  export let onDiscoveryIntervalTextChange: (value: string) => void = () => {};
  export let onPeerTtlTextChange: (value: string) => void = () => {};
  export let onSaveNetwork: () => void | Promise<void> = () => {};
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
  export let onToggleSendShortcut: () => void | Promise<void> = () => {};
  export let onToggleNotificationPreview: () => void | Promise<void> = () => {};
  export let onTogglePrivacyMode: () => void | Promise<void> = () => {};
  export let onToggleCloseToTray: () => void | Promise<void> = () => {};
  export let onRefreshStorage: () => void | Promise<void> = () => {};
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
  export let onCopyTransferDiagnostics: (report: string) => void | Promise<void> = () => {};
  export let onContactMetadataChange: (peerId: string, patch: Partial<ContactMetadata>) => void = () => {};
  export let onSaveContactMetadata: (peerId: string) => void | Promise<void> = () => {};
  export let onContactContext: (peer: PeerProfile, event: MouseEvent) => void = () => {};
  export let onOpenSettingsTab: (tab: SettingsTab) => void = () => {};

  let focusedContactId = "";
  let contactFilter: ContactFilter = "all";
  let transferQuery = "";
  let transferStatusFilter: TransferStatusFilter = "all";
  let trustedDeviceQuery = "";

  const settingsTabs: Array<{ id: SettingsTab; label: string; icon: typeof Users }> = [
    { id: "profile", label: "个人", icon: Users },
    { id: "network", label: "网络", icon: Network },
    { id: "storage", label: "存储", icon: HardDrive },
    { id: "security", label: "安全", icon: ShieldCheck },
    { id: "preferences", label: "偏好", icon: Palette }
  ];

  const profileStatusChoices: Array<{ value: PeerStatus; label: string; tone: "online" | "offline" }> = [
    { value: "online", label: "在线", tone: "online" },
    { value: "away", label: "离开", tone: "offline" },
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
      `种子节点：${settings.seed_peers.join(", ") || "无"}`,
      `扫描网段：${settings.scan_ranges.join(", ") || "无"}`,
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

  function transferTaskDiagnosticReport(task: TransferTask) {
    return [
      "灵犀内网通传输记录",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `任务 ID：${task.id}`,
      `会话：${task.conversationId}`,
      `名称：${task.name || task.id}`,
      `状态：${transferStatusLabel(task)} (${task.status || "unknown"})`,
      `进度：${transferProgress(task)}%`,
      `已传输：${formatBytes(task.sentBytes)} / ${formatBytes(task.totalBytes)}`,
      `文件数量：${task.files.length}`,
      `文件清单：${task.files.join("\n") || "无"}`,
      `错误：${task.errorMessage || "无"}`,
      `可重新广播：${task.resumable ? "是" : "否"}`,
      `本地源状态：${cannotResumeTerminalTransfer(task) ? "缺少可重新广播的源文件或授权信息" : "可用或无需续传"}`
    ].join("\n");
  }

  function storagePathRows(overview: StorageOverview | null) {
    return [
      { label: "应用数据", value: overview?.data_dir ?? "", fallback: "等待加载", copyLabel: "应用数据路径" },
      { label: "加密数据库", value: overview?.database_path ?? "", fallback: "等待加载", copyLabel: "加密数据库路径" },
      { label: "密钥保护", value: overview?.database_key_protection ?? "", fallback: "等待加载", copyLabel: "" },
      { label: "密钥文件", value: overview?.database_key_path ?? "", fallback: "等待加载", copyLabel: "密钥文件路径" },
      { label: "接收文件", value: overview?.received_files_dir ?? "", fallback: "等待加载", copyLabel: "接收文件路径" },
      { label: "剪贴板暂存", value: overview?.staged_files_dir ?? "", fallback: "等待加载", copyLabel: "剪贴板暂存路径" }
    ];
  }

  function statusLabel(status: PeerStatus) {
    return status === "online" ? "可联系" : "暂不可达";
  }

  function peerPresenceLabel(peer: PeerProfile) {
    return `${peerLabel(peer)} ${statusLabel(peer.status)}状态`;
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
  $: hasContactFilters = normalizedQuery.length > 0 || contactFilter !== "all";
  $: reachablePeers = visiblePeers.filter((peer) => peer.status === "online");
  $: unreachablePeers = visiblePeers.filter((peer) => peer.status !== "online");
  $: contactGroups = [
    { id: "reachable", label: "可联系设备", peers: reachablePeers },
    { id: "unreachable", label: "暂不可达设备", peers: unreachablePeers }
  ];
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
  $: storageCacheBytes = storageOverview ? storageOverview.received_bytes + storageOverview.staged_bytes : 0;
  $: activeTransferTasks = transferTasks.filter(isActiveTransfer);
  $: historyTransferTasks = transferTasks.filter((task) => !isActiveTransfer(task));
  $: filteredTransferTasks = transferTasks.filter((task) => matchesTransferFilters(task, transferQuery, transferStatusFilter));
  $: filteredActiveTransferTasks = filteredTransferTasks.filter(isActiveTransfer);
  $: filteredHistoryTransferTasks = filteredTransferTasks.filter((task) => !isActiveTransfer(task));
  $: hasTransferFilters = transferQuery.trim().length > 0 || transferStatusFilter !== "all";
  $: trustedDeviceNeedle = trustedDeviceQuery.trim().toLowerCase();
  $: visibleTrustedPeers = trustedDeviceNeedle
    ? trustedPeers.filter((record) => trustedPeerSearchText(record, peers).includes(trustedDeviceNeedle))
    : trustedPeers;
  $: transferFileCount = transferTasks.reduce((sum, task) => sum + task.files.length, 0);
  $: transferTotalBytes = transferTasks.reduce((sum, task) => sum + task.totalBytes, 0);
  $: discoveredPeerCount = peers.length;
  $: onlinePeerCount = peers.filter((peer) => peer.status === "online").length;
  $: advancedDiscoveryCount = settings.seed_peers.length + settings.scan_ranges.length;
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
      detail: onlinePeerCount > 0 ? "已发现可直连设备，可尝试发送消息或文件。" : "检查 Windows 防火墙、同网段连接，或在高级配置中加入种子节点。"
    },
    {
      tone: settings.multicast || advancedDiscoveryCount > 0 ? "ok" : "warning",
      title: settings.multicast || advancedDiscoveryCount > 0 ? "发现目标已配置" : "缺少跨网段目标",
      detail: settings.multicast
        ? "局域网广播已开启；复杂企业网络可继续补充种子节点或扫描网段。"
        : advancedDiscoveryCount > 0
          ? "已配置种子节点或扫描网段，可用于广播不可达的网络。"
          : "关闭广播时至少配置一个种子节点或扫描网段，否则只能依赖已缓存联系人。"
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
  {#if section === "contacts"}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">联系人</span>
        <h1>内网设备</h1>
        <p>选择成员可创建无服务器群聊；点击联系人进入直连会话。</p>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <button class="tool-button" type="button" disabled={selectedPeerIds.length === 0} on:click={onCreateGroup}>
        <Users size={15} />
        创建群聊
      </button>
    </header>
    <div class="contacts-layout">
      <div class="contacts-directory">
        <div class="contact-directory-summary" aria-label="联系人概览">
          <span>全部 {visiblePeers.length}</span>
          <span>可联系 {reachablePeers.length}</span>
          <span>暂不可达 {unreachablePeers.length}</span>
          <span>已选 {selectedPeerIds.length}</span>
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
          <div class="empty-action-note">
            {#if hasContactFilters}
              <p class="empty-note">没有匹配的联系人。可切换筛选条件或清空搜索关键字。</p>
            {:else}
              <p class="empty-note">暂无联系人。请检查防火墙，或在设置里的网络发现中配置种子节点和扫描网段。</p>
              <button class="tool-button" type="button" on:click={() => onOpenSettingsTab("network")}>
                <Network size={15} />
                配置网络发现
              </button>
            {/if}
          </div>
        {/if}

        {#each contactGroups as group (group.id)}
          {#if group.peers.length > 0}
            <section class="contact-group" role="group" aria-label={`${group.label} ${group.peers.length} 台`}>
              <header class="contact-group-head">
                <strong>{group.label}</strong>
                <span>{group.peers.length} 台</span>
              </header>
              <div class="data-grid contacts-grid">
                {#each group.peers as peer (peer.peer_id)}
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
                        <strong>{peerLabel(peer)}</strong>
                        <small>
                          {#if metadataFor(peer).remark}
                            原名 {peer.display_name} ·
                          {/if}
                          {metadataFor(peer).group_name || "默认"} · {peer.hostname}
                          {#if metadataFor(peer).blocked}
                            · 已阻止
                          {/if}
                        </small>
                        <small>{peer.endpoints[0] ?? "等待端点"}</small>
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
                      <button type="button" on:click={() => onSaveContactMetadata(peer.peer_id)}>保存</button>
                      <button
                        type="button"
                        aria-label={`和 ${peerLabel(peer)} 聊天`}
                        disabled={metadataFor(peer).blocked}
                        on:click={() => onSelectConversation(`direct:${peer.peer_id}`)}
                      >
                        聊天
                      </button>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/if}
        {/each}
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
              class="wide-button"
              type="button"
              disabled={metadataFor(focusedContact).blocked}
              on:click={() => onSelectConversation(`direct:${focusedContact.peer_id}`)}
            >
              <MessageSquareText size={15} />
              发消息
            </button>
            <button
              class:danger={!metadataFor(focusedContact).blocked}
              class="wide-button muted"
              type="button"
              on:click={() =>
                onContactMetadataChange(focusedContact.peer_id, { blocked: !metadataFor(focusedContact).blocked })}
            >
              <Ban size={15} />
              {metadataFor(focusedContact).blocked ? "取消阻止" : "阻止联系人"}
            </button>
            <button class="wide-button muted" type="button" on:click={() => onSaveContactMetadata(focusedContact.peer_id)}>
              <Save size={15} />
              保存资料
            </button>
            <button class="wide-button muted" type="button" on:click={() => onTrustPeer(focusedContact)}>
              <ShieldCheck size={15} />
              信任设备
            </button>
            <button
              class="wide-button muted"
              type="button"
              on:click={() => onCopyIdentityValue(contactAuditReport(focusedContact), `${peerLabel(focusedContact)} 联系人记录`)}
            >
              <Copy size={15} />
              复制记录
            </button>
          </div>
        {:else}
          <p class="empty-note">暂无可查看的联系人资料。</p>
        {/if}
      </section>
    </div>
  {:else if section === "search"}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">全局搜索</span>
        <h1>搜索结果</h1>
        <p>查询“{query}”的本地加密历史记录。</p>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <button class="tool-button" type="button" on:click={onSearch}>
        <Search size={15} />
        重新搜索
      </button>
      <button class="tool-button" type="button" on:click={onRefreshFavorites}>
        <Star size={15} />
        刷新消息资料
      </button>
    </header>
    <div class="data-grid">
      {#each searchResults as message (message.id)}
        <article class="data-row search-result" on:contextmenu={(event) => onMessageContext(message, event)}>
          <div>
            <strong>{messageResultPreview(message)}</strong>
            <small>{conversationLabel(message.conversation_id)} · {new Date(message.created_at).toLocaleString("zh-CN")}</small>
          </div>
          <button type="button" on:click={() => onOpenMessageResult(message)}>打开</button>
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
          <button type="button" on:click={() => onOpenMessageResult(message)}>打开</button>
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
            <small>{conversationLabel(message.conversation_id)} 路 {new Date(message.created_at).toLocaleString("zh-CN")}</small>
          </div>
          <button type="button" on:click={() => onOpenMessageResult(message)}>打开</button>
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
          <button type="button" on:click={onRetryOutboxMessages}>全部重试</button>
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
          <button type="button" on:click={() => onOpenMessageResult(message)}>打开</button>
        </article>
      {:else}
        <p class="empty-note">暂无待发送或发送失败消息。</p>
      {/each}
    </div>
  {:else if section === "files"}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">文件传输</span>
        <h1>传输任务</h1>
        <p>展示已选择、已广播和已接收的文件任务。</p>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <div class="workspace-head-actions">
        <button class="tool-button" type="button" aria-label="复制传输诊断报告" title="复制传输诊断报告" on:click={() => onCopyTransferDiagnostics(transferDiagnosticReport())}>
          <Copy size={15} />
          诊断报告
        </button>
        <button class="tool-button" type="button" on:click={onClearCompletedTransfers}>
          <Trash2 size={15} />
          清理已完成
        </button>
      </div>
    </header>
    <div class="transfer-workbench">
      <section class="transfer-overview" aria-label="传输概览">
        <strong>传输概览</strong>
        <div>
          <span>活跃 {activeTransferTasks.length}</span>
          <span>历史 {historyTransferTasks.length}</span>
          <span>文件 {transferFileCount}</span>
          <span>{formatBytes(transferTotalBytes)}</span>
        </div>
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

      <section class="transfer-section" aria-label="活跃传输">
        <div class="section-subhead">
          <strong>活跃传输</strong>
          <small>{filteredActiveTransferTasks.length}</small>
        </div>
          <div class="data-grid">
          {#each filteredActiveTransferTasks as task (task.id)}
            <article class="transfer-card" on:contextmenu={(event) => onTransferContext(task, event)}>
              <div class="transfer-card-head">
                <UploadCloud size={16} />
                <div>
                  <strong>{task.name}</strong>
                  <small>{task.files.length} 个文件 · {formatBytes(task.sentBytes)} / {formatBytes(task.totalBytes)}</small>
                </div>
                <span class={`transfer-status-badge ${transferStatusTone(task)}`}>{transferStatusLabel(task)} · {transferProgress(task)}%</span>
              </div>
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
              <div class="transfer-card-actions">
                <button type="button" on:click={() => onOpenTransfer(task.id)}>定位</button>
                <button type="button" aria-label={`复制 ${task.name} 传输任务 ID`} title={`复制 ${task.name} 传输任务 ID`} on:click={() => onCopyTransferId(task.id, `${task.name} 传输任务 ID`)}>
                  复制 ID
                </button>
                <button type="button" aria-label={`复制 ${task.name} 传输记录`} title={`复制 ${task.name} 传输记录`} on:click={() => onCopyTransferDiagnostics(transferTaskDiagnosticReport(task))}>
                  复制记录
                </button>
                <button type="button" on:click={() => onCancelTransfer(task.id)}>取消</button>
              </div>
            </article>
          {:else}
            <p class="empty-note">
              {hasTransferFilters ? "没有匹配的活跃传输。" : "暂无活跃传输。可在聊天页拖拽文件，或点击输入框上方的“文件/文件夹”。"}
            </p>
          {/each}
        </div>
      </section>

      <section class="transfer-section" aria-label="历史记录">
        <div class="section-subhead">
          <strong>历史记录</strong>
          <small>{filteredHistoryTransferTasks.length}</small>
        </div>
          <div class="data-grid">
          {#each filteredHistoryTransferTasks as task (task.id)}
            <article class="data-row transfer-task" on:contextmenu={(event) => onTransferContext(task, event)}>
              <UploadCloud size={16} />
              <div>
                <strong>{task.name}</strong>
                <small><span class={`transfer-status-badge ${transferStatusTone(task)}`}>{transferStatusLabel(task)}</span> · {formatBytes(task.sentBytes)} / {formatBytes(task.totalBytes)}</small>
                {#if task.errorMessage}
                  <small class="transfer-error">失败原因：{task.errorMessage}</small>
                {/if}
                {#if cannotResumeTerminalTransfer(task)}
                  <small class="transfer-error">本机缺少可重新广播的源文件或授权信息</small>
                {/if}
              </div>
              <span>{task.files.length} 个文件</span>
              {#if canResumeTransfer(task)}
                <button type="button" on:click={() => onResumeTransfer(task.id)}>重新广播</button>
              {/if}
              <button type="button" aria-label={`复制 ${task.name} 传输任务 ID`} title={`复制 ${task.name} 传输任务 ID`} on:click={() => onCopyTransferId(task.id, `${task.name} 传输任务 ID`)}>
                复制 ID
              </button>
              <button type="button" aria-label={`复制 ${task.name} 传输记录`} title={`复制 ${task.name} 传输记录`} on:click={() => onCopyTransferDiagnostics(transferTaskDiagnosticReport(task))}>
                复制记录
              </button>
              <button type="button" on:click={() => onOpenTransfer(task.id)}>定位</button>
              <button type="button" on:click={() => onDeleteTransfer(task.id)}>删除</button>
            </article>
          {:else}
            <p class="empty-note">{hasTransferFilters ? "没有匹配的历史传输记录。" : "暂无历史传输记录。"}</p>
          {/each}
        </div>
      </section>
    </div>
  {:else}
    <header class="workspace-head">
      <div>
        <span class="eyebrow">设置</span>
        <h1>工作台配置</h1>
        <p>集中管理个人资料、网络发现、存储、安全信任、通知与外观。</p>
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
          <section class="settings-info-card" aria-label="设备身份">
            <header>
              <Users size={16} />
              <div>
                <strong>设备身份</strong>
                <span>用于局域网发现、会话签名和 TOFU 信任。</span>
              </div>
            </header>
            <dl>
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
          <label class="field">
            <span>显示名称</span>
            <input value={profileName} placeholder={self?.display_name ?? "本机用户"} on:input={(event) => onProfileNameChange((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>主机备注</span>
            <input value={profileHostname} placeholder={self?.hostname ?? "windows-pc"} on:input={(event) => onProfileHostnameChange((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <div class="field">
            <span>在线状态</span>
            <div class="presence-choice-grid" role="group" aria-label="本机在线状态">
              {#each profileStatusChoices as choice (choice.value)}
                <button
                  class:active={profileStatus === choice.value}
                  class="status-choice"
                  type="button"
                  aria-pressed={profileStatus === choice.value}
                  on:click={() => onProfileStatusChange(choice.value)}
                >
                  <span class={`presence-dot ${choice.tone}`}></span>
                  {choice.label}
                </button>
              {/each}
            </div>
          </div>
          <button class="wide-button" type="button" on:click={onSaveProfile}>
            <Save size={15} />
            保存本机资料
          </button>
        {:else if settingsTab === "network"}
          <section class="settings-info-card" aria-label="网络发现参数">
            <header>
              <Network size={16} />
              <div>
                <strong>发现与直连</strong>
                <span>默认同网段自动发现，复杂网络可配置种子与扫描网段。</span>
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
                <dt>种子数量</dt>
                <dd>{settings.seed_peers.length}</dd>
              </div>
              <div>
                <dt>扫描网段</dt>
                <dd>{settings.scan_ranges.length}</dd>
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
            <div>
              <Network size={16} />
              <span>发现设备</span>
              <strong>{discoveredPeerCount}</strong>
            </div>
            <div>
              <Users size={16} />
              <span>可联系</span>
              <strong>{onlinePeerCount}</strong>
            </div>
            <div class:enabled={settings.auto_discovery}>
              <CheckSquare size={16} />
              <span>自动发现</span>
              <strong>{settings.auto_discovery ? "开启" : "关闭"}</strong>
            </div>
            <div class:enabled={settings.multicast}>
              <Network size={16} />
              <span>广播</span>
              <strong>{settings.multicast ? "开启" : "关闭"}</strong>
            </div>
            <div>
              <HardDrive size={16} />
              <span>高级配置</span>
              <strong>{advancedDiscoveryCount}</strong>
            </div>
          </section>
          <section class="network-diagnostics" aria-label="网络诊断建议">
            <header>
              <ShieldCheck size={16} />
              <div>
                <strong>网络诊断</strong>
                <span>根据当前发现配置、可联系设备和最近警告生成排查建议。</span>
              </div>
              <button type="button" on:click={() => onCopyNetworkDiagnostics(networkDiagnosticReport())}>复制诊断报告</button>
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
          <button class:enabled={settings.auto_discovery} class="switch-row" type="button" on:click={onToggleAutoDiscovery}>
            <Network size={16} />
            <span>自动发现</span>
            <strong>{settings.auto_discovery ? "开启" : "关闭"}</strong>
          </button>
          <button class:enabled={settings.multicast} class="switch-row" type="button" on:click={onToggleMulticast}>
            <Network size={16} />
            <span>局域网广播</span>
            <strong>{settings.multicast ? "开启" : "关闭"}</strong>
          </button>
          <label class="field">
            <span>种子节点</span>
            <input value={seedText} placeholder="192.168.1.20:24251，多个用空格分隔" on:input={(event) => onSeedTextChange((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>扫描网段</span>
            <input value={rangeText} placeholder="192.168.1.0/24，多个用空格分隔" on:input={(event) => onRangeTextChange((event.currentTarget as HTMLInputElement).value)} />
          </label>
          <p class="hint">有效目标仅限 RFC1918 私网地址（10/8、172.16/12、192.168/16）；单个扫描网段最多 1024 个主机。</p>
          <div class="network-tuning-grid">
            <label class="field">
              <span>发现间隔（秒）</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={discoveryIntervalText}
                on:input={(event) => onDiscoveryIntervalTextChange((event.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <label class="field">
              <span>离线判定（秒）</span>
              <input
                type="number"
                min="5"
                max="600"
                step="1"
                value={peerTtlText}
                on:input={(event) => onPeerTtlTextChange((event.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
          <button class="wide-button" type="button" on:click={onSaveNetwork}>
            <Save size={15} />
            保存网络发现设置
          </button>
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
          <div class="storage-summary">
            <div>
              <Database size={18} />
              <span>
                <strong>{storageOverview ? formatBytes(storageOverview.received_bytes + storageOverview.staged_bytes) : "读取中"}</strong>
                <small>文件缓存占用</small>
              </span>
            </div>
            <div>
              <UploadCloud size={18} />
              <span>
                <strong>{storageOverview?.transfer_task_count ?? transferTasks.length}</strong>
                <small>传输任务</small>
              </span>
            </div>
            <div>
              <HardDrive size={18} />
              <span>
                <strong>{storageOverview ? formatBytes(storageOverview.database_bytes) : "读取中"}</strong>
                <small>数据库占用</small>
              </span>
            </div>
          </div>
          <dl class="path-list">
            {#each storagePathRows(storageOverview) as row}
              <div>
                <dt>{row.label}</dt>
                <dd>
                  <span>{row.value || row.fallback}</span>
                  {#if row.value && row.copyLabel}
                    <button
                      type="button"
                      aria-label={`复制${row.copyLabel}`}
                      title={`复制${row.copyLabel}`}
                      on:click={() => onCopyStoragePath(row.value, row.copyLabel)}
                    >
                      复制
                    </button>
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
          <div class="button-row">
            <button class="wide-button muted" type="button" on:click={onRefreshStorage}>
              <RefreshCw size={15} />
              刷新存储信息
            </button>
            <button class="wide-button muted" type="button" on:click={() => onCopyStorageDiagnostics(storageDiagnosticReport())}>
              <Copy size={15} />
              复制存储诊断报告
            </button>
            <button class="wide-button muted" type="button" on:click={() => onOpenStorage("data")}>
              <HardDrive size={15} />
              打开数据目录
            </button>
            <button class="wide-button muted" type="button" on:click={() => onOpenStorage("received")}>
              <UploadCloud size={15} />
              打开接收目录
            </button>
            <button class="wide-button muted" type="button" on:click={() => onOpenStorage("staged")}>
              <HardDrive size={15} />
              打开暂存目录
            </button>
            <button class="wide-button danger" type="button" on:click={onClearStagedFiles}>
              <Trash2 size={15} />
              清理剪贴板暂存
            </button>
          </div>
        {:else if settingsTab === "security"}
          <section class="settings-info-card" aria-label="信任概览">
            <header>
              <ShieldCheck size={16} />
              <div>
                <strong>信任概览</strong>
                <span>首次信任后会拒绝同一设备 ID 的指纹替换。</span>
              </div>
              <button type="button" on:click={() => onCopyIdentityValue(securityDiagnosticReport(), "安全诊断报告")}>复制诊断报告</button>
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
                <dd>TOFU</dd>
              </div>
            </dl>
          </section>
          <div class="data-grid compact">
            {#each peers as peer (peer.peer_id)}
              <article class="data-row security-row">
                <ShieldCheck size={16} />
                <div>
                  <strong>{peer.display_name}</strong>
                  <small>{peer.fingerprint}</small>
                </div>
                <button type="button" on:click={() => onTrustPeer(peer)}>信任</button>
              </article>
            {/each}
          </div>
          <section class="trusted-device-section" aria-label="已信任设备">
            <header>
              <strong>已信任设备</strong>
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
                      type="button"
                      aria-label={`复制 ${trustedPeerLabel(record)} 指纹`}
                      on:click={() => onCopyTrustedFingerprint(record.fingerprint, `${trustedPeerLabel(record)} 指纹`)}
                    >
                      复制指纹
                    </button>
                    <button
                      type="button"
                      aria-label={`复制 ${trustedPeerLabel(record)} 信任记录`}
                      on:click={() => onCopyIdentityValue(trustedPeerAuditReport(record), `${trustedPeerLabel(record)} 信任记录`)}
                    >
                      复制记录
                    </button>
                    <button class="danger-text" type="button" on:click={() => onRemoveTrustedPeer(record.peer_id)}>移除信任</button>
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
          <section class="settings-info-card" aria-label="工作台偏好">
            <header>
              <Palette size={16} />
              <div>
                <strong>工作台偏好</strong>
                <span>控制通知、托盘和明暗主题，保持桌面 IM 常驻可用。</span>
              </div>
            </header>
            <dl>
              <div>
                <dt>通知</dt>
                <dd>{notificationReady ? "已开启" : "未开启"}</dd>
              </div>
              <div>
                <dt>通知预览</dt>
                <dd>{privacyMode ? "隐私模式隐藏" : showNotificationPreview ? "显示内容" : "隐藏内容"}</dd>
              </div>
              <div>
                <dt>隐私模式</dt>
                <dd>{privacyMode ? "已开启" : "未开启"}</dd>
              </div>
              <div>
                <dt>主题</dt>
                <dd>{dark ? "深色" : "浅色"}</dd>
              </div>
              <div>
                <dt>发送键</dt>
                <dd>{sendShortcut === "enter" ? "Enter" : "Ctrl+Enter"}</dd>
              </div>
              <div>
                <dt>托盘</dt>
                <dd>{closeToTray ? "关闭隐藏到托盘" : "关闭窗口"}</dd>
              </div>
            </dl>
          </section>
          <button class="wide-button muted" type="button" on:click={onEnableNotifications}>
            <Bell size={15} />
            {notificationReady ? "系统通知已开启" : "开启系统通知"}
          </button>
          <button class="wide-button muted" type="button" on:click={onMinimizeToTray}>
            <Minimize2 size={15} />
            最小化到托盘
          </button>
          <button class="wide-button muted" type="button" on:click={onToggleCloseToTray}>
            <Minimize2 size={15} />
            {closeToTray ? "关闭按钮改为关闭窗口" : "关闭按钮隐藏到托盘"}
          </button>
          <button class="wide-button muted" type="button" on:click={onToggleTheme}>
            <Palette size={15} />
            {dark ? "切换浅色主题" : "切换深色主题"}
          </button>
          <button class="wide-button muted" type="button" on:click={onToggleSendShortcut}>
            <Keyboard size={15} />
            {sendShortcut === "enter" ? "切换 Ctrl+Enter 发送" : "切换 Enter 发送"}
          </button>
          <button class:enabled={privacyMode} class="wide-button muted" type="button" on:click={onTogglePrivacyMode}>
            <ShieldCheck size={15} />
            {privacyMode ? "关闭隐私模式" : "开启隐私模式"}
          </button>
          <button class="wide-button muted" type="button" on:click={onToggleNotificationPreview}>
            <Bell size={15} />
            {privacyMode ? "隐私模式已隐藏通知内容" : showNotificationPreview ? "隐藏通知消息内容" : "显示通知消息内容"}
          </button>
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
