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
  import Megaphone from "lucide-svelte/icons/megaphone";
  import MoreHorizontal from "lucide-svelte/icons/more-horizontal";
  import Moon from "lucide-svelte/icons/moon";
  import Network from "lucide-svelte/icons/network";
  import Pin from "lucide-svelte/icons/pin";
  import PinOff from "lucide-svelte/icons/pin-off";
  import Pencil from "lucide-svelte/icons/pencil";
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
  import Users from "lucide-svelte/icons/users";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import Wifi from "lucide-svelte/icons/wifi";
  import WifiOff from "lucide-svelte/icons/wifi-off";
  import X from "lucide-svelte/icons/x";
  import UserAvatar from "./UserAvatar.svelte";
  import type { ChatMessage, ContactMetadata, ConversationSummary, NetworkSettings, PeerProfile, StorageOverview, TransferTask } from "../api";

  type InspectorTab = "details" | "transfers" | "network" | "security" | "members" | "storage";

  export let tab: InspectorTab = "details";
  export let conversation: ConversationSummary | null = null;
  export let settings: NetworkSettings;
  export let activePeer: PeerProfile | null = null;
  export let focusedPeer: PeerProfile | null = null;
  export let messages: ChatMessage[] = [];
  export let selfPeerId = "";
  export let contactMetadata: Record<string, ContactMetadata> = {};
  export let peers: PeerProfile[] = [];
  export let allPeers: PeerProfile[] = [];
  export let isGroup = false;
  export let groupNameDraft = "";
  export let groupAnnouncementDraft = "";
  export let groupAnnouncementPinnedDraft = false;
  export let groupMemberDraftIds: string[] = [];
  export let canManageGroup = true;
  export let transferTasks: TransferTask[] = [];
  export let storageOverview: StorageOverview | null = null;
  export let networkWarning = "";
  export let networkWarnings: string[] = [];
  export let networkInputWarning = "";
  export let trustStatus = "";
  export let statusText = "";
  export let onTabChange: (value: InspectorTab) => void = () => {};
  export let onTrustPeer: () => void | Promise<void> = () => {};
  export let onGroupNameChange: (value: string) => void = () => {};
  export let onGroupAnnouncementChange: (value: string) => void = () => {};
  export let onSaveGroupAnnouncement: (value: string, pinned: boolean) => void | Promise<void> = () => {};
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
  export let onCopyIdentityValue: (value: string, label: string) => void | Promise<void> = () => {};
  export let onOpenDirectConversation: (peerId: string) => void | Promise<void> = () => {};
  export let onContactMetadataChange: (peerId: string, patch: Partial<ContactMetadata>) => void = () => {};
  export let onSaveContactMetadata: (peerId: string) => void | Promise<void> = () => {};
  export let onClose: () => void = () => {};

  let memberQuery = "";
  let memberAddQuery = "";
  let memberAddDialogOpen = false;
  let memberMorePeerId = "";
  let announcementDialogOpen = false;
  let announcementEditorValue = "";
  let announcementPinnedEditor = false;
  let announcementSaving = false;
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

  $: profileMode = Boolean(focusedPeer);
  $: detailPeer = focusedPeer ?? activePeer;
  $: tabs = profileMode
    ? ([{ id: "details", label: "成员资料" }] as const)
    : isGroup
      ? ([{ id: "details", label: "群资料" }, { id: "members", label: "成员" }, { id: "transfers", label: "文件" }] as const)
      : ([{ id: "details", label: "详情" }, { id: "transfers", label: "文件" }] as const);
  $: visibleTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function transferProgress(task: TransferTask) {
    if (task.totalBytes <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((task.sentBytes / task.totalBytes) * 100)));
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

  function openAnnouncementEditor() {
    if (!canManageGroup) return;
    announcementEditorValue = groupAnnouncementDraft;
    announcementPinnedEditor = groupAnnouncementPinnedDraft;
    announcementDialogOpen = true;
  }

  function closeAnnouncementEditor() {
    if (announcementSaving) return;
    announcementDialogOpen = false;
  }

  async function saveAnnouncementEditor() {
    if (!canManageGroup || announcementSaving) return;
    announcementSaving = true;
    try {
      const value = announcementEditorValue.trim();
      await onSaveGroupAnnouncement(value, value ? announcementPinnedEditor : false);
      onGroupAnnouncementChange(value);
      announcementDialogOpen = false;
    } finally {
      announcementSaving = false;
    }
  }

  function peerLabel(peer: PeerProfile) {
    return contactMetadata[peer.peer_id]?.remark || peer.display_name;
  }

  function peerLabelById(peerId: string) {
    if (!peerId.trim()) return "本机";
    if (peerId === selfPeerId) return "我";
    const peer = [...peers, ...allPeers].find((item) => item.peer_id === peerId);
    return peer ? peerLabel(peer) : peerId;
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
      `失败任务：${failedTasks.length}`,
      `可续传失败：${resumableFailedTasks.length}`,
      `最近失败：${recentFailures || "无"}`
    ].join("\n");
  }

  function networkDiagnosticReport() {
    const knownPeers = allPeers.length > 0 ? allPeers : peers;
    const onlinePeers = knownPeers.filter((peer) => peer.status === "online").length;
    return [
      "iim 网络诊断",
      `自动发现：${settings.auto_discovery ? "开启" : "关闭"}`,
      `局域网广播：${settings.multicast ? "开启" : "关闭"}`,
      `发现设备：${knownPeers.length}`,
      `可联系设备：${onlinePeers}`,
      `发现间隔：${settings.discovery_interval_secs}s`,
      `离线判定：${settings.peer_ttl_secs}s`,
      `最近警告：${networkWarnings.join(" | ") || networkWarning || "无"}`,
      `当前输入告警：${networkInputWarning || "无"}`
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

  function endpointIp(endpoint: string) {
    const value = endpoint.trim();
    if (!value) return "";
    if (value.startsWith("[")) return value.slice(1, value.indexOf("]") > 0 ? value.indexOf("]") : undefined);
    const colonCount = (value.match(/:/g) ?? []).length;
    return colonCount === 1 ? value.slice(0, value.lastIndexOf(":")) : value;
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
    if (!canManageGroup) return;
    for (const peer of reachableAvailableGroupPeers) {
      onToggleGroupMember(peer.peer_id);
    }
  }

  function removeUnreachableCurrentMembers() {
    if (!canManageGroup) return;
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
  $: groupOwnerPeerId = conversation?.group_owner_peer_id?.trim() ?? "";
  $: groupOwnerLabel = groupOwnerPeerId ? peerLabelById(groupOwnerPeerId) : "本机";
  $: visibleCurrentGroupMembers = peers.filter((peer) => matchesMemberQuery(peer, memberQuery));
  $: visibleUnresolvedGroupMemberIds = unresolvedGroupMemberIds.filter((peerId) => matchesUnresolvedMemberQuery(peerId, memberQuery));
  $: visibleMemberCandidates = allPeers.filter((peer) => !peerBlocked(peer) && matchesMemberQuery(peer, memberAddQuery));
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
  $: activePeerPresenceAriaLabel = `${detailPeer ? peerLabel(detailPeer) : "未选择联系人"} ${peerStatusLabel(detailPeer)}状态`;
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

<aside class="inspector" aria-label={profileMode ? "成员资料面板" : isGroup ? "群成员与会话面板" : "会话详情面板"}>
  <div class="inspector-tabs" role="tablist">
    {#each tabs as item}
      <button class:active={visibleTab === item.id} type="button" role="tab" on:click={() => onTabChange(item.id)}>
        {#if item.id === "details"}
          {#if isGroup && !profileMode}<Megaphone size={13} />{:else}<CheckCircle2 size={13} />{/if}
        {:else if item.id === "members"}
          <UserPlus size={13} />
        {:else}
          <HardDrive size={13} />
        {/if}
        {item.label}
      </button>
    {/each}
    <button class="inspector-close-button" type="button" title="收起详情" aria-label="收起详情" on:click={onClose}>
      <X size={14} />
    </button>
  </div>

  {#if visibleTab === "details" && isGroup && !profileMode}
    <section class="inspector-panel group-profile-panel">
      <h2 class="visually-hidden">群资料</h2>
      <header class="group-profile-identity">
        <UserAvatar name={groupNameDraft || conversation?.title || "内网群聊"} seed={conversation?.id || "group"} size={48} />
        <div>
          <strong>{groupNameDraft || conversation?.title || "内网群聊"}</strong>
          <span><Users size={13} />{groupMemberTotalCount} 名成员</span>
        </div>
      </header>

      <section class:announcement-pinned={groupAnnouncementPinnedDraft} class="group-profile-announcement" aria-label="群公告资料">
        <header>
          <span class="group-profile-section-title"><Megaphone size={15} />群公告</span>
          <span class="group-profile-announcement-actions">
            {#if groupAnnouncementDraft && groupAnnouncementPinnedDraft}<span class="announcement-pin-state"><Pin size={11} />已置顶</span>{/if}
            {#if canManageGroup}
              <button class="icon-action" type="button" title="编辑群公告" aria-label="编辑群公告" on:click={openAnnouncementEditor}>
                <Pencil size={14} />
              </button>
            {/if}
          </span>
        </header>
        {#if groupAnnouncementDraft}
          <p>{groupAnnouncementDraft}</p>
        {:else}
          <p class="group-profile-empty">{canManageGroup ? "还没有群公告，点击编辑发布。" : "群创建者尚未发布公告。"}</p>
        {/if}
      </section>

      <section class="group-profile-settings" aria-label="群基础资料">
        <label class="group-profile-name-field">
          <span>群聊名称</span>
          <input
            value={groupNameDraft}
            placeholder="内网群聊"
            disabled={!canManageGroup}
            on:input={(event) => onGroupNameChange((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="group-profile-meta-row">
          <span>创建者</span>
          <strong>{groupOwnerLabel}</strong>
        </div>
      </section>

      {#if canManageGroup}
        <button class="group-profile-save" type="button" disabled={!groupNameDraft.trim()} on:click={onSaveGroup}>
          <Save size={14} />保存群名称
        </button>
      {:else}
        <p class="group-profile-permission">群资料仅可由创建者编辑</p>
      {/if}
    </section>
  {:else if visibleTab === "members"}
    <section class="inspector-panel">
      <div class="group-editor">
        <div class="group-editor-head">
          <div>
            <strong>当前成员</strong>
            <small>{canManageGroup ? `${groupMemberTotalCount} 人` : `${groupMemberTotalCount} 人 · 仅创建者可管理`}</small>
          </div>
          <button class="member-add-command" type="button" disabled={!canManageGroup} on:click={() => {
            memberAddQuery = "";
            memberAddDialogOpen = true;
          }}>
            <UserPlus size={14} />
            添加成员
          </button>
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
        <div class="member-section" role="group" aria-label="当前群成员">
          <div class="member-picker-list vertical">
            {#each visibleCurrentGroupMembers as peer (peer.peer_id)}
              <article class={`member-edit-row ${peer.peer_id !== selfPeerId && !draftGroupMemberIds.has(peer.peer_id) ? "pending-remove" : ""}`}>
                <UserAvatar name={peerLabel(peer)} seed={peer.peer_id} size={34} />
                <div class="member-row-copy">
                  <strong>
                    {peerLabel(peer)}{peer.peer_id === selfPeerId ? "（我）" : ""}
                    {#if peer.peer_id === groupOwnerPeerId}<span class="group-owner-badge">群主</span>{/if}
                  </strong>
                  <small class="member-presence-line">
                    {#if peer.status === "online"}<Wifi size={12} />{:else}<WifiOff size={12} />{/if}
                    {peer.status === "online" ? "在线" : "离线"}{endpointIp(peer.endpoints[0] ?? "") ? ` · ${endpointIp(peer.endpoints[0])}` : ""}
                  </small>
                </div>
                <div class="member-row-actions compact">
                  {#if peer.peer_id !== selfPeerId}
                    <button class:restore={!draftGroupMemberIds.has(peer.peer_id)} class="icon-action danger" type="button" disabled={!canManageGroup} title={draftGroupMemberIds.has(peer.peer_id) ? `移除 ${peerLabel(peer)}` : `撤销移除 ${peerLabel(peer)}`} on:click={() => canManageGroup && onToggleGroupMember(peer.peer_id)}>
                      {#if draftGroupMemberIds.has(peer.peer_id)}<UserMinus size={14} />{:else}<UserPlus size={14} />{/if}
                    </button>
                  {/if}
                  <button class="icon-action" type="button" title={`更多 ${peerLabel(peer)}`} aria-label={`更多 ${peerLabel(peer)}`} on:click={() => (memberMorePeerId = memberMorePeerId === peer.peer_id ? "" : peer.peer_id)}>
                    <MoreHorizontal size={15} />
                  </button>
                  {#if memberMorePeerId === peer.peer_id}
                    <div class="member-more-menu" role="menu" aria-label={`${peerLabel(peer)} 更多操作`}>
                      {#if peer.peer_id !== selfPeerId}<button type="button" role="menuitem" on:click={() => onOpenDirectConversation(peer.peer_id)}><MessageCircle size={13} />私聊</button>{/if}
                      <button type="button" role="menuitem" on:click={() => onCopyIdentityValue(peer.peer_id, `${peerLabel(peer)} 设备 ID`)}><Copy size={13} />复制 ID</button>
                      <button type="button" role="menuitem" on:click={() => onCopyIdentityValue(peer.fingerprint, `${peerLabel(peer)} 设备指纹`)}><ShieldCheck size={13} />复制指纹</button>
                    </div>
                  {/if}
                </div>
              </article>
            {/each}
            {#each visibleUnresolvedGroupMemberIds as peerId (peerId)}
              <article class="member-edit-row unresolved">
                <UserAvatar name="未发现成员" seed={peerId} size={34} />
                <div class="member-row-copy">
                  <strong>未发现成员</strong>
                  <small class="member-presence-line"><WifiOff size={12} />离线 · {peerId}</small>
                </div>
                <div class="member-row-actions compact">
                  <button class="icon-action danger" type="button" disabled={!canManageGroup} title={`从群聊移除 ${peerId}`} on:click={() => canManageGroup && onToggleGroupMember(peerId)}>
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
        {#if memberAddDialogOpen}
          <div class="member-add-dialog-backdrop" role="presentation" on:click={() => (memberAddDialogOpen = false)}>
            <div class="member-add-dialog" role="dialog" aria-modal="true" aria-label="添加群成员" tabindex="-1" on:click|stopPropagation on:keydown={(event) => {
              if (event.key === "Escape") memberAddDialogOpen = false;
            }}>
              <header>
                <strong>添加群成员</strong>
                <button class="icon-action" type="button" aria-label="关闭添加成员" on:click={() => (memberAddDialogOpen = false)}><X size={15} /></button>
              </header>
              <label class="member-search">
                <Search size={14} />
                <input value={memberAddQuery} aria-label="搜索可添加成员" placeholder="搜索姓名、主机或 IP" on:input={(event) => (memberAddQuery = (event.currentTarget as HTMLInputElement).value)} />
              </label>
              <div class="member-candidate-list">
                {#each visibleMemberCandidates as peer (peer.peer_id)}
                  <article class="member-candidate-row">
                    <UserAvatar name={peerLabel(peer)} seed={peer.peer_id} size={34} />
                    <div>
                      <strong>{peerLabel(peer)}</strong>
                      <small>{peer.status === "online" ? "在线" : "离线"}{endpointIp(peer.endpoints[0] ?? "") ? ` · ${endpointIp(peer.endpoints[0])}` : ""}</small>
                    </div>
                    {#if draftGroupMemberIds.has(peer.peer_id) || peer.peer_id === selfPeerId}
                      <span class="member-added-mark">已添加</span>
                    {:else}
                      <button type="button" disabled={!canManageGroup} on:click={() => onToggleGroupMember(peer.peer_id)}>添加</button>
                    {/if}
                  </article>
                {:else}
                  <p class="empty-note">没有匹配的联系人</p>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
      {#if canManageGroup && (pendingAddedMemberCount > 0 || pendingRemovedMemberCount > 0)}
        <div class="group-member-save-bar" role="status">
          <span>新增 {pendingAddedMemberCount} · 移除 {pendingRemovedMemberCount}</span>
          <button type="button" aria-label="保存成员变更" disabled={groupMemberDraftIds.length === 0} on:click={onSaveGroup}>
            <Save size={13} />保存
          </button>
        </div>
      {/if}
    </section>
  {:else if visibleTab === "details"}
    <section class="inspector-panel">
      <h2 class="visually-hidden">会话详情</h2>
      <div class="status-card">
        <CheckCircle2 size={16} />
        <span>{detailPeer ? peerLabel(detailPeer) : "未选择联系人"}</span>
        <span
          aria-label={activePeerPresenceAriaLabel}
          class:online={detailPeer?.status === "online"}
          class:offline={detailPeer?.status !== "online"}
          class="presence-dot"
          title={peerStatusLabel(detailPeer)}
        ></span>
      </div>
      <dl>
        <div>
          <dt>主机</dt>
          <dd>{detailPeer?.hostname ?? "未知"}</dd>
        </div>
        <div>
          <dt>IP 地址</dt>
          <dd class="identity-value-row">
            <span>{detailPeer?.endpoints.map(endpointIp).filter(Boolean).join("、") || "等待发现"}</span>
            {#if detailPeer && detailPeer.endpoints.length > 0}
              <button
                type="button"
                aria-label={`复制 ${peerLabel(detailPeer)} IP 地址`}
                title={`复制 ${peerLabel(detailPeer)} IP 地址`}
                on:click={() => onCopyIdentityValue(detailPeer.endpoints.map(endpointIp).filter(Boolean).join("\n"), `${peerLabel(detailPeer)} IP 地址`)}
              >
                <Copy size={13} />
              </button>
            {/if}
          </dd>
        </div>
      </dl>
      {#if detailPeer}
        <details class="inspector-disclosure direct-contact-card" aria-label="联系人资料">
          <summary>
            <span><strong>联系人设置</strong><small>备注、分组与权限</small></span>
          </summary>
          <div class="inspector-disclosure-body">
            <label class="field compact-field">
              <span>备注</span>
              <input
                value={metadataForPeer(detailPeer).remark}
                placeholder={detailPeer.display_name}
                on:input={(event) =>
                  onContactMetadataChange(detailPeer.peer_id, { remark: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
            <label class="field compact-field">
              <span>分组</span>
              <input
                value={metadataForPeer(detailPeer).group_name}
                placeholder="默认分组"
                on:input={(event) =>
                  onContactMetadataChange(detailPeer.peer_id, { group_name: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
            <div class="contact-toggle-row">
              <button
                class:active={metadataForPeer(detailPeer).favorite}
                type="button"
                on:click={() => onContactMetadataChange(detailPeer.peer_id, { favorite: !metadataForPeer(detailPeer).favorite })}
              >
                <Star size={14} />
                {metadataForPeer(detailPeer).favorite ? "取消星标" : "星标联系人"}
              </button>
              <button
                class:danger={metadataForPeer(detailPeer).blocked}
                type="button"
                on:click={() => onContactMetadataChange(detailPeer.peer_id, { blocked: !metadataForPeer(detailPeer).blocked })}
              >
                <Ban size={14} />
                {metadataForPeer(detailPeer).blocked ? "取消阻止" : "阻止联系人"}
              </button>
            </div>
            <button class="action-card primary-card contact-save-card" type="button" aria-label="保存联系人资料" on:click={() => onSaveContactMetadata(detailPeer.peer_id)}>
              <Save size={15} />
              <span><strong>保存联系人资料</strong><small>写入本机联系人记录</small></span>
            </button>
          </div>
        </details>
      {/if}
      {#if !profileMode}
      <details class="inspector-disclosure conversation-management">
        <summary><span><strong>会话管理</strong><small>置顶、免扰与记录</small></span></summary>
        <div class="inspector-disclosure-body">
          <button class="action-card" type="button" aria-label="导出聊天记录" on:click={onExportConversation}>
            <Download size={15} />
            <span><strong>导出聊天记录</strong><small>保存当前会话</small></span>
          </button>
          {#if conversation}
            <div class="detail-actions">
              <button class="row-action" type="button" on:click={onTogglePin}>
                {#if conversation.pinned}<PinOff size={14} />取消置顶{:else}<Pin size={14} />置顶{/if}
              </button>
              <button class="row-action" type="button" on:click={onToggleMute}>
                {#if conversation.muted}<Volume2 size={14} />取消免扰{:else}<BellOff size={14} />免打扰{/if}
              </button>
              <button class="row-action" type="button" on:click={onToggleArchive}>
                <Archive size={14} />{conversation.archived ? "取消归档" : "归档"}
              </button>
              <button class="row-action danger" type="button" on:click={onClearConversationMessages}>
                <Trash2 size={14} />清空聊天记录
              </button>
              <button class="row-action danger" type="button" on:click={onDeleteConversation}>
                <Trash2 size={14} />删除会话
              </button>
            </div>
          {/if}
        </div>
      </details>
      <details class="inspector-disclosure conversation-assets">
        <summary><span><strong>聊天文件</strong><small>{recentConversationImages.length + recentConversationDocuments.length} 项</small></span></summary>
        <div class="inspector-disclosure-body asset-disclosure-body">
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
              <button class="row-action" type="button" on:click={() => onOpenTransfer(file.transferId)}>
                <HardDrive size={13} />
                定位
              </button>
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
              <button class="row-action" type="button" on:click={() => onOpenTransfer(file.transferId)}>
                <HardDrive size={13} />
                定位
              </button>
            </article>
          {:else}
            <p class="empty-note compact">当前会话还没有共享文件。</p>
          {/each}
        </div>
      </section>
        </div>
      </details>
      {#if statusText.startsWith("已清空 ")}
        <p class="hint">{statusText}</p>
      {/if}
      {/if}
    </section>
  {:else if visibleTab === "transfers"}
    <section class="inspector-panel">
      <h2>文件传输</h2>
      <div class="transfer-list">
        {#each visibleTransferTasks as task (task.id)}
          <div class="transfer-row detailed">
            <UploadCloud size={15} />
            <span>
              <strong>{task.name}</strong>
              <small><span class={`transfer-status-badge ${transferStatusTone(task)}`}>{transferStatusLabel(task)}</span> · {formatBytes(task.sentBytes)} / {formatBytes(task.totalBytes)}</small>
              <span
                class="inspector-transfer-progress"
                role="progressbar"
                aria-label={`${task.name} 传输进度`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={transferProgress(task)}
              >
                <span style={`width: ${transferProgress(task)}%`}></span>
              </span>
              {#if task.errorMessage}
                <small class="transfer-error">失败原因：{task.errorMessage}</small>
              {/if}
              {#if cannotResumeTerminalTransfer(task)}
                <small class="transfer-error">本机缺少可重新广播的源文件或授权信息</small>
              {/if}
            </span>
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
              {#if canResumeTransfer(task)}
                <button class="row-action" type="button" on:click={() => onResumeTransfer(task.id)}>
                  <RefreshCw size={13} />
                  重新广播
                </button>
              {/if}
              <button class="row-action danger" type="button" on:click={() => onDeleteTransfer(task.id)}>
                <Trash2 size={13} />
                删除
              </button>
            {/if}
          </div>
        {:else}
          <p class="empty-note">暂无传输任务</p>
        {/each}
      </div>
    </section>
  {:else if visibleTab === "network"}
    <section class="inspector-panel">
      <h2>网络状态</h2>
      <p class="warning">
        首次启动如出现 Windows 防火墙提示，请允许专用网络访问；发现、直连和文件传输需要 24250/UDP、24251/QUIC、24252/TCP。
      </p>
      <div class:enabled={settings.auto_discovery} class="switch-row">
        <Network size={16} />
        <span>默认发现</span>
        <strong>{settings.auto_discovery && settings.multicast ? "运行中" : "受限"}</strong>
      </div>
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
  {:else if visibleTab === "storage"}
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
                  class="row-action"
                  type="button"
                  aria-label={`复制${row.copyLabel}`}
                  title={`复制${row.copyLabel}`}
                  on:click={() => onCopyStoragePath(row.value, row.copyLabel)}
                >
                  <Copy size={13} />
                  复制
                </button>
              {/if}
            </dd>
          </div>
        {/each}
      </dl>
      <section class="inspector-action-panel" aria-label="存储操作">
        <div class="inspector-action-grid">
          <button class="action-card" type="button" aria-label="刷新存储信息" on:click={onRefreshStorage}>
            <RefreshCw size={15} />
            <span>
              <strong>刷新存储信息</strong>
              <small>重新读取占用</small>
            </span>
          </button>
          <button class="action-card" type="button" aria-label="打开数据目录" on:click={() => onOpenStorage("data")}>
            <HardDrive size={15} />
            <span>
              <strong>打开数据目录</strong>
              <small>配置与数据库</small>
            </span>
          </button>
          <button class="action-card" type="button" aria-label="打开接收目录" on:click={() => onOpenStorage("received")}>
            <UploadCloud size={15} />
            <span>
              <strong>打开接收目录</strong>
              <small>接收的文件</small>
            </span>
          </button>
          <button class="action-card" type="button" aria-label="打开暂存目录" on:click={() => onOpenStorage("staged")}>
            <HardDrive size={15} />
            <span>
              <strong>打开暂存目录</strong>
              <small>截图与粘贴缓存</small>
            </span>
          </button>
        </div>
        <button class="contact-danger-action danger" type="button" aria-label="清理剪贴板暂存" on:click={onClearStagedFiles}>
          <Trash2 size={15} />
          <span>
            <strong>清理剪贴板暂存</strong>
            <small>删除临时截图与粘贴文件</small>
          </span>
        </button>
      </section>
    </section>
  {:else if visibleTab === "security"}
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
        <button class="action-card primary-card inspector-single-action" type="button" disabled={!activePeer} on:click={onTrustPeer}>
          <ShieldCheck size={15} />
          <span>
            <strong>信任此设备</strong>
            <small>确认当前指纹</small>
          </span>
        </button>
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

{#if announcementDialogOpen}
  <div
    class="group-announcement-dialog-backdrop"
    role="presentation"
    on:click={(event) => {
      if (event.target === event.currentTarget) closeAnnouncementEditor();
    }}
  >
    <form
      class="group-announcement-dialog"
      aria-label="编辑群公告"
      on:submit|preventDefault={saveAnnouncementEditor}
    >
      <header>
        <div>
          <strong>群公告</strong>
          <span>发布后将同步给所有群成员</span>
        </div>
        <button class="icon-action" type="button" aria-label="关闭群公告编辑" on:click={closeAnnouncementEditor}><X size={16} /></button>
      </header>
      <label class="group-announcement-editor-field">
        <span>公告内容</span>
        <textarea
          aria-label="群公告内容"
          rows="7"
          maxlength="500"
          placeholder="填写群内通知、值班安排或重要约定"
          value={announcementEditorValue}
          on:input={(event) => (announcementEditorValue = (event.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
        <small>{announcementEditorValue.length} / 500</small>
      </label>
      <label class="group-announcement-pin-toggle">
        <span>
          <strong>置顶到聊天顶部</strong>
          <small>关闭后仍可在群资料中查看</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="置顶群公告"
          checked={announcementPinnedEditor}
          disabled={!announcementEditorValue.trim()}
          on:change={(event) => (announcementPinnedEditor = (event.currentTarget as HTMLInputElement).checked)}
        />
      </label>
      <footer>
        <button type="button" on:click={closeAnnouncementEditor}>取消</button>
        <button class="primary" type="submit" disabled={announcementSaving}>
          {#if announcementSaving}保存中{:else}发布公告{/if}
        </button>
      </footer>
    </form>
  </div>
{/if}

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
        <button class="row-action" type="button" on:click={closeSharedImagePreview}>
          <X size={13} />
          关闭
        </button>
      </header>
      <div class="image-preview-stage">
        <img src={imageSrc(sharedImagePreview.path)} alt={sharedImagePreview.name} />
      </div>
      <footer>
        <small>{formatFileTime(sharedImagePreview.createdAt)} · {sharedImagePreview.transferId}</small>
        <button class="row-action" type="button" on:click={() => onOpenTransfer(sharedImagePreview?.transferId ?? "")}>
          <HardDrive size={13} />
          定位到传输任务
        </button>
      </footer>
    </div>
  </div>
{/if}
