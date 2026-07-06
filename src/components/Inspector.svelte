<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import Archive from "lucide-svelte/icons/archive";
  import Ban from "lucide-svelte/icons/ban";
  import Bell from "lucide-svelte/icons/bell";
  import BellOff from "lucide-svelte/icons/bell-off";
  import CheckCircle2 from "lucide-svelte/icons/check-circle-2";
  import Copy from "lucide-svelte/icons/copy";
  import Database from "lucide-svelte/icons/database";
  import Download from "lucide-svelte/icons/download";
  import HardDrive from "lucide-svelte/icons/hard-drive";
  import Image from "lucide-svelte/icons/image";
  import MessageCircle from "lucide-svelte/icons/message-circle";
  import Moon from "lucide-svelte/icons/moon";
  import Network from "lucide-svelte/icons/network";
  import Pin from "lucide-svelte/icons/pin";
  import PinOff from "lucide-svelte/icons/pin-off";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Save from "lucide-svelte/icons/save";
  import Search from "lucide-svelte/icons/search";
  import ShieldCheck from "lucide-svelte/icons/shield-check";
  import Star from "lucide-svelte/icons/star";
  import Sun from "lucide-svelte/icons/sun";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UploadCloud from "lucide-svelte/icons/upload-cloud";
  import UserMinus from "lucide-svelte/icons/user-minus";
  import UserPlus from "lucide-svelte/icons/user-plus";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import type { ChatMessage, ContactMetadata, ConversationSummary, NetworkSettings, PeerProfile, StorageOverview, TransferTask } from "../api";

  type InspectorTab = "details" | "transfers" | "network" | "security" | "members" | "storage";

  export let tab: InspectorTab = "details";
  export let conversation: ConversationSummary | null = null;
  export let settings: NetworkSettings;
  export let activePeer: PeerProfile | null = null;
  export let messages: ChatMessage[] = [];
  export let selfPeerId = "";
  export let contactMetadata: Record<string, ContactMetadata> = {};
  export let peers: PeerProfile[] = [];
  export let allPeers: PeerProfile[] = [];
  export let isGroup = false;
  export let groupNameDraft = "";
  export let groupAnnouncementDraft = "";
  export let groupMemberDraftIds: string[] = [];
  export let notificationReady = false;
  export let transferTasks: TransferTask[] = [];
  export let storageOverview: StorageOverview | null = null;
  export let networkWarning = "";
  export let networkWarnings: string[] = [];
  export let networkInputWarning = "";
  export let seedText = "";
  export let rangeText = "";
  export let discoveryIntervalText = "3";
  export let peerTtlText = "15";
  export let dark = false;
  export let trustStatus = "";
  export let statusText = "";
  export let onTabChange: (value: InspectorTab) => void = () => {};
  export let onToggleAutoDiscovery: () => void | Promise<void> = () => {};
  export let onToggleMulticast: () => void | Promise<void> = () => {};
  export let onSeedTextChange: (value: string) => void = () => {};
  export let onRangeTextChange: (value: string) => void = () => {};
  export let onDiscoveryIntervalTextChange: (value: string) => void = () => {};
  export let onPeerTtlTextChange: (value: string) => void = () => {};
  export let onSaveNetwork: () => void | Promise<void> = () => {};
  export let onCopyNetworkDiagnostics: (report: string) => void | Promise<void> = () => {};
  export let onEnableNotifications: () => void | Promise<void> = () => {};
  export let onToggleTheme: () => void = () => {};
  export let onTrustPeer: () => void | Promise<void> = () => {};
  export let onGroupNameChange: (value: string) => void = () => {};
  export let onGroupAnnouncementChange: (value: string) => void = () => {};
  export let onToggleGroupMember: (peerId: string) => void = () => {};
  export let onSaveGroup: () => void | Promise<void> = () => {};
  export let onExportConversation: () => void | Promise<void> = () => {};
  export let onTogglePin: () => void | Promise<void> = () => {};
  export let onToggleMute: () => void | Promise<void> = () => {};
  export let onToggleArchive: () => void | Promise<void> = () => {};
  export let onClearConversationMessages: () => void | Promise<void> = () => {};
  export let onDeleteConversation: () => void | Promise<void> = () => {};
  export let onOpenTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onDeleteTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onCancelTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onResumeTransfer: (transferId: string) => void | Promise<void> = () => {};
  export let onRefreshStorage: () => void | Promise<void> = () => {};
  export let onClearStagedFiles: () => void | Promise<void> = () => {};
  export let onOpenStorage: (kind: "data" | "received" | "staged") => void | Promise<void> = () => {};
  export let onCopyStoragePath: (path: string, label: string) => void | Promise<void> = () => {};
  export let onCopyStorageDiagnostics: (report: string) => void | Promise<void> = () => {};
  export let onCopyIdentityValue: (value: string, label: string) => void | Promise<void> = () => {};
  export let onOpenDirectConversation: (peerId: string) => void | Promise<void> = () => {};
  export let onContactMetadataChange: (peerId: string, patch: Partial<ContactMetadata>) => void = () => {};
  export let onSaveContactMetadata: (peerId: string) => void | Promise<void> = () => {};

  let memberQuery = "";
  let memberReachabilityFilter: "all" | "online" | "offline" = "all";
  let sharedImagePreview:
    | {
        name: string;
        path: string;
        size: number;
        transferId: string;
        senderId: string;
        createdAt: number;
      }
    | null = null;

  $: tabs = isGroup
    ? ([{ id: "members", label: "成员" }, { id: "transfers", label: "文件" }, { id: "network", label: "网络" }, { id: "storage", label: "存储" }, { id: "security", label: "安全" }] as const)
    : ([{ id: "details", label: "详情" }, { id: "transfers", label: "文件" }, { id: "network", label: "网络" }, { id: "storage", label: "存储" }, { id: "security", label: "安全" }] as const);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileName(path: string) {
    return path.split(/[\\/]/).filter(Boolean).pop() || path || "未命名文件";
  }

  function isImagePath(path: string) {
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(path.trim());
  }

  function formatFileTime(timestamp: number) {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function imageSrc(path: string) {
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  }

  function openSharedImagePreview(file: { name: string; path: string; size: number; transferId: string; senderId: string; createdAt: number }) {
    sharedImagePreview = file;
  }

  function closeSharedImagePreview() {
    sharedImagePreview = null;
  }

  function peerLabel(peer: PeerProfile) {
    return contactMetadata[peer.peer_id]?.remark || peer.display_name;
  }

  function peerBlocked(peer: PeerProfile) {
    return contactMetadata[peer.peer_id]?.blocked ?? false;
  }

  function metadataForPeer(peer: PeerProfile) {
    return contactMetadata[peer.peer_id] ?? { peer_id: peer.peer_id, remark: "", group_name: "", favorite: false, blocked: false };
  }

  function storagePathRows(overview: StorageOverview | null) {
    return [
      { label: "数据目录", value: overview?.data_dir ?? "", fallback: "等待加载", copyLabel: "数据目录路径" },
      { label: "加密数据库", value: overview?.database_path ?? "", fallback: "等待加载", copyLabel: "加密数据库路径" },
      { label: "密钥保护", value: overview?.database_key_protection ?? "", fallback: "等待加载", copyLabel: "" },
      { label: "密钥文件", value: overview?.database_key_path ?? "", fallback: "等待加载", copyLabel: "密钥文件路径" },
      { label: "接收目录", value: overview?.received_files_dir ?? "", fallback: "等待加载", copyLabel: "接收目录路径" },
      { label: "剪贴板暂存", value: overview?.staged_files_dir ?? "", fallback: "等待加载", copyLabel: "剪贴板暂存路径" }
    ];
  }

  function isFailedTransfer(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return normalized === "failed" || task.status === "失败";
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
      `失败任务：${failedTasks.length}`,
      `可续传失败：${resumableFailedTasks.length}`,
      `最近失败：${recentFailures || "无"}`
    ].join("\n");
  }

  function networkDiagnosticReport() {
    const knownPeers = allPeers.length > 0 ? allPeers : peers;
    const onlinePeers = knownPeers.filter((peer) => peer.status === "online").length;
    return [
      "灵犀内网通网络诊断",
      `自动发现：${settings.auto_discovery ? "开启" : "关闭"}`,
      `局域网广播：${settings.multicast ? "开启" : "关闭"}`,
      `发现设备：${knownPeers.length}`,
      `可联系设备：${onlinePeers}`,
      `种子节点：${settings.seed_peers.join(", ") || "无"}`,
      `扫描网段：${settings.scan_ranges.join(", ") || "无"}`,
      `发现间隔：${settings.discovery_interval_secs}s`,
      `离线判定：${settings.peer_ttl_secs}s`,
      `最近警告：${networkWarnings.join(" | ") || networkWarning || "无"}`,
      `当前输入告警：${networkInputWarning || "无"}`
    ].join("\n");
  }

  function conversationDiagnosticReport() {
    const messageCount = messages.length;
    const attachmentCount = messages.reduce((sum, message) => sum + message.attachments.length, 0);
    const attachmentFileCount = messages.reduce(
      (sum, message) =>
        sum + message.attachments.reduce((attachmentSum, attachment) => attachmentSum + attachment.manifest.files.length, 0),
      0
    );
    const failedTransfers = visibleTransferTasks.filter(isFailedTransfer);
    const activeTransfers = visibleTransferTasks.filter(isActiveTransfer);
    const failedMessages = messages.filter((message) => message.status === "failed").length;
    const retryingMessages = messages.filter((message) => ["queued", "sending"].includes(message.status)).length;
    const title = conversation?.title || groupNameDraft || activePeer?.display_name || "未选择会话";
    const conversationId = conversation?.id || activePeer?.peer_id || "未选择会话";
    const memberSummary = isGroup
      ? `成员 ${groupMemberTotalCount}，可联系 ${reachableGroupMemberCount}，暂不可达 ${unreachableGroupMemberCount}`
      : activePeer
        ? `${peerLabel(activePeer)} ${peerStatusLabel(activePeer)}，端点 ${activePeer.endpoints.join(", ") || "等待发现"}`
        : "无直连联系人";

    return [
      "灵犀内网通会话诊断",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      `会话：${title}`,
      `会话 ID：${conversationId}`,
      `类型：${isGroup ? "群聊" : "直连"}`,
      `成员/联系人：${memberSummary}`,
      `置顶：${conversation?.pinned ? "是" : "否"}`,
      `免打扰：${conversation?.muted ? "是" : "否"}`,
      `归档：${conversation?.archived ? "是" : "否"}`,
      `消息数量：${messageCount}`,
      `待发送/发送中消息：${retryingMessages}`,
      `失败消息：${failedMessages}`,
      `附件消息：${attachmentCount}`,
      `附件文件：${attachmentFileCount}`,
      `活跃传输：${activeTransfers.length}`,
      `失败传输：${failedTransfers.length}`,
      `最近网络警告：${networkWarnings.join(" | ") || networkWarning || "无"}`
    ].join("\n");
  }

  function peerStatusLabel(peer: PeerProfile | null) {
    return peer?.status === "online" ? "可联系" : "暂不可达";
  }

  function matchesMemberQuery(peer: PeerProfile, value = memberQuery) {
    const query = value.trim().toLowerCase();
    if (!query) return true;
    return [peerLabel(peer), peer.display_name, peer.hostname, peer.peer_id, peer.endpoints.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  function matchesMemberReachability(peer: PeerProfile, filter = memberReachabilityFilter) {
    if (filter === "online") return peer.status === "online";
    if (filter === "offline") return peer.status !== "online";
    return true;
  }

  function matchesUnresolvedMemberQuery(peerId: string, value = memberQuery) {
    const query = value.trim().toLowerCase();
    if (!query) return true;
    return ["未发现成员", "暂不可达", peerId].join(" ").toLowerCase().includes(query);
  }

  function matchesUnresolvedMemberReachability(filter = memberReachabilityFilter) {
    return filter !== "online";
  }

  function isActiveTransfer(task: TransferTask) {
    const normalized = task.status.toLowerCase();
    return !["delivered", "downloaded", "failed", "cancelled", "canceled", "已完成", "失败"].includes(normalized);
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

  function addReachableAvailableMembers() {
    for (const peer of reachableAvailableGroupPeers) {
      onToggleGroupMember(peer.peer_id);
    }
  }

  function removeUnreachableCurrentMembers() {
    for (const peer of unreachableRemovableGroupMembers) {
      onToggleGroupMember(peer.peer_id);
    }
    for (const peerId of unresolvedRemovableGroupMemberIds) {
      onToggleGroupMember(peerId);
    }
  }

  $: currentGroupMemberIds = new Set(peers.map((peer) => peer.peer_id));
  $: knownPeerIds = new Set([...peers, ...allPeers].map((peer) => peer.peer_id));
  $: unresolvedGroupMemberIds = groupMemberDraftIds.filter((peerId) => peerId !== selfPeerId && !knownPeerIds.has(peerId));
  $: draftGroupMemberIds = new Set(groupMemberDraftIds);
  $: pendingAddedMemberCount = groupMemberDraftIds.filter((peerId) => !currentGroupMemberIds.has(peerId) && knownPeerIds.has(peerId)).length;
  $: pendingRemovedMemberCount = peers.filter((peer) => peer.peer_id !== selfPeerId && !draftGroupMemberIds.has(peer.peer_id)).length;
  $: groupMemberTotalCount = peers.length + unresolvedGroupMemberIds.length;
  $: reachableGroupMemberCount = peers.filter((peer) => peer.status === "online").length;
  $: unreachableGroupMemberCount = groupMemberTotalCount - reachableGroupMemberCount;
  $: visibleCurrentGroupMembers = peers.filter((peer) => matchesMemberQuery(peer, memberQuery) && matchesMemberReachability(peer, memberReachabilityFilter));
  $: visibleUnresolvedGroupMemberIds = unresolvedGroupMemberIds.filter(
    (peerId) => matchesUnresolvedMemberQuery(peerId, memberQuery) && matchesUnresolvedMemberReachability(memberReachabilityFilter)
  );
  $: visibleAvailableGroupPeers = allPeers.filter(
    (peer) =>
      !peerBlocked(peer) &&
      !currentGroupMemberIds.has(peer.peer_id) &&
      matchesMemberQuery(peer, memberQuery) &&
      matchesMemberReachability(peer, memberReachabilityFilter)
  );
  $: reachableAvailableGroupPeers = allPeers.filter(
    (peer) =>
      peer.status === "online" &&
      !peerBlocked(peer) &&
      !currentGroupMemberIds.has(peer.peer_id) &&
      !draftGroupMemberIds.has(peer.peer_id)
  );
  $: unreachableRemovableGroupMembers = peers.filter(
    (peer) => peer.peer_id !== selfPeerId && peer.status !== "online" && draftGroupMemberIds.has(peer.peer_id)
  );
  $: unresolvedRemovableGroupMemberIds = unresolvedGroupMemberIds.filter((peerId) => draftGroupMemberIds.has(peerId));
  $: removableUnavailableMemberCount = unreachableRemovableGroupMembers.length + unresolvedRemovableGroupMemberIds.length;
  $: activePeerPresenceAriaLabel = `${activePeer ? peerLabel(activePeer) : "内网广播"} ${peerStatusLabel(activePeer)}状态`;
  $: visibleTransferTasks = conversation
    ? transferTasks.filter((task) => !task.conversationId || task.conversationId === conversation.id)
    : transferTasks;
  $: recentConversationFiles = messages
    .flatMap((message) =>
      message.attachments.flatMap((attachment) =>
        attachment.manifest.files.map((file, index) => ({
          key: `${message.id}:${attachment.manifest.transfer_id}:${index}`,
          name: file.relative_path || fileName(file.path),
          path: file.path,
          size: file.size,
          transferId: attachment.manifest.transfer_id,
          messageId: message.id,
          senderId: message.sender_id,
          createdAt: message.created_at
        }))
      )
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 5);
  $: recentConversationImages = recentConversationFiles.filter((file) => isImagePath(file.path)).slice(0, 6);
  $: recentConversationDocuments = recentConversationFiles.filter((file) => !isImagePath(file.path)).slice(0, 5);
  $: storageCacheBytes = storageOverview ? storageOverview.received_bytes + storageOverview.staged_bytes : 0;
</script>

<aside class="inspector" aria-label={isGroup ? "群成员与会话面板" : "会话详情面板"}>
  <div class="inspector-tabs" role="tablist">
    {#each tabs as item}
      <button class:active={tab === item.id} type="button" role="tab" on:click={() => onTabChange(item.id)}>
        {item.label}
      </button>
    {/each}
  </div>

  {#if tab === "members"}
    <section class="inspector-panel">
      <h2>群成员</h2>
      <div class="group-summary-card" aria-label="群资料摘要">
        <div>
          <strong>{groupNameDraft || conversation?.title || "内网群聊"}</strong>
          <span>群资料</span>
        </div>
        <dl>
          <div>
            <dt>当前</dt>
            <dd>{groupMemberTotalCount} 人</dd>
          </div>
          <div>
            <dt>可联系</dt>
            <dd>{reachableGroupMemberCount} 人</dd>
          </div>
          <div>
            <dt>同步</dt>
            <dd>本机 fanout</dd>
          </div>
          <div>
            <dt>待保存</dt>
            <dd>+{pendingAddedMemberCount} / -{pendingRemovedMemberCount}</dd>
          </div>
        </dl>
      </div>
      <label class="field">
        <span>群名称</span>
        <input
          value={groupNameDraft}
          placeholder="内网群聊"
          on:input={(event) => onGroupNameChange((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span>群公告</span>
        <textarea
          aria-label="群公告"
          rows="3"
          value={groupAnnouncementDraft}
          placeholder="填写发布窗口、值班规则或群内约定"
          on:input={(event) => onGroupAnnouncementChange((event.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </label>
      <div class="group-editor">
        <div class="group-editor-head">
          <div>
            <strong>成员编辑</strong>
            <small>{groupMemberDraftIds.length} 名远端成员</small>
          </div>
          <div class="group-editor-actions">
            <button type="button" disabled={reachableAvailableGroupPeers.length === 0} on:click={addReachableAvailableMembers}>
              添加可联系 {reachableAvailableGroupPeers.length}
            </button>
            <button type="button" disabled={removableUnavailableMemberCount === 0} on:click={removeUnreachableCurrentMembers}>
              移除暂不可达 {removableUnavailableMemberCount}
            </button>
          </div>
        </div>
        <label class="member-search">
          <Search size={14} />
          <input
            value={memberQuery}
            placeholder="搜索成员、主机或设备 ID"
            aria-label="搜索群成员"
            on:input={(event) => (memberQuery = (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="member-filter-row" role="group" aria-label="成员可达性筛选">
          <button
            class:active={memberReachabilityFilter === "all"}
            type="button"
            aria-pressed={memberReachabilityFilter === "all"}
            on:click={() => (memberReachabilityFilter = "all")}
          >
            全部 {groupMemberTotalCount}
          </button>
          <button
            class:active={memberReachabilityFilter === "online"}
            type="button"
            aria-pressed={memberReachabilityFilter === "online"}
            on:click={() => (memberReachabilityFilter = "online")}
          >
            可联系 {reachableGroupMemberCount}
          </button>
          <button
            class:active={memberReachabilityFilter === "offline"}
            type="button"
            aria-pressed={memberReachabilityFilter === "offline"}
            on:click={() => (memberReachabilityFilter = "offline")}
          >
            暂不可达 {unreachableGroupMemberCount}
          </button>
        </div>
        <div class="member-section" role="group" aria-label="当前群成员">
          <header>
            <span>当前成员</span>
            <small>{visibleCurrentGroupMembers.length + visibleUnresolvedGroupMemberIds.length}</small>
          </header>
          <div class="member-picker-list vertical">
            {#each visibleCurrentGroupMembers as peer (peer.peer_id)}
              <article class={`member-edit-row ${peer.peer_id !== selfPeerId && !draftGroupMemberIds.has(peer.peer_id) ? "pending-remove" : ""}`}>
                <span
                  class:online={peer.status === "online"}
                  class:offline={peer.status !== "online"}
                  class="presence"
                  aria-label={`${peerLabel(peer)} ${peerStatusLabel(peer)}状态`}
                  title={peerStatusLabel(peer)}
                ></span>
                <div class="member-row-copy">
                  <strong>{peerLabel(peer)}{peer.peer_id === selfPeerId ? "（我）" : ""}</strong>
                  <small>{peer.hostname || "未知主机"}</small>
                </div>
                {#if peer.peer_id === selfPeerId}
                  <span class="member-lock">本机</span>
                {:else}
                  <div class="member-row-actions">
                    <button class="icon-action" type="button" title={`与 ${peerLabel(peer)} 私聊`} on:click={() => onOpenDirectConversation(peer.peer_id)}>
                      <MessageCircle size={14} />
                    </button>
                    <button class="icon-action" type="button" title={`复制 ${peerLabel(peer)} 设备 ID`} on:click={() => onCopyIdentityValue(peer.peer_id, `${peerLabel(peer)} 设备 ID`)}>
                      <Copy size={14} />
                    </button>
                    {#if peer.endpoints.length > 0}
                      <button class="icon-action" type="button" title={`复制 ${peerLabel(peer)} 直连端点`} on:click={() => onCopyIdentityValue(peer.endpoints.join("\n"), `${peerLabel(peer)} 直连端点`)}>
                        <Network size={14} />
                      </button>
                    {/if}
                    <button class="icon-action" type="button" title={`复制 ${peerLabel(peer)} 设备指纹`} on:click={() => onCopyIdentityValue(peer.fingerprint, `${peerLabel(peer)} 设备指纹`)}>
                      <ShieldCheck size={14} />
                    </button>
                    {#if draftGroupMemberIds.has(peer.peer_id)}
                      <button class="icon-action danger" type="button" title={`从群聊移除 ${peerLabel(peer)}`} on:click={() => onToggleGroupMember(peer.peer_id)}>
                        <UserMinus size={14} />
                      </button>
                    {:else}
                      <button class="icon-action" type="button" title={`恢复 ${peerLabel(peer)}`} on:click={() => onToggleGroupMember(peer.peer_id)}>
                        <UserPlus size={14} />
                      </button>
                    {/if}
                  </div>
                {/if}
              </article>
            {/each}
            {#each visibleUnresolvedGroupMemberIds as peerId (peerId)}
              <article class="member-edit-row unresolved">
                <span
                  class="presence offline"
                  aria-label={`未发现成员 ${peerId} 暂不可达状态`}
                  title="暂不可达"
                ></span>
                <div class="member-row-copy">
                  <strong>未发现成员</strong>
                  <small>{peerId}</small>
                </div>
                <div class="member-row-actions">
                  <button class="icon-action danger" type="button" title={`从群聊移除 ${peerId}`} on:click={() => onToggleGroupMember(peerId)}>
                    <UserMinus size={14} />
                  </button>
                </div>
              </article>
            {/each}
            {#if visibleCurrentGroupMembers.length === 0 && visibleUnresolvedGroupMemberIds.length === 0}
              <p class="empty-note">没有匹配的当前成员</p>
            {/if}
          </div>
        </div>
        <div class="member-section" role="group" aria-label="可添加联系人">
          <header>
            <span>可添加联系人</span>
            <small>{visibleAvailableGroupPeers.length}</small>
          </header>
          <div class="member-picker-list vertical">
            {#each visibleAvailableGroupPeers as peer (peer.peer_id)}
              <article class={`member-edit-row ${draftGroupMemberIds.has(peer.peer_id) ? "pending-add" : ""}`}>
                <span
                  class:online={peer.status === "online"}
                  class:offline={peer.status !== "online"}
                  class="presence"
                  aria-label={`${peerLabel(peer)} ${peerStatusLabel(peer)}状态`}
                  title={peerStatusLabel(peer)}
                ></span>
                <div class="member-row-copy">
                  <strong>{peerLabel(peer)}</strong>
                  <small>{peer.hostname} · {peer.endpoints[0] ?? "等待端点"}</small>
                </div>
                <button class="icon-action" type="button" title={`${draftGroupMemberIds.has(peer.peer_id) ? "取消添加" : "添加"} ${peerLabel(peer)}`} on:click={() => onToggleGroupMember(peer.peer_id)}>
                  {#if draftGroupMemberIds.has(peer.peer_id)}
                    <UserMinus size={14} />
                  {:else}
                    <UserPlus size={14} />
                  {/if}
                </button>
              </article>
            {:else}
              <p class="empty-note">没有可添加联系人</p>
            {/each}
          </div>
        </div>
        <button class="wide-button" type="button" disabled={!groupNameDraft.trim() || groupMemberDraftIds.length === 0} on:click={onSaveGroup}>
          <Save size={15} />
          保存群资料
        </button>
        <button class="wide-button muted" type="button" on:click={onExportConversation}>
          <Download size={15} />
          导出聊天记录
        </button>
        <button class="wide-button muted" type="button" on:click={() => onCopyIdentityValue(conversationDiagnosticReport(), "会话诊断报告")}>
          <Copy size={15} />
          复制会话诊断
        </button>
      </div>
      {#if pendingAddedMemberCount > 0 || pendingRemovedMemberCount > 0}
        <p class="hint">群成员变更将在保存群资料后广播给成员：新增 {pendingAddedMemberCount} 人，移除 {pendingRemovedMemberCount} 人。</p>
      {:else}
        <p class="hint">当前群资料已与本机记录保持一致。</p>
      {/if}
    </section>
  {:else if tab === "details"}
    <section class="inspector-panel">
      <h2>会话详情</h2>
      <div class="status-card">
        <CheckCircle2 size={16} />
        <span>{activePeer ? peerLabel(activePeer) : "内网广播"}</span>
        <span
          aria-label={activePeerPresenceAriaLabel}
          class:online={activePeer?.status === "online"}
          class:offline={activePeer?.status !== "online"}
          class="presence-dot"
          title={peerStatusLabel(activePeer)}
        ></span>
      </div>
      <dl>
        <div>
          <dt>主机</dt>
          <dd>{activePeer?.hostname ?? "未知"}</dd>
        </div>
        <div>
          <dt>端点</dt>
          <dd class="identity-value-row">
            <span title={activePeer?.endpoints.join("\n") || "等待发现"}>{activePeer?.endpoints.join("、") || "等待发现"}</span>
            {#if activePeer && activePeer.endpoints.length > 0}
              <button
                type="button"
                aria-label={`复制 ${peerLabel(activePeer)} 直连端点`}
                title={`复制 ${peerLabel(activePeer)} 直连端点`}
                on:click={() => onCopyIdentityValue(activePeer.endpoints.join("\n"), `${peerLabel(activePeer)} 直连端点`)}
              >
                <Copy size={13} />
              </button>
            {/if}
          </dd>
        </div>
      </dl>
      {#if activePeer}
        <section class="direct-contact-card" aria-label="联系人资料">
          <header>
            <div>
              <strong>联系人资料</strong>
              <span>{metadataForPeer(activePeer).favorite ? "已星标" : "普通联系人"} · {metadataForPeer(activePeer).blocked ? "已阻止" : "可联系"}</span>
            </div>
            <span
              aria-label={`${peerLabel(activePeer)} ${peerStatusLabel(activePeer)}状态`}
              class:online={activePeer.status === "online"}
              class:offline={activePeer.status !== "online"}
              class="presence-dot"
              title={peerStatusLabel(activePeer)}
            ></span>
          </header>
          <label class="field compact-field">
            <span>备注</span>
            <input
              value={metadataForPeer(activePeer).remark}
              placeholder={activePeer.display_name}
              on:input={(event) =>
                onContactMetadataChange(activePeer.peer_id, { remark: (event.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <label class="field compact-field">
            <span>分组</span>
            <input
              value={metadataForPeer(activePeer).group_name}
              placeholder="默认分组"
              on:input={(event) =>
                onContactMetadataChange(activePeer.peer_id, { group_name: (event.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <div class="contact-toggle-row">
            <button
              class:active={metadataForPeer(activePeer).favorite}
              type="button"
              on:click={() => onContactMetadataChange(activePeer.peer_id, { favorite: !metadataForPeer(activePeer).favorite })}
            >
              <Star size={14} />
              {metadataForPeer(activePeer).favorite ? "取消星标" : "星标联系人"}
            </button>
            <button
              class:danger={metadataForPeer(activePeer).blocked}
              type="button"
              on:click={() => onContactMetadataChange(activePeer.peer_id, { blocked: !metadataForPeer(activePeer).blocked })}
            >
              <Ban size={14} />
              {metadataForPeer(activePeer).blocked ? "取消阻止" : "阻止联系人"}
            </button>
          </div>
          <button class="wide-button muted" type="button" on:click={() => onSaveContactMetadata(activePeer.peer_id)}>
            <Save size={15} />
            保存联系人资料
          </button>
        </section>
      {/if}
      <button class="wide-button" type="button" on:click={onEnableNotifications}>
        <Bell size={15} />
        {notificationReady ? "系统通知已开启" : "开启系统通知"}
      </button>
      <button class="wide-button muted" type="button" on:click={onToggleTheme}>
        {#if dark}
          <Sun size={15} />
          切换浅色主题
        {:else}
          <Moon size={15} />
          切换深色主题
        {/if}
      </button>
      <button class="wide-button muted" type="button" on:click={onExportConversation}>
        <Download size={15} />
        导出聊天记录
      </button>
      <button class="wide-button muted" type="button" on:click={() => onCopyIdentityValue(conversationDiagnosticReport(), "会话诊断报告")}>
        <Copy size={15} />
        复制会话诊断
      </button>
      {#if conversation}
        <div class="detail-actions">
          <button type="button" on:click={onTogglePin}>
            {#if conversation.pinned}<PinOff size={14} />取消置顶{:else}<Pin size={14} />置顶{/if}
          </button>
          <button type="button" on:click={onToggleMute}>
            {#if conversation.muted}<Volume2 size={14} />取消免扰{:else}<BellOff size={14} />免打扰{/if}
          </button>
          <button type="button" on:click={onToggleArchive}>
            <Archive size={14} />
            {conversation.archived ? "取消归档" : "归档"}
          </button>
          <button class="danger" type="button" on:click={onClearConversationMessages}>
            <Trash2 size={14} />
            清空聊天记录
          </button>
          <button class="danger" type="button" on:click={onDeleteConversation}>
            <Trash2 size={14} />
            删除
          </button>
        </div>
      {/if}
      <section class="shared-files-card shared-images-card" aria-label="会话图片">
        <header>
          <div>
            <strong>会话图片</strong>
            <span>{recentConversationImages.length ? `最近 ${recentConversationImages.length} 张图片` : "暂无图片"}</span>
          </div>
          <Image size={16} />
        </header>
        <div class="shared-image-grid">
          {#each recentConversationImages as file (file.key)}
            <article class="shared-image-row">
              <button
                class="shared-image-thumb"
                type="button"
                aria-label={`预览图片 ${file.name}`}
                on:click={() => openSharedImagePreview(file)}
              >
                <img src={imageSrc(file.path)} alt={file.name} loading="lazy" />
              </button>
              <span>
                <strong>{file.name}</strong>
                <small>
                  <span>{formatBytes(file.size)}</span>
                  <span> · {file.senderId === selfPeerId ? "我" : "对方"} · {formatFileTime(file.createdAt)}</span>
                </small>
              </span>
              <button type="button" on:click={() => onOpenTransfer(file.transferId)}>定位</button>
            </article>
          {:else}
            <p class="empty-note compact">当前会话还没有共享图片。</p>
          {/each}
        </div>
      </section>
      <section class="shared-files-card" aria-label="会话文件">
        <header>
          <div>
            <strong>会话文件</strong>
            <span>{recentConversationDocuments.length ? `最近 ${recentConversationDocuments.length} 个文件` : "暂无文件"}</span>
          </div>
          <HardDrive size={16} />
        </header>
        <div class="shared-file-list">
          {#each recentConversationDocuments as file (file.key)}
            <article class="shared-file-row">
              <HardDrive size={14} />
              <span>
                <strong>{file.name}</strong>
                <small>
                  <span>{formatBytes(file.size)}</span>
                  <span> · {file.senderId === selfPeerId ? "我" : "对方"} · {formatFileTime(file.createdAt)}</span>
                </small>
              </span>
              <button type="button" on:click={() => onOpenTransfer(file.transferId)}>定位</button>
            </article>
          {:else}
            <p class="empty-note compact">当前会话还没有共享文件。</p>
          {/each}
        </div>
      </section>
      {#if statusText.startsWith("已清空 ")}
        <p class="hint">{statusText}</p>
      {/if}
    </section>
  {:else if tab === "transfers"}
    <section class="inspector-panel">
      <h2>文件传输</h2>
      <div class="transfer-list">
        {#each visibleTransferTasks as task (task.id)}
          <div class="transfer-row detailed">
            <UploadCloud size={15} />
            <span>
              <strong>{task.name}</strong>
              <small><span class={`transfer-status-badge ${transferStatusTone(task)}`}>{transferStatusLabel(task)}</span> · {formatBytes(task.sentBytes)} / {formatBytes(task.totalBytes)}</small>
              {#if task.errorMessage}
                <small class="transfer-error">失败原因：{task.errorMessage}</small>
              {/if}
              {#if cannotResumeTerminalTransfer(task)}
                <small class="transfer-error">本机缺少可重新广播的源文件或授权信息</small>
              {/if}
            </span>
            <button type="button" on:click={() => onOpenTransfer(task.id)}>定位</button>
            {#if isActiveTransfer(task)}
              <button type="button" on:click={() => onCancelTransfer(task.id)}>取消</button>
            {:else}
              {#if canResumeTransfer(task)}
                <button type="button" on:click={() => onResumeTransfer(task.id)}>重新广播</button>
              {/if}
              <button type="button" on:click={() => onDeleteTransfer(task.id)}>删除</button>
            {/if}
          </div>
        {:else}
          <p class="empty-note">暂无传输任务</p>
        {/each}
      </div>
    </section>
  {:else if tab === "network"}
    <section class="inspector-panel">
      <h2>网络状态</h2>
      <p class="warning">
        首次启动如出现 Windows 防火墙提示，请允许专用网络访问；发现、直连和文件传输需要 24250/UDP、24251/QUIC、24252/TCP。
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
        <input value={seedText} placeholder="192.168.1.20:24251" on:input={(event) => onSeedTextChange((event.currentTarget as HTMLInputElement).value)} />
      </label>
      <label class="field">
        <span>扫描网段</span>
        <input value={rangeText} placeholder="192.168.1.0/24" on:input={(event) => onRangeTextChange((event.currentTarget as HTMLInputElement).value)} />
      </label>
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
      <button class="wide-button" type="button" on:click={onSaveNetwork}>保存高级网络</button>
      <button class="wide-button muted" type="button" on:click={() => onCopyNetworkDiagnostics(networkDiagnosticReport())}>
        <Copy size={15} />
        复制网络诊断报告
      </button>
      {#if networkInputWarning}
        <p class="warning">{networkInputWarning}</p>
      {/if}
      {#if networkWarnings.length > 0}
        <div class="network-warning-stack" role="list" aria-label="最近网络告警">
          {#each networkWarnings as warning}
            <p class="warning" role="listitem">{warning}</p>
          {/each}
        </div>
      {:else if networkWarning}
        <p class="warning">{networkWarning}</p>
      {/if}
      {#if statusText}
        <p class="hint">{statusText}</p>
      {/if}
    </section>
  {:else if tab === "storage"}
    <section class="inspector-panel">
      <h2>存储</h2>
      <div class="status-card">
        <HardDrive size={16} />
        <span>加密历史记录、本地 outbox、传输任务</span>
        <strong>本机</strong>
      </div>
      <section class="settings-info-card" aria-label="加密存储状态">
        <header>
          <Database size={16} />
          <div>
            <strong>{storageOverview?.database_key_protection ?? "等待加载"}</strong>
            <span>聊天记录、信任指纹、网络配置和传输任务均保存在本机。</span>
          </div>
        </header>
        <dl>
          <div>
            <dt>缓存占用</dt>
            <dd>{storageOverview ? formatBytes(storageCacheBytes) : "读取中"}</dd>
          </div>
          <div>
            <dt>数据库占用</dt>
            <dd>{storageOverview ? formatBytes(storageOverview.database_bytes) : "读取中"}</dd>
          </div>
          <div>
            <dt>传输任务</dt>
            <dd>{storageOverview?.transfer_task_count ?? transferTasks.length}</dd>
          </div>
        </dl>
      </section>
      <div class="storage-summary">
        <div>
          <UploadCloud size={18} />
          <span>
            <strong>{storageOverview ? formatBytes(storageCacheBytes) : "读取中"}</strong>
            <small>文件缓存占用</small>
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
    </section>
  {:else}
    <section class="inspector-panel">
      <h2>安全指纹</h2>
      {#if isGroup}
        <div class="transfer-list">
          {#each peers as peer (peer.peer_id)}
            <div class="fingerprint">
              <ShieldCheck size={16} />
              <span>{peerLabel(peer)} · {peer.fingerprint}</span>
              <button type="button" title={`复制 ${peerLabel(peer)} 设备指纹`} on:click={() => onCopyIdentityValue(peer.fingerprint, `${peerLabel(peer)} 设备指纹`)}>
                <Copy size={13} />
              </button>
            </div>
          {:else}
            <p class="empty-note">暂无群成员指纹</p>
          {/each}
        </div>
      {:else}
        <div class="fingerprint">
          <ShieldCheck size={16} />
          <span>{activePeer?.fingerprint ?? "等待首次信任"}</span>
          {#if activePeer}
            <button type="button" aria-label="复制设备指纹" title="复制设备指纹" on:click={() => onCopyIdentityValue(activePeer.fingerprint, `${peerLabel(activePeer)} 设备指纹`)}>
              <Copy size={13} />
            </button>
          {/if}
        </div>
        <button class="wide-button" type="button" disabled={!activePeer} on:click={onTrustPeer}>信任此设备</button>
      {/if}
      {#if trustStatus}
        <p class="hint">{trustStatus}</p>
      {/if}
      {#if networkWarning}
        <p class="warning">{networkWarning}</p>
      {/if}
      <p class="hint">首次连接采用 TOFU 信任模型。若同一设备指纹变化，后端会拒绝未知替换。</p>
    </section>
  {/if}
</aside>

{#if sharedImagePreview}
  <div class="image-preview-backdrop inspector-image-preview" role="presentation" on:click={closeSharedImagePreview}>
    <div
      class="image-preview-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`图片预览 ${sharedImagePreview.name}`}
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => {
        if (event.key === "Escape") closeSharedImagePreview();
      }}
    >
      <header>
        <div>
          <strong>{sharedImagePreview.name}</strong>
          <small>{formatBytes(sharedImagePreview.size)} · {sharedImagePreview.senderId === selfPeerId ? "我" : "对方"}</small>
        </div>
        <button type="button" on:click={closeSharedImagePreview}>关闭</button>
      </header>
      <div class="image-preview-stage">
        <img src={imageSrc(sharedImagePreview.path)} alt={sharedImagePreview.name} />
      </div>
      <footer>
        <small>{formatFileTime(sharedImagePreview.createdAt)} · {sharedImagePreview.transferId}</small>
        <button type="button" on:click={() => onOpenTransfer(sharedImagePreview?.transferId ?? "")}>定位到传输任务</button>
      </footer>
    </div>
  </div>
{/if}
