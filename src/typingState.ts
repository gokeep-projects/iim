export interface TypingIndicatorLike {
  sender_id: string;
}

export function typingIndicatorKeysForPeer<T extends TypingIndicatorLike>(
  indicators: Record<string, T>,
  peerId: string
): string[] {
  return Object.entries(indicators)
    .filter(([, indicator]) => indicator.sender_id === peerId)
    .map(([key]) => key);
}

export function removeTypingIndicatorsForPeer<T extends TypingIndicatorLike>(
  indicators: Record<string, T>,
  peerId: string
): Record<string, T> {
  const blockedKeys = new Set(typingIndicatorKeysForPeer(indicators, peerId));
  if (blockedKeys.size === 0) return indicators;
  return Object.fromEntries(Object.entries(indicators).filter(([key]) => !blockedKeys.has(key)));
}
