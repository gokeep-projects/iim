import { describe, expect, it } from "vitest";
import { messageNotificationOptions, notificationConversationId, notificationPreviewEnabled } from "./notification";

describe("messageNotificationOptions", () => {
  it("stores the target conversation id for notification click routing", () => {
    expect(messageNotificationOptions("研发一号", "收到", "direct:peer-a")).toMatchObject({
      title: "研发一号",
      body: "收到",
      group: "direct:peer-a",
      autoCancel: true,
      extra: {
        conversation_id: "direct:peer-a"
      }
    });
  });

  it("hides message bodies when notification preview is disabled", () => {
    expect(messageNotificationOptions("研发一号", "敏感内容", "direct:peer-a", false)).toMatchObject({
      title: "研发一号",
      body: "收到一条新消息",
      group: "direct:peer-a",
      autoCancel: true,
      extra: {
        conversation_id: "direct:peer-a"
      }
    });
  });

  it("forces notification bodies hidden while privacy mode is enabled", () => {
    expect(notificationPreviewEnabled(true, true)).toBe(false);
    expect(notificationPreviewEnabled(false, true)).toBe(false);
    expect(notificationPreviewEnabled(true, false)).toBe(true);
  });

  it("omits routing metadata for generic notifications", () => {
    expect(messageNotificationOptions("文件接收完成", "report.pdf")).toMatchObject({
      title: "文件接收完成",
      body: "report.pdf",
      autoCancel: true,
      extra: {}
    });
  });

  it("extracts the target conversation id from action callbacks", () => {
    expect(notificationConversationId({ extra: { conversation_id: "group:ops" } })).toBe("group:ops");
    expect(notificationConversationId({ extra: { conversation_id: 42 } })).toBe("");
    expect(notificationConversationId({ extra: undefined })).toBe("");
  });

  it("extracts notification routing metadata from camelCase and JSON payload extras", () => {
    expect(notificationConversationId({ extra: { conversationId: "direct:peer-a" } } as never)).toBe("direct:peer-a");
    expect(
      notificationConversationId({
        extra: {
          payload: JSON.stringify({ conversation_id: "group:ops" })
        }
      } as never)
    ).toBe("group:ops");
  });

  it("falls back to the notification group when action extras are missing", () => {
    expect(notificationConversationId({ group: "direct:peer-a", extra: undefined } as never)).toBe("direct:peer-a");
  });
});
