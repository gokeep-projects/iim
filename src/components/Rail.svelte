<script lang="ts">
  import Bell from "lucide-svelte/icons/bell";
  import FolderArchive from "lucide-svelte/icons/folder-archive";
  import MessageSquareText from "lucide-svelte/icons/message-square-text";
  import Moon from "lucide-svelte/icons/moon";
  import Settings from "lucide-svelte/icons/settings";
  import Sun from "lucide-svelte/icons/sun";
  import Users from "lucide-svelte/icons/users";

  export type Section = "messages" | "contacts" | "files" | "settings" | "notifications" | "search";

  export let activeSection: Section = "messages";
  export let dark = false;
  export let notificationReady = false;
  export let unreadCount = 0;
  export let onSelect: (section: Section) => void = () => {};
  export let onOpenNotifications: () => void = () => onSelect("notifications");
  export let onToggleTheme: () => void = () => {};

  $: unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  const items: Array<{ id: Section; label: string; title: string; icon: typeof MessageSquareText }> = [
    { id: "messages", label: "消息", title: "消息", icon: MessageSquareText },
    { id: "contacts", label: "联系人", title: "联系人", icon: Users },
    { id: "files", label: "文件", title: "文件传输", icon: FolderArchive },
    { id: "settings", label: "设置", title: "设置", icon: Settings }
  ];
</script>

<aside class="rail" role="navigation" aria-label="主导航">
  <div class="brand" aria-label="灵犀内网通">灵</div>

  {#each items as item}
    <button
      class:active={activeSection === item.id || (activeSection === "search" && item.id === "messages")}
      class="rail-button"
      type="button"
      title={item.title}
      aria-current={activeSection === item.id ? "page" : undefined}
      on:click={() => onSelect(item.id)}
    >
      <svelte:component this={item.icon} size={18} />
      <span>{item.label}</span>
      {#if item.id === "messages" && unreadCount > 0}
        <small class="rail-unread-badge" aria-label={`${unreadCount} 条未读消息`}>{unreadLabel}</small>
      {/if}
    </button>
  {/each}

  <button
    class:active={activeSection === "notifications"}
    class:ready={notificationReady}
    class="rail-button"
    type="button"
    title="通知"
    aria-current={activeSection === "notifications" ? "page" : undefined}
    on:click={onOpenNotifications}
  >
    <Bell size={18} />
    <span>通知</span>
  </button>

  <div class="rail-spacer"></div>

  <button class="rail-button" type="button" title="切换主题" on:click={onToggleTheme}>
    {#if dark}
      <Sun size={18} />
      <span>浅色</span>
    {:else}
      <Moon size={18} />
      <span>深色</span>
    {/if}
  </button>
</aside>
