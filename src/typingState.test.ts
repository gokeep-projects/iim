import { describe, expect, it } from "vitest";
import { removeTypingIndicatorsForPeer, typingIndicatorKeysForPeer } from "./typingState";

interface TypingItem {
  conversation_id: string;
  sender_id: string;
  active: boolean;
}

describe("typingState", () => {
  it("finds every typing indicator key for a blocked peer across conversations", () => {
    const indicators: Record<string, TypingItem> = {
      "direct:a:peer-a": { conversation_id: "direct:a", sender_id: "peer-a", active: true },
      "group:ops:peer-a": { conversation_id: "group:ops", sender_id: "peer-a", active: true },
      "group:ops:peer-b": { conversation_id: "group:ops", sender_id: "peer-b", active: true }
    };

    expect(typingIndicatorKeysForPeer(indicators, "peer-a")).toEqual(["direct:a:peer-a", "group:ops:peer-a"]);
  });

  it("removes typing indicators for the blocked peer without touching others", () => {
    const indicators: Record<string, TypingItem> = {
      "direct:a:peer-a": { conversation_id: "direct:a", sender_id: "peer-a", active: true },
      "group:ops:peer-b": { conversation_id: "group:ops", sender_id: "peer-b", active: true }
    };

    expect(removeTypingIndicatorsForPeer(indicators, "peer-a")).toEqual({
      "group:ops:peer-b": { conversation_id: "group:ops", sender_id: "peer-b", active: true }
    });
  });
});
