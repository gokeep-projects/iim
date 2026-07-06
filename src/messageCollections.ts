import type { ChatMessage } from "./api";

export function upsertMessageInList(list: ChatMessage[], message: ChatMessage) {
  return list.some((item) => item.id === message.id)
    ? list.map((item) => (item.id === message.id ? message : item))
    : [message, ...list];
}

export function replaceMessageInList(list: ChatMessage[], message: ChatMessage) {
  return list.map((item) => (item.id === message.id ? message : item));
}

export function syncFavoriteMessageList(list: ChatMessage[], message: ChatMessage) {
  return message.favorited
    ? upsertMessageInList(list, message)
    : list.filter((item) => item.id !== message.id);
}

export function syncPinnedMessageList(list: ChatMessage[], message: ChatMessage, pinned: boolean) {
  if (message.recalled || !pinned) {
    return list.filter((item) => item.id !== message.id);
  }
  return upsertMessageInList(list, message);
}

export function syncTodoMessageList(list: ChatMessage[], message: ChatMessage, todo: boolean) {
  if (message.recalled || !todo) {
    return list.filter((item) => item.id !== message.id);
  }
  return upsertMessageInList(list, message);
}

export function syncOutboxMessageList(list: ChatMessage[], message: ChatMessage) {
  if (message.recalled || !["queued", "sending", "failed"].includes(message.status)) {
    return list.filter((item) => item.id !== message.id);
  }
  return upsertMessageInList(list, message);
}
