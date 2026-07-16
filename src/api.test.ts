import { describe, expect, it } from "vitest";
import { defaultTransportConfig, sendFiles } from "./api";

describe("defaultTransportConfig", () => {
  it("limits outbox delivery to three attempts", () => {
    expect(defaultTransportConfig.outbox.max_attempts).toBe(3);
  });
});

describe("sendFiles", () => {
  it("keeps text, attachments, and a quote in one message", async () => {
    const quote = {
      message_id: "quoted-message",
      sender_id: "peer-a",
      body_preview: "原消息",
    };

    const message = await sendFiles(
      "direct:peer-a",
      ["C:/work/screenshot.png", "C:/work/report.pdf"],
      "请一起查看",
      quote,
    );

    expect(message.body).toBe("请一起查看");
    expect(message.quote).toEqual(quote);
    expect(message.attachments[0]).toMatchObject({
      type: "transfer",
      manifest: {
        files: [
          { path: "C:/work/screenshot.png" },
          { path: "C:/work/report.pdf" },
        ],
      },
    });
  });
});
