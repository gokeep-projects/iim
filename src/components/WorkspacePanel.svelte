<script lang="ts">
  import Ban from "lucide-svelte/icons/ban";
  import Bell from "lucide-svelte/icons/bell";
  import CheckSquare from "lucide-svelte/icons/check-square";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
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
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UploadCloud from "lucide-svelte/icons/upload-cloud";
  import Users from "lucide-svelte/icons/users";
  import X from "lucide-svelte/icons/x";
  import UserAvatar from "./UserAvatar.svelte";
  import {
    defaultAppShortcuts,
    defaultTransportConfig,
    type AppShortcuts,
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
  type SecurityDeviceItem = {
    peerId: string;
    peer: PeerProfile | null;
    trusted: TrustedPeer | null;
    label: string;
    hostname: string;
    ip: string;
    fingerprint: string;
  };

  export let section: Section = "contacts";
  export let peers: PeerProfile[] = [];
  export let self: PeerProfile | null = null;
  export let focusedContactPeerId = "";
  export let contactMetadata: Record<string, ContactMetadata> = {};
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
  export let avatarImage = "";
  export let requireContactForMessaging = false;
  export let statusText = "";
  export let trustStatus = "";
  export let trayStatus = "";
  export let refreshingPeers = false;
  export let networkInputWarning = "";
  export let networkWarnings: string[] = [];
  export let storageOverview: StorageOverview | null = null;
  export let storageMigrationProgress: StorageMigrationProgress | null = null;
  export let storageMigrationActive = false;
  export let trustedPeers: TrustedPeer[] = [];
  export let settingsTab: SettingsTab = "profile";
  export let onSelectConversation: (id: string) => void | Promise<void> = () => {};
  export let onCreateGroup: () => void | Promise<void> = () => {};
  export let onRefreshPeers: () => boolean | void | Promise<boolean | void> = () => {};
  export let onTrustPeer: (peer?: PeerProfile | null) => void | Promise<void> = () => {};
  export let onRefreshTrustedPeers: () => void | Promise<void> = () => {};
  export let onRemoveTrustedPeer: (peerId: string) => void | Promise<void> = () => {};
  export let onProfileNameChange: (value: string) => void = () => {};
  export let onProfileHostnameChange: (value: string) => void = () => {};
  export let onProfileStatusChange: (value: PeerStatus) => void = () => {};
  export let onSaveProfile: () => boolean | void | Promise<boolean | void> = () => {};
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
  export let onAvatarImageChange: (value: string) => void = () => {};
  export let onSaveProfileExtras: () => boolean | void | Promise<boolean | void> = () => {};
  export let onRefreshStorage: () => void | Promise<void> = () => {};
  export let onMigrateStorageDirectory: () => void | Promise<void> = () => {};
  export let onClearStagedFiles: () => void | Promise<void> = () => {};
  export let onOpenStorage: (kind: "data" | "received" | "staged") => void | Promise<void> = () => {};
  export let onCopyStoragePath: (path: string, label: string) => void | Promise<void> = () => {};
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
  let contactQuery = "";
  let visibleContactLimit = 40;
  const contactPageSize = 40;
  let transferQuery = "";
  let transferStatusFilter: TransferStatusFilter = "all";
  let visibleTransferLimit = 24;
  const transferPageSize = 24;
  let securityDeviceQuery = "";
  let visibleSecurityDeviceLimit = 25;
  const securityDevicePageSize = 25;
  let networkDiagnosticsRefreshing = false;
  let storageRefreshing = false;
  let avatarFileInput: HTMLInputElement | null = null;
  let avatarSourceImage = "";
  let avatarCropPreview = "";
  let avatarCropZoom = 1;
  let avatarCropX = 50;
  let avatarCropY = 50;

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

  function readImageFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("头像图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("头像图片加载失败"));
      image.src = src;
    });
  }

  async function renderAvatarCrop() {
    if (!avatarSourceImage) return;
    const image = await loadImage(avatarSourceImage);
    const canvas = document.createElement("canvas");
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    const zoom = Math.max(1, Math.min(3, avatarCropZoom));
    const sourceSize = Math.max(1, Math.min(image.naturalWidth, image.naturalHeight) / zoom);
    const maxX = Math.max(0, image.naturalWidth - sourceSize);
    const maxY = Math.max(0, image.naturalHeight - sourceSize);
    context.clearRect(0, 0, size, size);
    context.drawImage(
      image,
      maxX * (avatarCropX / 100),
      maxY * (avatarCropY / 100),
      sourceSize,
      sourceSize,
      0,
      0,
      size,
      size
    );
    avatarCropPreview = canvas.toDataURL("image/png");
  }

  async function chooseAvatarFile(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    avatarSourceImage = await readImageFile(file);
    avatarCropZoom = 1;
    avatarCropX = 50;
    avatarCropY = 50;
    avatarCropPreview = "";
    await renderAvatarCrop();
  }

  function updateAvatarCrop(kind: "zoom" | "x" | "y", value: string) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    if (kind === "zoom") avatarCropZoom = next;
    if (kind === "x") avatarCropX = next;
    if (kind === "y") avatarCropY = next;
    void renderAvatarCrop();
  }

  function clearAvatarImage() {
    avatarSourceImage = "";
    avatarCropPreview = "";
    if (avatarFileInput) avatarFileInput.value = "";
    onAvatarImageChange("");
  }

  function closeAvatarCrop() {
    avatarSourceImage = "";
    avatarCropPreview = "";
    if (avatarFileInput) avatarFileInput.value = "";
  }

  function applyAvatarCrop() {
    if (!avatarCropPreview) return;
    onAvatarImageChange(avatarCropPreview);
    closeAvatarCrop();
  }

  function handleAvatarCropKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeAvatarCrop();
  }

  async function savePersonalProfile() {
    const profileSaved = await onSaveProfile();
    if (profileSaved === false) return;
    await onSaveProfileExtras();
  }

  function openSettingsCategory(tab: SettingsTab) {
    settingsTab = tab;
    onOpenSettingsTab(tab);
  }

  function handleSettingsNavigation(event: KeyboardEvent, currentIndex: number) {
    const lastIndex = settingsTabs.length - 1;
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = Math.min(currentIndex + 1, lastIndex);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = Math.max(currentIndex - 1, 0);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;
    else return;

    event.preventDefault();
    const nextTab = settingsTabs[nextIndex];
    openSettingsCategory(nextTab.id);
    const navigation = (event.currentTarget as HTMLButtonElement).closest(".settings-nav");
    window.setTimeout(() => {
      navigation?.querySelector<HTMLButtonElement>(`[data-settings-tab="${nextTab.id}"]`)?.focus();
    }, 0);
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

  function updateTransferQuery(value: string) {
    transferQuery = value;
    visibleTransferLimit = transferPageSize;
  }

  function updateTransferStatusFilter(value: TransferStatusFilter) {
    transferStatusFilter = value;
    visibleTransferLimit = transferPageSize;
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
      "iim 网络诊断",
      `自动发现：${settings.auto_discovery ? "开启" : "关闭"}`,
      `局域网广播：${settings.multicast ? "开启" : "关闭"}`,
      `发现设备：${discoveredPeerCount}`,
      `可联系设备：${onlinePeerCount}`,
      `发现间隔：${settings.discovery_interval_secs}s`,
      `离线判定：${settings.peer_ttl_secs}s`,
      `QUIC 监听端口：${transportConfig.listen_port}`,
      `QUIC 心跳：${transportConfig.heartbeat_secs}s`,
      `空闲超时：${transportConfig.max_idle_timeout_secs}s`,
      `outbox 重试：${Math.round(transportConfig.outbox.retry_after_millis / 1000)}s / ${Math.min(transportConfig.outbox.max_attempts, 3)} 次 / 每批 ${transportConfig.outbox.batch_limit}`,
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
      "iim 存储诊断",
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
      "iim 传输诊断",
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

  function endpointIp(endpoint: string) {
    const value = endpoint.trim();
    if (!value) return "";
    if (value.startsWith("[")) return value.slice(1, value.indexOf("]") > 0 ? value.indexOf("]") : undefined);
    const colonCount = (value.match(/:/g) ?? []).length;
    return colonCount === 1 ? value.slice(0, value.lastIndexOf(":")) : value;
  }

  function buildSecurityDevices(peerList: PeerProfile[], trustedList: TrustedPeer[]): SecurityDeviceItem[] {
    const trustByPeerId = new Map(trustedList.map((record) => [record.peer_id, record]));
    const items = peerList.map((peer) => ({
      peerId: peer.peer_id,
      peer,
      trusted: trustByPeerId.get(peer.peer_id) ?? null,
      label: peerLabel(peer),
      hostname: peer.hostname || "未知主机",
      ip: endpointIp(peer.endpoints[0] ?? ""),
      fingerprint: peer.fingerprint
    }));
    const discoveredIds = new Set(peerList.map((peer) => peer.peer_id));
    for (const record of trustedList) {
      if (discoveredIds.has(record.peer_id)) continue;
      items.push({
        peerId: record.peer_id,
        peer: null,
        trusted: record,
        label: trustedPeerLabel(record, peerList),
        hostname: "当前未发现",
        ip: "",
        fingerprint: record.fingerprint
      });
    }
    return items;
  }

  function securityDeviceSearchText(item: SecurityDeviceItem) {
    return [item.peerId, item.label, item.hostname, item.ip, item.fingerprint, item.peer?.display_name, item.peer ? metadataFor(item.peer).remark : ""]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function loadMoreSecurityDevices() {
    visibleSecurityDeviceLimit = Math.min(filteredSecurityDevices.length, visibleSecurityDeviceLimit + securityDevicePageSize);
  }

  function handleSecurityListScroll(event: Event) {
    const element = event.currentTarget as HTMLElement;
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 40) return;
    loadMoreSecurityDevices();
  }

  async function refreshSecurityDevices() {
    await Promise.all([Promise.resolve(onRefreshPeers()), Promise.resolve(onRefreshTrustedPeers())]);
  }

  function trustedPeerAuditReport(record: TrustedPeer, peerList = peers) {
    const peer = peerList.find((item) => item.peer_id === record.peer_id);
    const lines = [
      "iim 信任记录",
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
      "iim 联系人记录",
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

  function matchesContactFilter(peer: PeerProfile, filter: ContactFilter) {
    const metadata = metadataFor(peer);
    if (filter === "online") return peer.status === "online" && !metadata.blocked;
    if (filter === "favorite") return metadata.favorite && !metadata.blocked;
    if (filter === "blocked") return metadata.blocked;
    return true;
  }

  function contactSearchText(peer: PeerProfile) {
    const metadata = metadataFor(peer);
    return [
      metadata.remark,
      peer.display_name,
      peer.hostname,
      peer.peer_id,
      peer.endpoints.join(" "),
      peer.status === "online" ? "在线 可联系 online" : "离线 暂不可达 offline"
    ].join(" ").toLocaleLowerCase();
  }

  function contactListTitle(peer: PeerProfile) {
    return metadataFor(peer).remark.trim() || peer.hostname || peer.display_name || peer.peer_id;
  }

  function contactEndpoint(peer: PeerProfile) {
    return peer.endpoints[0]?.replace(/:\d+$/, "") || "等待 IP";
  }

  function openContactContext(peer: PeerProfile, event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea")) return;
    focusedContactId = peer.peer_id;
    onContactContext(peer, event);
  }

  async function refreshNetworkDiagnostics() {
    if (networkDiagnosticsRefreshing || refreshingPeers) return;
    networkDiagnosticsRefreshing = true;
    try {
      await Promise.all([
        Promise.resolve(onRefreshPeers()),
        new Promise<void>((resolve) => window.setTimeout(resolve, 720))
      ]);
    } finally {
      networkDiagnosticsRefreshing = false;
    }
  }

  async function refreshStorageOverview() {
    if (storageRefreshing) return;
    storageRefreshing = true;
    try {
      await Promise.all([
        Promise.resolve(onRefreshStorage()),
        new Promise<void>((resolve) => window.setTimeout(resolve, 720))
      ]);
    } finally {
      storageRefreshing = false;
    }
  }

  $: contactNeedle = contactQuery.trim().toLocaleLowerCase();
  $: filteredPeers = peers.filter((peer) => matchesContactFilter(peer, contactFilter) && (!contactNeedle || contactSearchText(peer).includes(contactNeedle))).sort((a, b) => {
    const aMeta = metadataFor(a);
    const bMeta = metadataFor(b);
    return (
      Number(bMeta.favorite) - Number(aMeta.favorite) ||
      aMeta.group_name.localeCompare(bMeta.group_name, "zh-CN") ||
      peerLabel(a).localeCompare(peerLabel(b), "zh-CN")
    );
  });
  $: visiblePeers = filteredPeers.slice(0, visibleContactLimit);
  $: workspaceSection = section === "notifications"
    ? "settings"
    : section === "files" || section === "settings"
      ? section
      : "contacts";
  $: hasContactFilters = contactFilter !== "all" || Boolean(contactNeedle);
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
  $: profileEndpointLabel = endpointIp(self?.endpoints[0] ?? "") || "等待 IP";
  $: trimmedProfileSignature = profileSignature.trim();
  $: profileAvatarSource = avatarLabel.trim() || profileDisplayName.trim();
  $: profileAvatarInitial = Array.from(profileAvatarSource).slice(0, 2).join("") || "我";
  $: storageCacheBytes = storageOverview ? storageOverview.received_bytes + storageOverview.staged_bytes : 0;
  $: activeTransferTasks = transferTasks.filter(isActiveTransfer);
  $: historyTransferTasks = transferTasks.filter((task) => !isActiveTransfer(task));
  $: filteredTransferTasks = transferTasks.filter((task) => matchesTransferFilters(task, transferQuery, transferStatusFilter));
  $: filteredActiveTransferTasks = filteredTransferTasks.filter(isActiveTransfer);
  $: filteredHistoryTransferTasks = filteredTransferTasks.filter((task) => !isActiveTransfer(task));
  $: sortedTransferTasks = [...filteredTransferTasks].sort((a, b) => Number(isActiveTransfer(b)) - Number(isActiveTransfer(a)));
  $: visibleTransferTasks = sortedTransferTasks.slice(0, visibleTransferLimit);
  $: hasTransferFilters = transferQuery.trim().length > 0 || transferStatusFilter !== "all";
  $: securityDevices = buildSecurityDevices(peers, trustedPeers);
  $: securityDeviceNeedle = securityDeviceQuery.trim().toLowerCase();
  $: filteredSecurityDevices = securityDeviceNeedle
    ? securityDevices.filter((item) => securityDeviceSearchText(item).includes(securityDeviceNeedle))
    : securityDevices;
  $: visibleSecurityDevices = filteredSecurityDevices.slice(0, visibleSecurityDeviceLimit);
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

<section class:contacts-workspace={workspaceSection === "contacts"} class="workspace-panel" aria-label="功能工作区">
  {#if workspaceSection === "contacts"}
    <header class="workspace-head address-book-head">
      <div>
        <h1>联系人</h1>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <label class="contacts-search-box">
        <Search size={15} />
        <input
          type="search"
          aria-label="搜索联系人"
          autocomplete="off"
          placeholder="搜索备注、主机名、IP 或状态"
          value={contactQuery}
          on:input={(event) => {
            contactQuery = (event.currentTarget as HTMLInputElement).value;
            visibleContactLimit = contactPageSize;
          }}
        />
        {#if contactQuery}
          <button type="button" aria-label="清空联系人搜索" title="清空" on:click={() => (contactQuery = "")}>
            <X size={14} />
          </button>
        {/if}
      </label>
      <div class="workspace-head-actions">
        <button
          class:loading={refreshingPeers}
          class="icon-button refresh-action"
          type="button"
          aria-label="刷新联系人"
          title="刷新联系人"
          aria-busy={refreshingPeers}
          disabled={refreshingPeers}
          on:click={onRefreshPeers}
        >
          <RefreshCw size={15} />
        </button>
        <button class="icon-button" type="button" aria-label="创建群聊" title="创建群聊" on:click={onCreateGroup}>
          <Users size={15} />
        </button>
      </div>
    </header>
	    <div class:empty={visiblePeers.length === 0} class="address-book-layout">
	      <div class="address-directory">
	        <div class="directory-summary" aria-label="联系人概览">
	          <span>{visiblePeers.length} 位联系人</span>
	          <span>{reachablePeers.length} 可联系</span>
	          {#if hasContactFilters}<span>已筛选</span>{/if}
	        </div>
	        <div class="directory-filter" role="tablist" aria-label="联系人筛选">
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
              <button
                class:loading={refreshingPeers}
                class="row-action refresh-action"
                type="button"
                aria-busy={refreshingPeers}
                disabled={refreshingPeers}
                on:click={onRefreshPeers}
              >
                <RefreshCw size={13} />
                {refreshingPeers ? "刷新中" : "刷新"}
              </button>
              <button class="row-action" type="button" on:click={() => onOpenSettingsTab("network")}>
                <Network size={13} />
                网络
              </button>
	            </div>
	          </div>
	        {/if}
	
	        {#if visiblePeers.length > 0}
	          <section class="directory-list-section" aria-label="发现设备列表">
	            <header class="directory-list-head">
	              <strong>{filteredPeers.length} 位联系人</strong>
	            </header>
	            <div class="directory-list" role="list">
	              {#each visiblePeers as peer (peer.peer_id)}
	                <article
	                  class:active={focusedContact?.peer_id === peer.peer_id}
	                  class:blocked={metadataFor(peer).blocked}
	                  class="directory-contact-row"
	                  role="listitem"
	                  on:contextmenu={(event) => openContactContext(peer, event)}
	                >
	                  <span
	                    class:online={peer.status === "online"}
	                    class:offline={peer.status !== "online"}
	                    class="directory-contact-avatar"
	                    aria-label={peerPresenceLabel(peer)}
	                    title={statusLabel(peer.status)}
	                  >
	                    <UserAvatar name={contactListTitle(peer)} seed={peer.peer_id} status={peer.status} size={42} />
	                  </span>
	                  <div class="directory-contact-main">
	                    <button class="directory-contact-select" type="button" on:click={() => (focusedContactId = peer.peer_id)}>
	                      <strong>{contactListTitle(peer)}</strong>
	                      <small>
	                        <span>{contactEndpoint(peer)}</span>
	                        {#if peer.display_name && peer.display_name !== contactListTitle(peer)}
	                          <span class="contact-secondary-name">{peer.display_name}</span>
	                        {/if}
	                        {#if metadataFor(peer).blocked}
	                          · 已阻止
	                        {/if}
	                      </small>
	                    </button>
	                  </div>
	                  <div class="directory-contact-actions">
	                    <button
	                      class="directory-message-action"
	                      type="button"
	                      aria-label={`和 ${peerLabel(peer)} 聊天`}
	                      title="发消息"
	                      disabled={metadataFor(peer).blocked}
	                      on:click={() => onSelectConversation(`direct:${peer.peer_id}`)}
	                    >
	                      <MessageSquareText size={15} />
	                    </button>
	                  </div>
	                </article>
	              {/each}
	              {#if visiblePeers.length < filteredPeers.length}
	                <button class="list-load-more directory-load-more" type="button" on:click={() => (visibleContactLimit += contactPageSize)}>
	                  <ChevronDown size={14} />
	                  加载更多联系人
	                </button>
	              {/if}
	            </div>
	          </section>
	        {/if}
	      </div>

      <section class="contact-detail-pane" aria-label="联系人资料">
        {#if focusedContact}
          <div class="contact-profile-head">
            <span
              class:online={focusedContact.status === "online"}
              class:offline={focusedContact.status !== "online"}
              class="contact-profile-avatar"
              aria-label={peerPresenceLabel(focusedContact)}
              title={statusLabel(focusedContact.status)}
            >
              <UserAvatar name={peerLabel(focusedContact)} seed={focusedContact.peer_id} status={focusedContact.status} size={54} />
            </span>
            <div>
              <h2>{peerLabel(focusedContact)}</h2>
              <p>{metadataFor(focusedContact).remark ? focusedContact.display_name : focusedContact.hostname}</p>
            </div>
          </div>
          <div class="contact-profile-editor" aria-label="编辑联系人资料">
            <label class="field">
              <span>备注</span>
              <input
                value={metadataFor(focusedContact).remark}
                placeholder={focusedContact.display_name}
                on:input={(event) =>
                  onContactMetadataChange(focusedContact.peer_id, { remark: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
            <label class="field">
              <span>分组</span>
              <input
                value={metadataFor(focusedContact).group_name}
                placeholder="默认分组"
                on:input={(event) =>
                  onContactMetadataChange(focusedContact.peer_id, { group_name: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
          </div>
          <details class="contact-profile-technical">
            <summary>
              <span>
                <strong>设备与安全信息</strong>
                <small>主机、端点和身份指纹</small>
              </span>
            </summary>
            <dl class="contact-profile-meta">
              <div>
                <dt>安全状态</dt>
                <dd>{metadataFor(focusedContact).blocked ? "已阻止" : "允许通信"}</dd>
              </div>
              <div>
                <dt>主机名</dt>
                <dd>{focusedContact.hostname}</dd>
              </div>
              <div>
                <dt>IP 地址</dt>
                <dd class="identity-value-row">
                  <span>{focusedContact.endpoints.map(endpointIp).filter(Boolean).join("、") || "等待发现"}</span>
                  {#if focusedContact.endpoints.length > 0}
                    <button
                      type="button"
                      aria-label="复制联系人 IP 地址"
                      title="复制联系人 IP 地址"
                      on:click={() => onCopyIdentityValue(focusedContact.endpoints.map(endpointIp).filter(Boolean).join("\n"), "联系人 IP 地址")}
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
            <button
              class="contact-technical-copy"
              type="button"
              aria-label="复制设备记录"
              on:click={() => onCopyIdentityValue(contactAuditReport(focusedContact), `${peerLabel(focusedContact)} 联系人记录`)}
            >
              <Copy size={14} />
              复制设备记录
            </button>
          </details>
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
  {:else if workspaceSection === "files"}
    <header class="workspace-head files-page-head">
      <div>
        <h1>传输任务</h1>
        {#if statusText}
          <p class="hint">{statusText}</p>
        {/if}
      </div>
      <div class="workspace-head-actions">
        <button class="tool-button" type="button" title="打开接收目录" aria-label="打开接收目录" on:click={() => onOpenStorage("received")}>
          <HardDrive size={15} />
          接收目录
        </button>
        <button class="tool-button" type="button" title="清理已完成任务" aria-label="清理已完成" on:click={onClearCompletedTransfers}>
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
            on:input={(event) => updateTransferQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="transfer-filter-tabs" role="tablist" aria-label="传输状态筛选">
          {#each transferStatusFilters as item}
            <button
              class:active={transferStatusFilter === item.id}
              type="button"
              role="tab"
              aria-selected={transferStatusFilter === item.id}
              on:click={() => updateTransferStatusFilter(item.id)}
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
                <small title={task.id}>{task.files.length} 个文件 · {formatBytes(task.sentBytes)} / {formatBytes(task.totalBytes)}</small>
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
                    visibleTransferLimit = transferPageSize;
                  }}>
                    <RefreshCw size={13} />
                    清空筛选
                  </button>
                </div>
              {/if}
            </div>
          {/each}
          {#if visibleTransferTasks.length < sortedTransferTasks.length}
            <button class="list-load-more transfer-load-more" type="button" on:click={() => (visibleTransferLimit += transferPageSize)}>
              <ChevronDown size={14} />
              加载更多传输记录
            </button>
          {/if}
        </div>
      </section>
    </div>
  {:else}
    <header class="workspace-head settings-page-head">
      <div>
        <h1>设置</h1>
      </div>
    </header>

    <div class="settings-shell">
      <nav class="settings-nav" aria-label="设置分类">
        {#each settingsTabs as item, index}
          <button
            class:active={settingsTab === item.id}
            type="button"
            data-settings-tab={item.id}
            aria-current={settingsTab === item.id ? "page" : undefined}
            on:click={() => openSettingsCategory(item.id)}
            on:keydown={(event) => handleSettingsNavigation(event, index)}
          >
            <svelte:component this={item.icon} size={15} />
            {item.label}
          </button>
        {/each}
      </nav>

      <div class="settings-section">
        {#if settingsTab === "profile"}
          <section class="settings-profile-hero" aria-label="个人名片">
            <div class="profile-avatar-button" aria-label="头像">
              {#if avatarImage}
                <img src={avatarImage} alt="当前头像" />
              {:else}
                <span>{profileAvatarInitial}</span>
              {/if}
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
          <section class="settings-action-panel profile-editor-panel" aria-label="编辑个人信息">
            <header>
              <strong>个人信息</strong>
              <span>修改头像、显示名称和签名，保存后会随下一次局域网发现同步。</span>
            </header>
            <div class="profile-editor-layout">
              <section class="avatar-editor" aria-label="头像设置">
                <div class="avatar-preview large">
                  {#if avatarImage}
                    <img src={avatarImage} alt="头像裁剪预览" />
                  {:else}
                    <span>{profileAvatarInitial}</span>
                  {/if}
                </div>
                <div class="avatar-editor-controls">
                  <strong>头像</strong>
                  <small>选择图片后可调整缩放和显示位置。</small>
                  <input
                    bind:this={avatarFileInput}
                    class="visually-hidden"
                    type="file"
                    accept="image/*"
                    aria-label="选择头像图片"
                    on:change={(event) => void chooseAvatarFile((event.currentTarget as HTMLInputElement).files)}
                  />
                  <div class="avatar-editor-actions">
                    <button class="secondary-action" type="button" on:click={() => avatarFileInput?.click()}>
                      <UploadCloud size={14} />
                      上传头像
                    </button>
                    <button class="secondary-action" type="button" disabled={!avatarImage} on:click={clearAvatarImage}>
                      <Trash2 size={14} />
                      移除图片
                    </button>
                  </div>
                </div>
              </section>
              <div class="profile-editor-fields">
                <label class="field">
                  <span>显示名称</span>
                  <input value={profileName} placeholder={self?.display_name ?? "本机用户"} on:input={(event) => onProfileNameChange((event.currentTarget as HTMLInputElement).value)} />
                </label>
                <label class="field">
                  <span>主机备注</span>
                  <input value={profileHostname} placeholder={self?.hostname ?? "windows-pc"} on:input={(event) => onProfileHostnameChange((event.currentTarget as HTMLInputElement).value)} />
                </label>
                <label class="field profile-signature-field">
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
                    placeholder="我"
                    on:input={(event) => onAvatarLabelChange((event.currentTarget as HTMLInputElement).value)}
                  />
                </label>
              </div>
            </div>
            <div class="settings-action-bar">
              <button class="primary-action settings-primary-action" type="button" on:click={savePersonalProfile}>
                <Save size={15} />
                保存个人信息
              </button>
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
                <dd>{Math.min(transportConfig.outbox.max_attempts, 3)} 次</dd>
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
	                  class:loading={networkDiagnosticsRefreshing || refreshingPeers}
	                  class="section-compact-action diagnostic-refresh-action"
	                  type="button"
	                  aria-label="刷新诊断"
	                  aria-busy={networkDiagnosticsRefreshing || refreshingPeers}
	                  disabled={networkDiagnosticsRefreshing || refreshingPeers}
	                  on:click={refreshNetworkDiagnostics}
	                >
	                  <RefreshCw size={12} />
	                  {networkDiagnosticsRefreshing || refreshingPeers ? "刷新中" : "刷新诊断"}
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
	              <button
                    class:loading={storageRefreshing}
                    class="action-card refresh-action"
                    type="button"
                    aria-label="刷新存储信息"
                    aria-busy={storageRefreshing}
                    disabled={storageRefreshing}
                    on:click={refreshStorageOverview}
                  >
	                <RefreshCw size={16} />
	                <span>
	                  <strong>{storageRefreshing ? "正在刷新" : "刷新存储信息"}</strong>
	                  <small>{storageRefreshing ? "正在重新读取本地占用" : "重新读取数据库、缓存和目录占用"}</small>
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
            <div class="security-policy-options" role="radiogroup" aria-label="通信权限策略">
              <button
                class:active={!requireContactForMessaging}
                type="button"
                role="radio"
                aria-label="无需加好友"
	                aria-checked={!requireContactForMessaging}
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
                role="radio"
                aria-label="仅联系人可通信"
	                aria-checked={requireContactForMessaging}
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
	          <section class="trusted-device-section security-device-section" aria-label="设备指纹">
	            <header>
	              <div>
	                <strong>设备指纹</strong>
	                <span>发现状态与信任状态合并显示，滚动到底加载更多。</span>
	              </div>
	              <div class="security-section-meta">
	                <span>{visibleSecurityDevices.length} / {filteredSecurityDevices.length} 台 · 已信任 {trustedPeers.length}</span>
	                <button class="icon-button" type="button" aria-label="刷新设备指纹" title="刷新" on:click={refreshSecurityDevices}>
	                  <RefreshCw size={14} />
	                </button>
	              </div>
	            </header>
	            <label class="search-box security-device-search">
	              <Search size={15} />
	              <input
	                value={securityDeviceQuery}
	                aria-label="搜索设备指纹"
	                placeholder="搜索名称、主机、IP、设备 ID 或指纹"
	                on:input={(event) => {
	                  securityDeviceQuery = (event.currentTarget as HTMLInputElement).value;
	                  visibleSecurityDeviceLimit = securityDevicePageSize;
	                }}
	              />
	              {#if securityDeviceQuery}
	                <button type="button" aria-label="清空设备指纹搜索" title="清空" on:click={() => {
	                  securityDeviceQuery = "";
	                  visibleSecurityDeviceLimit = securityDevicePageSize;
	                }}><X size={13} /></button>
	              {/if}
	            </label>
	            <div class="data-grid compact security-scroll-list" aria-label="设备指纹列表" on:scroll={handleSecurityListScroll}>
	              {#each visibleSecurityDevices as item (item.peerId)}
	                <article class:trusted={Boolean(item.trusted)} class:mismatch={Boolean(item.trusted && item.peer && item.trusted.fingerprint !== item.peer.fingerprint)} class="data-row security-row unified-security-row">
	                  <ShieldCheck size={16} />
	                  <div>
	                    <strong>{item.label}</strong>
	                    <small>{item.hostname}{item.ip ? ` · ${item.ip}` : ""}</small>
	                    <small title={item.fingerprint}>{item.fingerprint}</small>
	                  </div>
	                  <div class="unified-security-actions">
	                    <span class:danger={Boolean(item.trusted && item.peer && item.trusted.fingerprint !== item.peer.fingerprint)} class="security-trust-state">
	                      {item.trusted
	                        ? item.peer && item.trusted.fingerprint !== item.peer.fingerprint ? "指纹异常" : "已信任"
	                        : "未信任"}
	                    </span>
	                    {#if item.trusted}
	                      <button class="icon-button danger" type="button" aria-label={`移除 ${item.label} 信任`} title="移除信任" on:click={() => onRemoveTrustedPeer(item.peerId)}>
	                        <Trash2 size={14} />
	                      </button>
	                    {:else if item.peer}
	                      <button class="section-compact-action" type="button" on:click={() => onTrustPeer(item.peer)}>
	                        <ShieldCheck size={12} />
	                        信任
	                      </button>
	                    {/if}
	                  </div>
	                </article>
	              {:else}
	                <p class="empty-note compact">{securityDeviceNeedle ? "没有匹配的设备。" : "暂无发现或已信任设备。"}</p>
	              {/each}
	              {#if visibleSecurityDevices.length < filteredSecurityDevices.length}
	                <button class="security-load-more" type="button" on:click={loadMoreSecurityDevices}>
	                  <ChevronDown size={14} />
	                  继续加载 {Math.min(securityDevicePageSize, filteredSecurityDevices.length - visibleSecurityDevices.length)} 台
	                </button>
	              {/if}
	            </div>
	          </section>
          {#if trustStatus}
            <p class="hint">{trustStatus}</p>
          {/if}
        {:else}
          <section class="settings-action-panel settings-command-panel settings-preference-panel notification-preference-panel" aria-label="提醒与隐私">
            <header class="settings-panel-heading">
              <div>
                <strong>提醒与隐私</strong>
                <span>{notificationReady ? "系统通知已授权" : "系统通知尚未授权"}</span>
              </div>
              <button class="section-compact-action" type="button" aria-label={notificationReady ? "重新检查系统通知" : "开启系统通知"} on:click={onEnableNotifications}>
                <Bell size={13} />
                {notificationReady ? "检查通知" : "开启通知"}
              </button>
            </header>
            <div class="settings-action-grid preference-list">
              <button class:enabled={showNotificationPreview} class="preference-toggle" type="button" role="switch" aria-checked={showNotificationPreview} aria-label="通知预览" disabled={privacyMode} on:click={onToggleNotificationPreview}>
                <Bell size={16} />
                <span>
                  <strong>通知预览</strong>
                  <small>{privacyMode ? "由隐私模式关闭" : showNotificationPreview ? "显示消息摘要" : "隐藏消息摘要"}</small>
                </span>
              </button>
              <button class:enabled={privacyMode} class="preference-toggle" type="button" role="switch" aria-checked={privacyMode} aria-label="隐私模式" on:click={onTogglePrivacyMode}>
                <ShieldCheck size={16} />
                <span>
                  <strong>隐私模式</strong>
                  <small>{privacyMode ? "通知与锁屏场景隐藏内容" : "可显示常规消息摘要"}</small>
                </span>
              </button>
            </div>
          </section>
          <section class="settings-action-panel settings-command-panel settings-preference-panel window-preference-panel" aria-label="窗口与外观">
            <header class="settings-panel-heading">
              <div>
                <strong>窗口与外观</strong>
                <span>{closeToTray ? "关闭后继续在托盘运行" : "关闭按钮直接退出窗口"}</span>
              </div>
              <button class="section-compact-action" type="button" aria-label="最小化到托盘" on:click={onMinimizeToTray}>
                <Minimize2 size={13} />
                最小化
              </button>
            </header>
            <div class="settings-action-grid preference-list">
              <button class:enabled={closeToTray} class="preference-toggle" type="button" role="switch" aria-checked={closeToTray} aria-label="关闭时隐藏到托盘" on:click={onToggleCloseToTray}>
                <Minimize2 size={16} />
                <span>
                  <strong>关闭按钮</strong>
                  <small>{closeToTray ? "隐藏到托盘" : "关闭窗口"}</small>
                </span>
              </button>
              <button class:enabled={dark} class="preference-toggle" type="button" role="switch" aria-checked={dark} aria-label="深色主题" on:click={onToggleTheme}>
                <Palette size={16} />
                <span>
                  <strong>主题</strong>
                  <small>{dark ? "深色工作台" : "浅色工作台"}</small>
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
              <button class:enabled={loginEnabled} class="preference-toggle login-toggle" type="button" role="switch" aria-checked={loginEnabled} aria-label="登录密码" on:click={() => onLoginEnabledChange(!loginEnabled)}>
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

  {#if avatarSourceImage}
    <div class="modal-backdrop avatar-crop-backdrop" role="presentation" on:click={closeAvatarCrop}>
      <div
        class="avatar-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="调整头像"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown={handleAvatarCropKeydown}
      >
        <header>
          <div>
            <h2>调整头像</h2>
            <span>移动和缩放图片，选择头像显示范围</span>
          </div>
          <button class="icon-button" type="button" title="关闭" aria-label="关闭" on:click={closeAvatarCrop}>
            <X size={15} />
          </button>
        </header>
        <div class="avatar-crop-content">
          <div class="avatar-crop-stage" aria-label="头像预览">
            <img src={avatarCropPreview || avatarSourceImage} alt="待应用头像预览" />
            <span aria-hidden="true"></span>
          </div>
          <div class="avatar-crop-controls" aria-label="头像裁剪范围">
            <label>
              <span>缩放</span>
              <input aria-label="缩放" type="range" min="1" max="3" step="0.05" value={avatarCropZoom} on:input={(event) => updateAvatarCrop("zoom", (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label>
              <span>左右位置</span>
              <input aria-label="左右位置" type="range" min="0" max="100" value={avatarCropX} on:input={(event) => updateAvatarCrop("x", (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label>
              <span>上下位置</span>
              <input aria-label="上下位置" type="range" min="0" max="100" value={avatarCropY} on:input={(event) => updateAvatarCrop("y", (event.currentTarget as HTMLInputElement).value)} />
            </label>
          </div>
        </div>
        <footer class="avatar-crop-actions">
          <button class="row-action" type="button" on:click={closeAvatarCrop}>取消</button>
          <button class="row-action primary" type="button" disabled={!avatarCropPreview} on:click={applyAvatarCrop}>应用头像</button>
        </footer>
      </div>
    </div>
  {/if}
</section>
