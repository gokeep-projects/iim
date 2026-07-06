import { describe, expect, it } from "vitest";
import { mentionNamesForSelf, messageMentionsSelf } from "./messageMentions";

describe("messageMentionsSelf", () => {
  it("matches self display names and sender labels after an at sign", () => {
    expect(messageMentionsSelf("please check @Alice", "local-peer", "Alice")).toBe(true);
    expect(messageMentionsSelf("please check @Me", "local-peer", "", { "local-peer": "Me" })).toBe(true);
  });

  it("does not match ordinary words that only contain the display name", () => {
    expect(messageMentionsSelf("Alice please check", "local-peer", "Alice")).toBe(false);
    expect(messageMentionsSelf("@Bob please check", "local-peer", "Alice")).toBe(false);
  });

  it("treats all-hands mentions as mentioning the local user", () => {
    expect(messageMentionsSelf("notice @所有人 please sync", "local-peer", "Alice")).toBe(true);
    expect(messageMentionsSelf("notice @全体成员 please sync", "local-peer", "Alice")).toBe(true);
    expect(messageMentionsSelf("notice @everyone please sync", "local-peer", "Alice")).toBe(true);
  });

  it("can ignore all-hands aliases outside group conversations", () => {
    expect(messageMentionsSelf("notice @everyone please sync", "local-peer", "Alice", {}, false)).toBe(false);
    expect(messageMentionsSelf("notice @Alice please sync", "local-peer", "Alice", {}, false)).toBe(true);
  });
});

describe("mentionNamesForSelf", () => {
  it("includes stable fallback aliases for the local user", () => {
    expect(mentionNamesForSelf("local-peer", "Alice", { "local-peer": "Me" })).toEqual(
      new Set(["我", "local-peer", "alice", "me", "所有人", "全体成员", "all", "everyone"])
    );
  });
});
