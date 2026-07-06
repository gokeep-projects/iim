<script lang="ts">
  import Archive from "lucide-svelte/icons/archive";
  import BellOff from "lucide-svelte/icons/bell-off";
  import Edit3 from "lucide-svelte/icons/edit-3";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import Pin from "lucide-svelte/icons/pin";
  import PinOff from "lucide-svelte/icons/pin-off";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Search from "lucide-svelte/icons/search";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import UserRound from "lucide-svelte/icons/user-round";
  import Volume2 from "lucide-svelte/icons/volume-2";
  import type { ContactMetadata, ConversationSummary, PeerProfile } from "../api";
  import { directConversationPeer, filterConversationSummaries, visibleUnreadCount, type ConversationFilter } from "../conversationState";

  export let self: PeerProfile | null = null;
  export let peers: PeerProfile[] = [];
  export let contactMetadata: Record<string, ContactMetadata> = {};
  export let conversations: ConversationSummary[] = [];
  export let activeConversation = "";
  export let filter: ConversationFilter = "active";
  export let query = "";
  export let focusSearchToken = 0;
  export let mentionedConversationIds: string[] = [];
  export let todoConversationCounts: Record<string, number> = {};
  export let outboxConversationCounts: Record<string, number> = {};
  export let failedOutboxConversationCounts: Record<string, number> = {};
  export let typingPreviewByConversation: Record<string, string> = {};
  export let privacyMode = false;
  export let onQueryChange: (value: string) => void = () => {};
  export let onFilterChange: (value: ConversationFilter) => void = () => {};
  export let onSearch: () => void | Promise<void> = () => {};
  export let onSelectConversation: (id: string) => void | Promise<void> = () => {};
  export let onOpenContacts: () => void = () => {};
  export let onRefreshPeers: () => void | Promise<void> = () => {};
  export let onTogglePin: (id: string) => void | Promise<void> = () => {};
  export let onToggleMute: (id: string) => void | Promise<void> = () => {};
  export let onToggleArchive: (id: string) => void | Promise<void> = () => {};
  export let onDeleteConversation: (id: string) => void | Promise<void> = () => {};
  export let onMarkAllRead: () => void | Promise<void> = () => {};
  export let onConversationContext: (conversation: ConversationSummary, event: MouseEvent) => void = () => {};
  export let onPeerContext: (peer: PeerProfile, event: MouseEvent) => void = () => {};
  export let onOpenPeerDetails: (peer: PeerProfile) => void = () => {};

  type ColumnMode = "conversations" | "contacts";
  type ContactDirectoryFilter = "all" | "online" | "favorite" | "unavailable";

  let columnMode: ColumnMode = "conversations";
  let contactFilter: ContactDirectoryFilter = "all";
  let searchInput: HTMLInputElement | null = null;
  let handledFocusSearchToken = 0;

  const filters: Array<{ id: ConversationFilter; label: string }> = [
    { id: "active", label: "当前" },
    { id: "all", label: "全部" },
    { id: "unread", label: "未读" },
    { id: "mentions", label: "@我" },
    { id: "todo", label: "待办" },
    { id: "outbox", label: "待发" },
    { id: "pinned", label: "置顶" },
    { id: "muted", label: "免扰" },
    { id: "archived", label: "归档" }
  ];

  $: contactFilterItems = [
    { id: "all", label: "全部", count: contactPeers.length },
    { id: "online", label: "可联系", count: reachablePeerCount },
    { id: "favorite", label: "收藏", count: favoritePeerCount },
    { id: "unavailable", label: "暂不可达", count: unavailablePeerCount }
  ] satisfies Array<{ id: ContactDirectoryFilter; label: string; count: number }>;

  $: normalizedQuery = query.trim().toLowerCase();
  $: filteredConversations = filterConversationSummaries(
    conversations,
    filter,
    mentionedConversationIds,
    todoConversationCounts,
    outboxConversationCounts
  );
  $: visibleConversations = normalizedQuery
    ? filteredConversations.filter((conversation) => conversationSearchText(conversation).includes(normalizedQuery))
    : filteredConversations;
  $: unreadCount = visibleUnreadCount(conversations);
  $: mentionedCount = conversations.filter((conversation) => !conversation.archived && mentionedConversationIds.includes(conversation.id)).length;
  $: todoCount = conversations.filter((conversation) => !conversation.archived && (todoConversationCounts[conversation.id] ?? 0) > 0).length;
  $: outboxCount = conversations.filter((conversation) => !conversation.archived && (outboxConversationCounts[conversation.id] ?? 0) > 0).length;
  $: mutedCount = conversations.filter((conversation) => conversation.muted && !conversation.archived).length;
  $: archivedCount = conversations.filter((conversation) => conversation.archived).length;
  $: contactPeers = peers.filter((peer) => peer.peer_id !== self?.peer_id && !metadataFor(peer.peer_id).blocked);
  $: visibleContactPeers = contactPeers
    .filter((peer) => contactMatchesFilter(peer, contactFilter))
    .filter((peer) => !normalizedQuery || contactSearchText(peer).includes(normalizedQuery))
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
  $: unavailablePeerCount = contactPeers.filter((peer) => peer.status !== "online").length;
  $: favoritePeerCount = contactPeers.filter((peer) => metadataFor(peer.peer_id).favorite).length;
  $: contactGroupCount = new Set(contactPeers.map((peer) => metadataFor(peer.peer_id).group_name.trim()).filter(Boolean)).size;
  $: contactTabLabel = `联系人 ${contactPeers.length} 人`;
  $: if (focusSearchToken > 0 && focusSearchToken !== handledFocusSearchToken) {
    handledFocusSearchToken = focusSearchToken;
    searchInput?.focus();
    searchInput?.select();
  }

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
      peer ? `${peer.display_name} ${peer.hostname} ${metadataFor(peer.peer_id).group_name}` : "",
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

  function groupedContactPeers(peerList: PeerProfile[]) {
    const groups = new Map<string, PeerProfile[]>();
    for (const peer of peerList) {
      const groupName = metadataFor(peer.peer_id).group_name.trim() || "默认分组";
      groups.set(groupName, [...(groups.get(groupName) ?? []), peer]);
    }
    return [...groups.entries()].map(([label, items]) => ({ label, peers: items }));
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

  <label class="search-box">
    <Search size={15} />
    <input
      bind:this={searchInput}
      value={query}
      placeholder="搜索会话、联系人、聊天记录"
      on:input={(event) => onQueryChange((event.currentTarget as HTMLInputElement).value)}
      on:keydown={(event) => {
        if (event.key === "Enter") {
          void onSearch();
        }
      }}
    />
  </label>

  <div class="column-actions">
    <button class="secondary-action" type="button" on:click={openContactMode} title="选择联系人开始聊天">
      <Edit3 size={15} />
      新会话
    </button>
    <button class="secondary-action" type="button" on:click={onRefreshPeers} title="刷新局域网发现">
      <RefreshCw size={15} />
      刷新
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
  <div class="conversation-filter" role="tablist" aria-label="会话筛选">
    {#each filters as item}
      <button
        class:active={filter === item.id}
        type="button"
        role="tab"
        aria-selected={filter === item.id}
        on:click={() => onFilterChange(item.id)}
      >
        {item.label}
        {#if item.id === "unread" && unreadCount > 0}<small>{unreadCount}</small>{/if}
        {#if item.id === "mentions" && mentionedCount > 0}<small>{mentionedCount}</small>{/if}
        {#if item.id === "todo" && todoCount > 0}<small>{todoCount}</small>{/if}
        {#if item.id === "outbox" && outboxCount > 0}<small>{outboxCount}</small>{/if}
        {#if item.id === "muted" && mutedCount > 0}<small>{mutedCount}</small>{/if}
        {#if item.id === "archived" && archivedCount > 0}<small>{archivedCount}</small>{/if}
      </button>
    {/each}
  </div>

  <div class="section-heading">
    <span>{filters.find((item) => item.id === filter)?.label ?? "会话"}</span>
    <span class="section-heading-actions">
      <small>{visibleConversations.length}</small>
      {#if unreadCount > 0}
        <button type="button" title="全部标为已读" on:click={onMarkAllRead}>全部已读</button>
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
        <span class="conversation-actions" aria-hidden="true">
          <button tabindex="-1" type="button" title={conversation.pinned ? "取消置顶" : "置顶"} on:click={() => onTogglePin(conversation.id)}>
            {#if conversation.pinned}<PinOff size={13} />{:else}<Pin size={13} />{/if}
          </button>
          <button tabindex="-1" type="button" title={conversation.muted ? "取消免打扰" : "免打扰"} on:click={() => onToggleMute(conversation.id)}>
            {#if conversation.muted}<Volume2 size={13} />{:else}<BellOff size={13} />{/if}
          </button>
          <button tabindex="-1" type="button" title={conversation.archived ? "取消归档" : "归档"} on:click={() => onToggleArchive(conversation.id)}>
            <Archive size={13} />
          </button>
          <button tabindex="-1" type="button" title="删除会话" on:click={() => onDeleteConversation(conversation.id)}>
            <Trash2 size={13} />
          </button>
        </span>
      </article>
    {:else}
      <p class="empty-note">
        {#if normalizedQuery}
          没有匹配的会话。按 Enter 可继续搜索本地聊天记录。
        {:else if filter === "unread"}
          暂无未读会话。
        {:else if filter === "pinned"}
          暂无置顶会话。
        {:else if filter === "todo"}
          暂无待办会话。
        {:else if filter === "outbox"}
          暂无待发送会话。
        {:else if filter === "muted"}
          暂无免扰会话。
        {:else if filter === "archived"}
          暂无归档会话。
        {:else if filter === "active"}
          暂无当前会话。归档会话可在“全部”或“归档”中查看。
        {:else}
          暂无会话。点击“新会话”从联系人开始聊天。
        {/if}
      </p>
    {/each}
  </div>
  </div>
  {:else}
  <div class="column-page contacts-page">
    <section class="contact-quick-summary" aria-label="联系人概览">
      <div class="contact-drawer-toggle contact-summary-head">
        <span>
          <strong>局域网联系人 {contactPeers.length} 人</strong>
          <small>可联系 {reachablePeerCount} · 暂不可达 {unavailablePeerCount} · 分组 {contactGroupCount}</small>
        </span>
      </div>
      <div class="contact-summary-metrics">
        <div aria-label={`局域网联系人 ${contactPeers.length} 人`}>
          <strong>{contactPeers.length}</strong>
          <span>联系人</span>
        </div>
        <div aria-label={`可联系联系人 ${reachablePeerCount} 人`}>
          <strong>{reachablePeerCount}</strong>
          <span>可联系</span>
        </div>
        <div aria-label={`暂不可达联系人 ${unavailablePeerCount} 人`}>
          <strong>{unavailablePeerCount}</strong>
          <span>暂不可达</span>
        </div>
        <div aria-label={`联系人分组 ${contactGroupCount} 个`}>
          <strong>{contactGroupCount}</strong>
          <span>分组</span>
        </div>
      </div>
      <button class="manage-contact-button" type="button" on:click={onOpenContacts}>管理联系人</button>
    </section>

    <div class="contact-filter-tabs sidebar-contact-filter" role="tablist" aria-label="联系人筛选">
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
      <span>局域网设备</span>
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
            {normalizedQuery ? "没有匹配的联系人。" : "暂未发现局域网联系人。"}
          </p>
          <button type="button" on:click={onOpenContacts}>配置网络发现</button>
        </div>
      {/each}
    </div>
  </div>
  {/if}
</section>
