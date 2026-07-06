const allHandsMentionNames = new Set(["所有人", "全体成员", "all", "everyone"]);

function directMentionNamesForSelf(selfPeerId: string, selfDisplayName = "", senderLabels: Record<string, string> = {}) {
  return ["我", selfPeerId, selfDisplayName, senderLabels[selfPeerId]]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean);
}

export function mentionNamesForSelf(selfPeerId: string, selfDisplayName = "", senderLabels: Record<string, string> = {}) {
  return new Set([...directMentionNamesForSelf(selfPeerId, selfDisplayName, senderLabels), ...allHandsMentionNames]);
}

export function messageMentionsSelf(
  body: string,
  selfPeerId: string,
  selfDisplayName = "",
  senderLabels: Record<string, string> = {},
  includeAllHands = true
) {
  const names = new Set(directMentionNamesForSelf(selfPeerId, selfDisplayName, senderLabels));
  if (includeAllHands) {
    for (const name of allHandsMentionNames) {
      names.add(name);
    }
  }
  if (names.size === 0) return false;
  for (const match of body.matchAll(/@([^\s@,.;:!?，。！？、]{1,64})/gu)) {
    const mention = match[1].trim().toLowerCase();
    if (names.has(mention)) return true;
  }
  return false;
}
