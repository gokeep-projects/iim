<script lang="ts">
  import FolderArchive from "lucide-svelte/icons/folder-archive";
  import MessageSquareText from "lucide-svelte/icons/message-square-text";
  import Settings from "lucide-svelte/icons/settings";
  import Users from "lucide-svelte/icons/users";

  export type Section = "messages" | "contacts" | "files" | "settings" | "notifications";

  export let activeSection: Section = "messages";
  export let unreadCount = 0;
  export let avatarLabel = "i";
  export let avatarImage = "";
  export let onSelect: (section: Section) => void = () => {};
  export let onOpenProfileMenu: (event: MouseEvent) => void = () => {};

  $: unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  const items: Array<{ id: Section; label: string; title: string; icon: typeof MessageSquareText }> = [
    { id: "messages", label: "消息", title: "消息", icon: MessageSquareText },
    { id: "contacts", label: "联系人", title: "联系人", icon: Users },
    { id: "files", label: "文件", title: "文件传输", icon: FolderArchive },
    { id: "settings", label: "设置", title: "设置", icon: Settings }
  ];
</script>

<aside class="rail" role="navigation" aria-label="主导航">
  <button class="brand profile-brand-button" type="button" aria-label="打开个人菜单" title="个人状态" on:click={onOpenProfileMenu}>
    {#if avatarImage}
      <img src={avatarImage} alt="" />
    {:else}
      {avatarLabel}
    {/if}
  </button>

  {#each items as item}
    <button
      class:active={activeSection === item.id}
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

  <div class="rail-spacer"></div>
</aside>
