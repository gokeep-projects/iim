import { describe, expect, it, vi } from "vitest";
import { editableTextElementFromTarget, editableSelectionText, replaceEditableSelection } from "./editableText";

describe("editableText", () => {
  it("recognizes enabled text inputs and ignores buttons", () => {
    const input = document.createElement("input");
    input.type = "search";
    const button = document.createElement("button");

    expect(editableTextElementFromTarget(input)).toBe(input);
    expect(editableTextElementFromTarget(button)).toBeNull();
  });

  it("replaces the selected text and dispatches an input event", () => {
    const input = document.createElement("input");
    const listener = vi.fn();
    input.value = "192.168.1.20";
    input.setSelectionRange(8, 9);
    input.addEventListener("input", listener);

    replaceEditableSelection(input, "8");

    expect(input.value).toBe("192.168.8.20");
    expect(input.selectionStart).toBe(9);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns selected textarea text for copy and cut actions", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "seed peer";
    textarea.setSelectionRange(0, 4);

    expect(editableSelectionText(textarea)).toBe("seed");
  });
});
