export type EditableTextElement = HTMLInputElement | HTMLTextAreaElement;

const editableInputTypes = new Set([
  "",
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url"
]);

export function editableTextElementFromTarget(target: EventTarget | null): EditableTextElement | null {
  if (target instanceof HTMLTextAreaElement) {
    return target.disabled || target.readOnly ? null : target;
  }
  if (target instanceof HTMLInputElement) {
    return target.disabled || target.readOnly || !editableInputTypes.has(target.type) ? null : target;
  }
  return null;
}

export function editableSelectionText(element: EditableTextElement): string {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  return element.value.slice(start, end);
}

export function replaceEditableSelection(element: EditableTextElement, value: string): void {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  const next = `${element.value.slice(0, start)}${value}${element.value.slice(end)}`;
  element.value = next;
  const cursor = start + value.length;
  element.setSelectionRange(cursor, cursor);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
