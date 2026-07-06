import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./api";
import {
  replaceMessageInList,
  syncFavoriteMessageList,
  syncOutboxMessageList,
  syncPinnedMessageList,
  syncTodoMessageList,
  upsertMessageInList,
} from "./messageCollections";

function message(id: string, patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    conversation_id: "direct:demo-peer",
    sender_id: "local-demo",
    body: "body",
    attachments: [],
    created_at: 1,
    status: "delivered",
    recalled: false,
    quote: null,
    favorited: false,
    reactions: [],
    ...patch,
  };
}

describe("message collection helpers", () => {
  it("upserts changed messages without duplicating existing entries", () => {
    const updated = message("m1", { body: "updated" });

    expect(upsertMessageInList([message("m1")], updated)).toEqual([updated]);
    expect(upsertMessageInList([], updated)).toEqual([updated]);
  });

  it("removes a recalled or unfavorited message from the favorite cache", () => {
    const favorite = message("m1", { favorited: true });
    const recalled = message("m1", { favorited: false, recalled: true, body: "" });

    expect(syncFavoriteMessageList([], favorite)).toEqual([favorite]);
    expect(syncFavoriteMessageList([favorite], recalled)).toEqual([]);
  });

  it("syncs pinned messages without keeping recalled entries", () => {
    const pinned = message("m1");
    const recalled = message("m1", { recalled: true, body: "" });

    expect(syncPinnedMessageList([], pinned, true)).toEqual([pinned]);
    expect(syncPinnedMessageList([pinned], recalled, true)).toEqual([]);
    expect(syncPinnedMessageList([pinned], pinned, false)).toEqual([]);
  });

  it("syncs todo messages without keeping recalled entries", () => {
    const todo = message("m1");
    const recalled = message("m1", { recalled: true, body: "" });

    expect(syncTodoMessageList([], todo, true)).toEqual([todo]);
    expect(syncTodoMessageList([todo], recalled, true)).toEqual([]);
    expect(syncTodoMessageList([todo], todo, false)).toEqual([]);
  });

  it("syncs outbox messages until they leave retryable states", () => {
    const failed = message("m1", { status: "failed" });
    const queued = message("m1", { status: "queued" });
    const delivered = message("m1", { status: "delivered" });
    const recalled = message("m1", { recalled: true, status: "failed" });

    expect(syncOutboxMessageList([], failed)).toEqual([failed]);
    expect(syncOutboxMessageList([failed], queued)).toEqual([queued]);
    expect(syncOutboxMessageList([queued], delivered)).toEqual([]);
    expect(syncOutboxMessageList([failed], recalled)).toEqual([]);
  });

  it("only replaces messages already present in a derived search list", () => {
    const existing = message("m1");
    const updated = message("m1", { body: "updated" });

    expect(replaceMessageInList([existing], updated)).toEqual([updated]);
    expect(replaceMessageInList([], updated)).toEqual([]);
  });
});
