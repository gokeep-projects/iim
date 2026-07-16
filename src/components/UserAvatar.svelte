<script lang="ts">
  export let name = "联系人";
  export let seed = "default";
  export let image = "";
  export let size = 38;
  export let group = false;
  export let status: "online" | "away" | "offline" | "" = "";

  const palettes = [
    ["#d8e9e1", "#245a45"],
    ["#dce6f2", "#315675"],
    ["#eee2d5", "#745337"],
    ["#e7dff0", "#5c4672"],
    ["#f0dfdf", "#75484b"],
    ["#dcebed", "#315e64"],
    ["#e7e4d7", "#615b36"],
    ["#dfe4ed", "#475873"]
  ];

  function hashValue(value: string) {
    let hash = 0;
    for (const char of value) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
    return hash;
  }

  function initials(value: string) {
    const clean = value.trim().replace(/\s+/g, " ");
    if (!clean) return "友";
    const parts = clean.split(" ").filter(Boolean);
    if (parts.length > 1) return `${Array.from(parts[0])[0] ?? ""}${Array.from(parts.at(-1) ?? "")[0] ?? ""}`.toUpperCase();
    const chars = Array.from(clean);
    return chars.slice(0, 2).join("").toUpperCase();
  }

  $: palette = palettes[hashValue(seed || name) % palettes.length];
  $: label = group ? "群" : initials(name);
</script>

<span
  class:group
  class="user-avatar"
  style={`--avatar-size:${size}px;--avatar-bg:${palette[0]};--avatar-fg:${palette[1]}`}
  aria-hidden="true"
>
  {#if image}
    <img src={image} alt="" />
  {:else}
    <span class="avatar-label">{label}</span>
  {/if}
  {#if status}
    <span class:online={status === "online"} class:away={status === "away"} class="avatar-presence"></span>
  {/if}
</span>

<style>
  .user-avatar {
    position: relative;
    display: inline-grid;
    flex: 0 0 var(--avatar-size);
    width: var(--avatar-size);
    height: var(--avatar-size);
    place-items: center;
    overflow: visible;
    border-radius: 7px;
    color: var(--avatar-fg);
    background: var(--avatar-bg);
    font-size: calc(var(--avatar-size) * 0.34);
    font-weight: 650;
    line-height: 1;
    user-select: none;
  }

  .user-avatar.group {
    border-radius: 8px;
    background-image:
      linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px);
    background-position: center;
    background-size: 50% 50%;
  }

  .avatar-label {
    display: block;
    max-width: calc(var(--avatar-size) - 8px);
    overflow: hidden;
    white-space: nowrap;
  }

  img {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
  }

  .avatar-presence {
    position: absolute;
    right: -2px;
    bottom: -2px;
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    border: 2px solid var(--avatar-status-ring, #fff);
    border-radius: 50%;
    background: #a5abb2;
  }

  .avatar-presence.online {
    background: #16a461;
  }

  .avatar-presence.away {
    background: #e9a23b;
  }
</style>
