<script lang="ts">
  import CheckCheck from "lucide-svelte/icons/check-check";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import UserRound from "lucide-svelte/icons/user-round";
  import type { ContactMetadata, ConversationSummary, PeerProfile } from "../api";
  import { directConversationPeer, visibleUnreadCount } from "../conversationState";

  export let self: PeerProfile | null = null;
  export let peers: PeerProfile[] = [];
  export let contactMetadata: Record<string, ContactMetadata> = {};
  export let conversations: ConversationSummary[] = [];
  export let activeConversation = "";
  export let mentionedConversationIds: string[] = [];
  export let todoConversationCounts: Record<string, number> = {};
  export let outboxConversationCounts: Record<string, number> = {};
  export let failedOutboxConversationCounts: Record<string, number> = {};
  export let typingPreviewByConversation: Record<string, string> = {};
  export let privacyMode = false;
  export let onSelectConversation: (id: string) => void | Promise<void> = () => {};
  export let onRefreshPeers: () => void | Promise<void> = () => {};
  export let onMarkAllRead: () => void | Promise<void> = () => {};
  export let onConversationContext: (conversation: ConversationSummary, event: MouseEvent) => void = () => {};
  export let onPeerContext: (peer: PeerProfile, event: MouseEvent) => void = () => {};
  export let onOpenPeerDetails: (peer: PeerProfile) => void = () => {};

  type ColumnMode = "conversations" | "contacts";
  type ContactDirectoryFilter = "all" | "online" | "favorite" | "unavailable";

  let columnMode: ColumnMode = "conversations";
  let contactFilter: ContactDirectoryFilter = "all";
  let refreshing = false;

  $: contactFilterItems = [
    { id: "all", label: "全部", count: contactPeers.length },
    { id: "online", label: "可联系", count: reachablePeerCount },
    { id: "favorite", label: "收藏", count: contactPeers.filter((peer) => metadataFor(peer.peer_id).favorite).length },
    { id: "unavailable", label: "暂不可达", count: contactPeers.filter((peer) => peer.status !== "online").length }
  ] satisfies Array<{ id: ContactDirectoryFilter; label: string; count: number }>;

  $: filteredConversations = conversations.filter((conversation) => !conversation.archived);
  $: visibleConversations = filteredConversations.sort(conversationPrioritySort);
  $: unreadCount = visibleUnreadCount(conversations);
  $: contactPeers = peers.filter((peer) => peer.peer_id !== self?.peer_id && !metadataFor(peer.peer_id).blocked);
  $: visibleContactPeers = contactPeers
    .filter((peer) => contactMatchesFilter(peer, contactFilter))
    .sort((a, b) => {
      const aMeta = metadataFor(a.peer_id);
      const bMeta = metadataFor(b.peer_id);
      return (
        Number(bMeta.favorite) - Number(aMeta.favorite) ||
        Number(b.status === "online") - Number(a.status === "online") ||
        displayPeerName(a).localeCompare(displayPeerName(b), "zh-CN")
      );
    })
    .slice(0, 40);
  $: visibleContactGroups = groupedContactPeers(visibleContactPeers);
  $: reachablePeerCount = contactPeers.filter((peer) => peer.status === "online").length;
  $: contactGroupCount = new Set(contactPeers.map((peer) => metadataFor(peer.peer_id).group_name.trim()).filter(Boolean)).size;
  $: contactTabLabel = `联系人 ${contactPeers.length} 人`;

  function metadataFor(peerId: string) {
    return contactMetadata[peerId] ?? { peer_id: peerId, remark: "", group_name: "", favorite: false, blocked: false };
  }

  function displayPeerName(peer: PeerProfile) {
    return metadataFor(peer.peer_id).remark.trim() || peer.display_name || peer.hostname || peer.peer_id;
  }

  function peerForConversation(conversation: ConversationSummary) {
    return directConversationPeer(conversation, peers);
  }

  function conversationTitle(conversation: ConversationSummary) {
    const peer = peerForConversation(conversation);
    return peer ? displayPeerName(peer) : conversation.title;
  }

  function conversationPresenceLabel(conversation: ConversationSummary) {
    const peer = peerForConversation(conversation);
    return peer ? `${displayPeerName(peer)} ${peerAvailabilityLabel(peer)}` : "";
  }

  function conversationTypingPreview(conversation: ConversationSummary) {
    return typingPreviewByConversation[conversation.id] ?? "";
  }

  function draftPreviewText(conversation: ConversationSummary) {
    if (!conversation.draft_preview) return "";
    return privacyMode ? "草稿已隐藏" : conversation.draft_preview;
  }

  function latestPreviewText(conversation: ConversationSummary) {
    if (!conversation.last_message_preview) return "";
    return privacyMode ? "消息预览已隐藏" : conversation.last_message_preview;
  }

  function peerAvailabilityLabel(peer: PeerProfile) {
    return peer.status === "online" ? "可联系" : "暂不可达";
  }

  function peerDetailLine(peer: PeerProfile) {
    const metadata = metadataFor(peer.peer_id);
    return [metadata.group_name.trim() || "默认分组", peer.hostname || "未知主机", peer.endpoints[0] || "等待端点"].join(" · ");
  }

  function conversationSearchText(conversation: ConversationSummary) {
    const peer = peerForConversation(conversation);
    return [
      conversationTitle(conversation),
      conversation.title,
      conversation.id,
      peer ? `${peer.display_name} ${peer.hostname} ${peer.endpoints.join(" ")} ${metadataFor(peer.peer_id).group_name}` : "",
      conversation.pinned ? "置顶 pinned" : "",
      conversation.muted ? "免扰 muted" : "",
      conversation.archived ? "归档 archived" : "",
      conversation.unread_count > 0 ? "未读 unread" : "",
      mentionedConversationIds.includes(conversation.id) ? "@我 mention" : "",
      (todoConversationCounts[conversation.id] ?? 0) > 0 ? `待办 todo ${todoConversationCounts[conversation.id]}` : "",
      (outboxConversationCounts[conversation.id] ?? 0) > 0
        ? `待发 outbox ${outboxConversationCounts[conversation.id]} 失败 failed ${failedOutboxConversationCounts[conversation.id] ?? 0}`
        : "",
      conversation.draft_preview ? `草稿 draft ${privacyMode ? "hidden" : conversation.draft_preview}` : "",
      conversation.last_message_preview ? `最近消息 latest ${privacyMode ? "hidden" : conversation.last_message_preview}` : "",
      conversationTypingPreview(conversation) ? `正在输入 typing ${conversationTypingPreview(conversation)}` : ""
    ]
      .join(" ")
      .toLowerCase();
  }

  function contactSearchText(peer: PeerProfile) {
    const metadata = metadataFor(peer.peer_id);
    return [
      displayPeerName(peer),
      peer.display_name,
      peer.hostname,
      peer.peer_id,
      peer.endpoints.join(" "),
      metadata.group_name,
      metadata.favorite ? "收藏 favorite" : "",
      peer.status === "online" ? "可联系 在线 online" : "暂不可达 离线 offline"
    ]
      .join(" ")
      .toLowerCase();
  }

  function contactMatchesFilter(peer: PeerProfile, currentFilter: ContactDirectoryFilter) {
    if (currentFilter === "online") return peer.status === "online";
    if (currentFilter === "favorite") return metadataFor(peer.peer_id).favorite;
    if (currentFilter === "unavailable") return peer.status !== "online";
    return true;
  }

  function delay(milliseconds: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function handleRefreshPeers() {
    if (refreshing) return;
    refreshing = true;
    try {
      await Promise.allSettled([Promise.resolve(onRefreshPeers()), delay(1000)]);
    } finally {
      refreshing = false;
    }
  }

  function groupedContactPeers(peerList: PeerProfile[]) {
    const groups = new Map<string, PeerProfile[]>();
    for (const peer of peerList) {
      const groupName = metadataFor(peer.peer_id).group_name.trim() || "默认分组";
      groups.set(groupName, [...(groups.get(groupName) ?? []), peer]);
    }
    return [...groups.entries()].map(([label, items]) => ({ label, peers: items }));
  }

  function conversationPrioritySort(left: ConversationSummary, right: ConversationSummary) {
    const rank = (conversation: ConversationSummary) =>
      (conversation.pinned ? 1_000_000 : 0) +
      ((todoConversationCounts[conversation.id] ?? 0) > 0 ? 100_000 : 0) +
      ((outboxConversationCounts[conversation.id] ?? 0) > 0 ? 10_000 : 0) +
      (mentionedConversationIds.includes(conversation.id) ? 1_000 : 0);
    return rank(right) - rank(left) || right.last_message_at - left.last_message_at;
  }

  function openContactMode() {
    columnMode = "contacts";
  }

  function formatTime(value: number) {
    if (!value) return "";
    const now = Date.now();
    const date = new Date(value);
    if (now - value < 24 * 60 * 60 * 1000) {
      return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
    }
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
  }
</script>

<section class="conversation-column" aria-label="会话列表">
  <header class="profile-card">
    <div class="avatar">{self?.display_name?.slice(0, 1) ?? "灵"}</div>
    <div>
      <strong>{self?.display_name ?? "本机用户"}</strong>
      <span>{self?.hostname ?? "本机预览"}</span>
    </div>
  </header>

  <div class="conversation-sidebar-toolbar" aria-label="侧栏快捷操作">
    <div>
      <strong>{columnMode === "contacts" ? "联系人发现" : "消息工作台"}</strong>
      <small>{reachablePeerCount} 可联系 · {unreadCount} 未读</small>
    </div>
    <button
      class:refreshing
      class="sidebar-refresh-button"
      type="button"
      on:click={handleRefreshPeers}
      title="刷新联系人"
      aria-label="刷新联系人"
      aria-busy={refreshing}
      disabled={refreshing}
    >
      <RefreshCw size={14} />
      <span>刷新</span>
    </button>
  </div>

  <div class="column-mode-tabs" role="tablist" aria-label="侧栏视图">
    <button
      class:active={columnMode === "conversations"}
      type="button"
      role="tab"
      aria-selected={columnMode === "conversations"}
      on:click={() => (columnMode = "conversations")}
    >
      <MessageSquare size={14} />
      会话
      {#if unreadCount > 0}<small>{unreadCount}</small>{/if}
    </button>
    <button
      class:active={columnMode === "contacts"}
      type="button"
      role="tab"
      aria-selected={columnMode === "contacts"}
      on:click={() => (columnMode = "contacts")}
    >
      <UserRound size={14} />
      {contactTabLabel}
    </button>
  </div>

  {#if columnMode === "conversations"}
  <div class="column-page conversation-page">
  <div class="section-heading">
    <span>会话</span>
    <span class="section-heading-actions">
      <small>{visibleConversations.length}</small>
      {#if unreadCount > 0}
        <button class="section-compact-action" type="button" title="全部标为已读" on:click={onMarkAllRead}>
          <CheckCheck size={12} />
          全部已读
        </button>
      {/if}
    </span>
  </div>

  <div class="conversation-list">
    {#each visibleConversations as conversation (conversation.id)}
      {@const conversationPeer = peerForConversation(conversation)}
      {@const typingPreview = conversationTypingPreview(conversation)}
      {@const conversationTodoCount = todoConversationCounts[conversation.id] ?? 0}
      {@const conversationOutboxCount = outboxConversationCounts[conversation.id] ?? 0}
      {@const conversationFailedOutboxCount = failedOutboxConversationCounts[conversation.id] ?? 0}
      <article
        class:archived={conversation.archived}
        class:active={conversation.id === activeConversation}
        class:unread={conversation.unread_count > 0}
        class="conversation-item"
        on:contextmenu={(event) => onConversationContext(conversation, event)}
      >
        <button class="conversation-main-button" type="button" on:click={() => onSelectConversation(conversation.id)}>
          <span class="conversation-avatar">
            {conversationTitle(conversation).slice(0, 1)}
            {#if conversationPeer}
              <span
                class:online={conversationPeer.status === "online"}
                class:offline={conversationPeer.status !== "online"}
                class="conversation-presence-dot"
                aria-label={conversationPresenceLabel(conversation)}
                title={peerAvailabilityLabel(conversationPeer)}
              ></span>
            {/if}
          </span>
          <span class="conversation-copy">
            <strong>
              {conversationTitle(conversation)}
              {#if conversation.pinned}<small class="inline-flag">置顶</small>{/if}
              {#if conversation.muted}<small class="inline-flag">免扰</small>{/if}
              {#if conversation.archived}<small class="inline-flag">归档</small>{/if}
              {#if mentionedConversationIds.includes(conversation.id)}<small class="inline-flag mention-flag">@我</small>{/if}
              {#if conversationTodoCount > 0}<small class="inline-flag todo-flag">待办 {conversationTodoCount}</small>{/if}
              {#if conversationFailedOutboxCount > 0}
                <small class="inline-flag outbox-flag failed">失败 {conversationFailedOutboxCount}</small>
              {:else if conversationOutboxCount > 0}
                <small class="inline-flag outbox-flag">待发 {conversationOutboxCount}</small>
              {/if}
            </strong>
            <small>
              {#if conversation.draft_preview}
                <span class="draft-label">草稿</span>{draftPreviewText(conversation)}
              {:else if typingPreview}
                <span class="typing-label">输入中</span>{typingPreview}
              {:else if conversation.last_message_preview}
                {latestPreviewText(conversation)}
              {:else}
                {conversation.unread_count > 0 ? `${conversation.unread_count} 条未读` : "最近消息已同步"}
              {/if}
            </small>
          </span>
        </button>
        <span class="conversation-side">
          <time>{formatTime(conversation.last_message_at)}</time>
          {#if conversation.unread_count > 0}
            <span
              class:muted={conversation.muted}
              class="unread-badge"
              aria-label={`${conversationTitle(conversation)} ${conversation.unread_count} 条未读`}
              title={conversation.muted ? "免扰未读" : "未读消息"}
            >
              {conversation.muted ? "" : conversation.unread_count > 99 ? "99+" : conversation.unread_count}
            </span>
          {/if}
        </span>
      </article>
    {:else}
      <p class="empty-note">暂无会话。到联系人页选择联系人即可开始聊天。</p>
    {/each}
  </div>
  </div>
  {:else}
  <div class="column-page contacts-page">
    <div class="sidebar-command-bar">
      <div>
        <strong>联系人发现</strong>
        <small>{contactGroupCount || 1} 个分组 · 支持按用户名、主机名、IP 地址搜索</small>
      </div>
    </div>

    <div class="contact-filter-tabs sidebar-contact-filter visually-hidden-filter" role="tablist" aria-label="联系人筛选">
      {#each contactFilterItems as item}
        <button
          class:active={contactFilter === item.id}
          type="button"
          role="tab"
          aria-selected={contactFilter === item.id}
          on:click={() => (contactFilter = item.id)}
        >
          {item.label}
          <small>{item.count}</small>
        </button>
      {/each}
    </div>

    <div class="section-heading peer-heading">
      <span>联系人</span>
      <small>显示 {visibleContactPeers.length}/{contactPeers.length}</small>
    </div>

    <div class="peer-quick-list" role="list" aria-label="联系人列表">
      {#each visibleContactGroups as group (group.label)}
        <section class="peer-quick-group" role="group" aria-label={`联系人分组 ${group.label}`}>
          <header class="peer-quick-group-head">
            <span>{group.label}</span>
            <small>{group.peers.length}</small>
          </header>
          {#each group.peers as peer (peer.peer_id)}
            <article
              class:active={`direct:${peer.peer_id}` === activeConversation}
              class:offline={peer.status !== "online"}
              class="peer-quick-row"
              role="listitem"
              on:contextmenu={(event) => onPeerContext(peer, event)}
            >
              <button
                class="peer-quick-chat"
                type="button"
                aria-label={`与 ${displayPeerName(peer)} 聊天`}
                title={`与 ${displayPeerName(peer)} 聊天`}
                on:click={() => onSelectConversation(`direct:${peer.peer_id}`)}
              >
                <span class="peer-quick-avatar">{displayPeerName(peer).slice(0, 1)}</span>
                <span class="peer-quick-copy">
                  <strong>
                    {displayPeerName(peer)}
                    {#if metadataFor(peer.peer_id).favorite}<small class="inline-flag">收藏</small>{/if}
                  </strong>
                  <small>{peerDetailLine(peer)}</small>
                </span>
                <span
                  class:online={peer.status === "online"}
                  class:offline={peer.status !== "online"}
                  class="presence-dot"
                  aria-label={`${displayPeerName(peer)} ${peerAvailabilityLabel(peer)}`}
                  title={peerAvailabilityLabel(peer)}
                ></span>
              </button>
              <button class="peer-detail-action" type="button" aria-label={`查看 ${displayPeerName(peer)} 资料`} title={`查看 ${displayPeerName(peer)} 资料`} on:click={() => onOpenPeerDetails(peer)}>
                <UserRound size={14} />
              </button>
            </article>
          {/each}
        </section>
      {:else}
        <div class="empty-action-note compact">
          <p class="empty-note compact">
            <UserRound size={14} />
            暂无联系人。
          </p>
        </div>
      {/each}
    </div>
  </div>
  {/if}
</section>
