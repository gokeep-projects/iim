<script lang="ts">
  import { onDestroy } from "svelte";
  import Archive from "lucide-svelte/icons/archive";
  import AtSign from "lucide-svelte/icons/at-sign";
  import BellOff from "lucide-svelte/icons/bell-off";
  import CheckSquare from "lucide-svelte/icons/check-square";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import Search from "lucide-svelte/icons/search";
  import MessageSquare from "lucide-svelte/icons/message-square";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import Send from "lucide-svelte/icons/send";
  import TriangleAlert from "lucide-svelte/icons/triangle-alert";
  import UserRound from "lucide-svelte/icons/user-round";
  import type { ContactMetadata, ConversationSummary, PeerProfile } from "../api";
  import { directConversationPeer, visibleUnreadCount } from "../conversationState";
  import UserAvatar from "./UserAvatar.svelte";

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
  export let refreshingPeers = false;
  export let onSelectConversation: (id: string) => void | Promise<void> = () => {};
  export let onRefreshPeers: () => boolean | void | Promise<boolean | void> = () => {};
  export let onMarkAllRead: () => void | Promise<void> = () => {};
  export let onConversationContext: (conversation: ConversationSummary, event: MouseEvent) => void = () => {};
  export let onPeerContext: (peer: PeerProfile, event: MouseEvent) => void = () => {};
  export let onOpenPeerDetails: (peer: PeerProfile) => void = () => {};

  type ColumnMode = "conversations" | "contacts";
  type SidebarSearchSuggestion =
    | {
        id: string;
        kind: "conversation";
        kindLabel: string;
        title: string;
        subtitle: string;
        meta: string;
        conversationId: string;
      }
    | {
        id: string;
        kind: "contact";
        kindLabel: string;
        title: string;
        subtitle: string;
        meta: string;
        peer: PeerProfile;
      };
  let columnMode: ColumnMode = "conversations";
  let localRefreshing = false;
  let refreshCompleted = false;
  let refreshFailed = false;
  let refreshCompletedTimer: number | null = null;
  let sidebarSearchQuery = "";
  let sidebarSearchOpen = false;
  let sidebarSearchActiveIndex = 0;
  let sidebarSearchInputElement: HTMLInputElement | null = null;
  let visibleConversationLimit = 30;
  let visibleContactLimit = 40;
  const conversationPageSize = 30;
  const contactPageSize = 40;

  $: unreadCount = visibleUnreadCount(conversations);
  $: filteredConversations = conversations.filter((conversation) => !conversation.archived);
  $: sortedConversations = [...filteredConversations].sort(conversationPrioritySort);
  $: visibleConversations = sortedConversations.slice(0, visibleConversationLimit);
  $: contactPeers = peers.filter((peer) => peer.peer_id !== self?.peer_id && !metadataFor(peer.peer_id).blocked);
  $: sortedContactPeers = [...contactPeers]
    .sort((a, b) => {
      const aMeta = metadataFor(a.peer_id);
      const bMeta = metadataFor(b.peer_id);
      return (
        Number(bMeta.favorite) - Number(aMeta.favorite) ||
        Number(b.status === "online") - Number(a.status === "online") ||
        displayPeerName(a).localeCompare(displayPeerName(b), "zh-CN")
      );
    });
  $: visibleContactPeers = sortedContactPeers.slice(0, visibleContactLimit);
  $: reachablePeerCount = contactPeers.filter((peer) => peer.status === "online").length;
  $: sidebarSearchNeedle = sidebarSearchQuery.trim().toLowerCase();
  $: sidebarSearchSuggestions = buildSidebarSearchSuggestions(
    sidebarSearchNeedle,
    visibleConversations,
    contactPeers
  );
  $: if (sidebarSearchActiveIndex >= sidebarSearchSuggestions.length) {
    sidebarSearchActiveIndex = Math.max(0, sidebarSearchSuggestions.length - 1);
  }

  function metadataFor(peerId: string) {
    return contactMetadata[peerId] ?? { peer_id: peerId, remark: "", group_name: "", favorite: false, blocked: false };
  }

  function displayPeerName(peer: PeerProfile) {
    return metadataFor(peer.peer_id).remark.trim() || peer.display_name || peer.hostname || peer.peer_id;
  }

  function contactListTitle(peer: PeerProfile) {
    return metadataFor(peer.peer_id).remark.trim() || peer.hostname || peer.display_name || peer.peer_id;
  }

  function peerForConversation(conversation: ConversationSummary) {
    return directConversationPeer(conversation, peers);
  }

  function conversationTitle(conversation: ConversationSummary) {
    const peer = peerForConversation(conversation);
    const title = peer ? displayPeerName(peer) : conversation.title.trim();
    if (title) return title;
    if (conversation.id.startsWith("group:")) return `群聊 ${conversation.id.slice(-4).toUpperCase()}`;
    return "本地会话";
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
    return privacyMode ? "有草稿" : conversation.draft_preview;
  }

  function latestPreviewText(conversation: ConversationSummary) {
    if (!conversation.last_message_preview) return "";
    return privacyMode ? "消息已隐藏" : conversation.last_message_preview;
  }

  function peerAvailabilityLabel(peer: PeerProfile) {
    return peer.status === "online" ? "可联系" : "暂不可达";
  }

  function peerDetailLine(peer: PeerProfile) {
    const endpoint = peer.endpoints[0]?.replace(/:\d+$/, "") || "等待 IP";
    const alias = peer.display_name && peer.display_name !== contactListTitle(peer) ? peer.display_name : "";
    return [endpoint, alias].filter(Boolean).join(" · ");
  }

  function conversationEndpointLabel(conversation: ConversationSummary) {
    return peerForConversation(conversation)?.endpoints[0]?.replace(/:\d+$/, "") ?? (conversation.id.startsWith("group:") ? "群聊" : "本地会话");
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

  function buildSidebarSearchSuggestions(
    needle: string,
    conversationList: ConversationSummary[],
    peerList: PeerProfile[]
  ): SidebarSearchSuggestion[] {
    if (!needle) return [];
    const conversationSuggestions = conversationList
      .filter((conversation) => conversationSearchText(conversation).includes(needle))
      .slice(0, 4)
      .map((conversation) => ({
        id: `conversation:${conversation.id}`,
        kind: "conversation" as const,
        kindLabel: "聊天记录",
        title: conversationTitle(conversation),
        subtitle: latestPreviewText(conversation) || conversationEndpointLabel(conversation),
        meta: conversationEndpointLabel(conversation),
        conversationId: conversation.id
      }));
    const contactSuggestions = peerList
      .filter((peer) => contactSearchText(peer).includes(needle))
      .slice(0, 4)
      .map((peer) => ({
        id: `contact:${peer.peer_id}`,
        kind: "contact" as const,
        kindLabel: "联系人",
        title: contactListTitle(peer),
        subtitle: peerDetailLine(peer),
        meta: peer.status === "online" ? "在线可联系" : "暂不可达",
        peer
      }));
    return [...conversationSuggestions, ...contactSuggestions].slice(0, 8);
  }

  function updateSidebarSearch(value: string) {
    sidebarSearchQuery = value;
    sidebarSearchOpen = Boolean(value.trim());
    sidebarSearchActiveIndex = 0;
  }

  function moveSidebarSearchSelection(offset: number) {
    if (sidebarSearchSuggestions.length === 0) return;
    sidebarSearchActiveIndex =
      (sidebarSearchActiveIndex + offset + sidebarSearchSuggestions.length) % sidebarSearchSuggestions.length;
  }

  async function selectSidebarSearchSuggestion(suggestion: SidebarSearchSuggestion) {
    sidebarSearchOpen = false;
    sidebarSearchQuery = "";
    sidebarSearchActiveIndex = 0;
    if (suggestion.kind === "conversation") {
      await onSelectConversation(suggestion.conversationId);
    } else {
      await onSelectConversation(`direct:${suggestion.peer.peer_id}`);
    }
  }

  async function handleSidebarSearchKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      sidebarSearchOpen = true;
      moveSidebarSearchSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      sidebarSearchOpen = true;
      moveSidebarSearchSelection(-1);
    } else if (event.key === "Enter") {
      const suggestion = sidebarSearchSuggestions[sidebarSearchActiveIndex];
      if (!suggestion) return;
      event.preventDefault();
      await selectSidebarSearchSuggestion(suggestion);
    } else if (event.key === "Escape") {
      sidebarSearchOpen = false;
    }
  }

  function blurSidebarSearch() {
    window.setTimeout(() => {
      sidebarSearchOpen = false;
    }, 120);
  }


  function delay(milliseconds: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function handleRefreshPeers() {
    if (localRefreshing || refreshingPeers) return;
    refreshCompleted = false;
    refreshFailed = false;
    if (refreshCompletedTimer !== null) {
      window.clearTimeout(refreshCompletedTimer);
      refreshCompletedTimer = null;
    }
    localRefreshing = true;
    try {
      const [succeeded] = await Promise.all([
        Promise.resolve(onRefreshPeers()).then((result) => result !== false).catch(() => false),
        delay(1000)
      ]);
      refreshCompleted = succeeded;
      refreshFailed = !succeeded;
      refreshCompletedTimer = window.setTimeout(() => {
        refreshCompleted = false;
        refreshFailed = false;
        refreshCompletedTimer = null;
      }, 1200);
    } finally {
      localRefreshing = false;
    }
  }

  onDestroy(() => {
    if (refreshCompletedTimer !== null) {
      window.clearTimeout(refreshCompletedTimer);
    }
  });

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
  <div class="search-shell sidebar-global-search sidebar-search-panel">
    <label class="search-box">
      <Search size={14} />
      <input
        bind:this={sidebarSearchInputElement}
        aria-controls="sidebar-search-suggestions"
        aria-expanded={sidebarSearchOpen && sidebarSearchNeedle ? "true" : "false"}
        aria-label="搜索联系人或会话"
        autocomplete="off"
        placeholder="联系人 / 聊天记录"
        role="combobox"
        value={sidebarSearchQuery}
        on:blur={blurSidebarSearch}
        on:focus={() => (sidebarSearchOpen = Boolean(sidebarSearchQuery.trim()))}
        on:input={(event) => updateSidebarSearch((event.currentTarget as HTMLInputElement).value)}
        on:keydown={handleSidebarSearchKeydown}
      />
    </label>
    {#if sidebarSearchOpen && sidebarSearchNeedle}
      <div id="sidebar-search-suggestions" class="search-suggestions sidebar-search-suggestions" role="listbox" aria-label="搜索建议">
        {#each sidebarSearchSuggestions as suggestion, index (suggestion.id)}
          <button
            class:active={index === sidebarSearchActiveIndex}
            type="button"
            role="option"
            aria-selected={index === sidebarSearchActiveIndex}
            on:mouseenter={() => (sidebarSearchActiveIndex = index)}
            on:mousedown|preventDefault
            on:click={() => selectSidebarSearchSuggestion(suggestion)}
          >
            <span class={`suggestion-kind ${suggestion.kind}`}>{suggestion.kindLabel}</span>
            <span class="suggestion-copy">
              <strong>{suggestion.title}</strong>
              <small>{suggestion.subtitle}</small>
            </span>
            <span class="suggestion-meta">{suggestion.meta}</span>
          </button>
        {:else}
          <div class="search-empty" role="status">
            <strong>没有匹配结果</strong>
            <span>可输入用户名、备注、主机名或 IP 地址。</span>
          </div>
        {/each}
      </div>
    {/if}
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
      {#if unreadCount > 0}<small class="visually-hidden">{unreadCount}</small>{/if}
    </button>
    <button
      class:active={columnMode === "contacts"}
      type="button"
      role="tab"
      aria-selected={columnMode === "contacts"}
      on:click={() => (columnMode = "contacts")}
    >
      <UserRound size={14} />
      <span>联系人</span>
      <small class="tab-count">{contactPeers.length}</small>
    </button>
    <button
      class:done={refreshCompleted && !refreshingPeers && !localRefreshing}
      class:failed={refreshFailed && !refreshingPeers && !localRefreshing}
      class:refreshing={refreshingPeers || localRefreshing}
      class="sidebar-refresh-button contact-tab-refresh"
      type="button"
      on:click={handleRefreshPeers}
      title="刷新联系人"
      aria-label="刷新联系人"
      aria-busy={refreshingPeers || localRefreshing}
      disabled={refreshingPeers || localRefreshing}
    >
      <RefreshCw size={13} />
      <span>{refreshingPeers || localRefreshing ? "刷新中" : refreshCompleted ? "已刷新" : refreshFailed ? "刷新失败" : "刷新"}</span>
    </button>
  </div>

  {#if columnMode === "conversations"}
  <div class="column-page conversation-page">
  {#if unreadCount > 0}
    <button class="section-compact-action visually-hidden" type="button" on:click={onMarkAllRead}>
      全部已读
    </button>
  {/if}
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
        class:pinned={conversation.pinned}
        class="conversation-item"
        on:contextmenu={(event) => onConversationContext(conversation, event)}
      >
        <button class="conversation-main-button" type="button" on:click={() => onSelectConversation(conversation.id)}>
          <span
            class:group={conversation.id.startsWith("group:")}
            class:online={conversationPeer?.status === "online"}
            class:offline={Boolean(conversationPeer) && conversationPeer?.status !== "online"}
            class="conversation-avatar-cell"
            aria-label={conversation.id.startsWith("group:") ? `${conversationTitle(conversation)} 群聊头像` : conversationPresenceLabel(conversation)}
            title={conversationPeer ? peerAvailabilityLabel(conversationPeer) : undefined}
          >
            <UserAvatar
              name={conversationTitle(conversation)}
              seed={conversation.id}
              group={conversation.id.startsWith("group:")}
              status={conversationPeer?.status ?? ""}
              size={40}
            />
          </span>
	          <span class="conversation-copy">
	            <span class="conversation-title-line">
	              <strong>{conversationTitle(conversation)}</strong>
	              <span class="conversation-state-strip" aria-label="会话状态">
	                {#if conversation.muted}
	                  <span class="conversation-state-chip muted" title="免打扰" aria-label="免打扰">
	                    <BellOff size={11} />
	                  </span>
	                {/if}
	                {#if conversation.archived}
	                  <span class="conversation-state-chip archived" title="已归档" aria-label="已归档">
	                    <Archive size={11} />
	                  </span>
	                {/if}
	                {#if mentionedConversationIds.includes(conversation.id)}
	                  <span class="conversation-state-chip mention" title="@我" aria-label="@我">
	                    <AtSign size={11} />
	                  </span>
	                {/if}
	                {#if conversationTodoCount > 0}
	                  <span class="conversation-state-chip todo" title={`${conversationTodoCount} 个待办`} aria-label={`${conversationTodoCount} 个待办`}>
	                    <CheckSquare size={11} />
	                    <b>{conversationTodoCount}</b>
	                  </span>
	                {/if}
	                {#if conversationFailedOutboxCount > 0}
	                  <span class="conversation-state-chip outbox failed" title={`${conversationFailedOutboxCount} 条发送失败`} aria-label={`${conversationFailedOutboxCount} 条发送失败`}>
	                    <TriangleAlert size={11} />
	                    <b>{conversationFailedOutboxCount}</b>
	                  </span>
	                {:else if conversationOutboxCount > 0}
	                  <span class="conversation-state-chip outbox" title={`${conversationOutboxCount} 条待发送`} aria-label={`${conversationOutboxCount} 条待发送`}>
	                    <Send size={11} />
	                    <b>{conversationOutboxCount}</b>
	                  </span>
	                {/if}
	              </span>
	            </span>
            <small>
              {#if conversation.draft_preview}
                <span class="draft-label">草稿</span><span class="conversation-preview-text">{draftPreviewText(conversation)}</span>
              {:else if typingPreview}
                <span class="typing-label">输入中</span><span class="conversation-preview-text">{typingPreview}</span>
              {:else if conversation.last_message_preview}
                <span class="conversation-preview-text">{latestPreviewText(conversation)}</span>
              {:else}
                <span class="conversation-preview-text">最近消息已同步</span>
              {/if}
            </small>
          </span>
        </button>
        <span class="conversation-side">
          <time>{formatTime(conversation.last_message_at)}</time>
          {#if conversation.unread_count > 0}
            <span
              class:muted={conversation.muted}
              class:manual={conversation.manual_unread}
              class="unread-badge visually-hidden"
              aria-label={`${conversationTitle(conversation)} ${conversation.manual_unread ? "已标为未读" : `${conversation.unread_count} 条未读`}`}
              title={conversation.manual_unread ? "手动标为未读" : conversation.muted ? "免扰未读" : "未读消息"}
            >
              {#if conversation.manual_unread}
                <span class="unread-dot" aria-hidden="true"></span>
              {:else}
                {conversation.muted ? "" : conversation.unread_count > 99 ? "99+" : conversation.unread_count}
              {/if}
            </span>
          {/if}
        </span>
      </article>
    {:else}
      <p class="empty-note">暂无会话。到联系人页选择联系人即可开始聊天。</p>
    {/each}
    {#if visibleConversations.length < sortedConversations.length}
      <button class="list-load-more" type="button" on:click={() => (visibleConversationLimit += conversationPageSize)}>
        <ChevronDown size={14} />
        加载更多会话
      </button>
    {/if}
  </div>
  </div>
  {:else}
  <div class="column-page contacts-page">
    <div class="peer-quick-list" role="list" aria-label="联系人列表">
      {#each visibleContactPeers as peer (peer.peer_id)}
        <article
          class:active={`direct:${peer.peer_id}` === activeConversation}
          class:offline={peer.status !== "online"}
          class="sidebar-contact-row"
          role="listitem"
          on:contextmenu={(event) => onPeerContext(peer, event)}
        >
          <button
            class="sidebar-contact-main"
            type="button"
            aria-label={`与 ${contactListTitle(peer)} 聊天`}
            title={`与 ${contactListTitle(peer)} 聊天`}
            on:click={() => onSelectConversation(`direct:${peer.peer_id}`)}
          >
            <span
              class:online={peer.status === "online"}
              class:offline={peer.status !== "online"}
              class="sidebar-contact-avatar"
              aria-label={`${contactListTitle(peer)} ${peerAvailabilityLabel(peer)}`}
              title={peerAvailabilityLabel(peer)}
            >
              <UserAvatar name={contactListTitle(peer)} seed={peer.peer_id} status={peer.status} size={38} />
            </span>
            <span class="sidebar-contact-copy">
              <strong>
                {contactListTitle(peer)}
                {#if metadataFor(peer.peer_id).favorite}<small class="inline-flag">收藏</small>{/if}
              </strong>
              <small>{peerDetailLine(peer)}</small>
            </span>
          </button>
          <button class="sidebar-contact-detail" type="button" aria-label={`查看 ${contactListTitle(peer)} 资料`} title={`查看 ${contactListTitle(peer)} 资料`} on:click={() => onOpenPeerDetails(peer)}>
            <UserRound size={14} />
          </button>
        </article>
      {:else}
        <div class="empty-action-note compact">
          <p class="empty-note compact">
            <UserRound size={14} />
            暂无联系人。
          </p>
        </div>
      {/each}
      {#if visibleContactPeers.length < sortedContactPeers.length}
        <button class="list-load-more" type="button" on:click={() => (visibleContactLimit += contactPageSize)}>
          <ChevronDown size={14} />
          加载更多联系人
        </button>
      {/if}
    </div>
  </div>
  {/if}
</section>
