const mimeExtensions: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "text/plain": ".txt"
};

function extensionForType(type: string) {
  return mimeExtensions[type.toLowerCase()] ?? ".bin";
}

function withClipboardName(file: File, index: number) {
  if (file.name.trim()) return file;
  const prefix = file.type.startsWith("image/") ? "clipboard-image" : "clipboard-file";
  return new File([file], `${prefix}-${index + 1}${extensionForType(file.type)}`, {
    type: file.type,
    lastModified: file.lastModified
  });
}

export function clipboardFilesFromData(data: DataTransfer | null): File[] {
  if (!data) return [];

  const explicitFiles = Array.from(data.files ?? []).filter((file) => file.size > 0 || file.type);
  if (explicitFiles.length > 0) {
    return explicitFiles.map(withClipboardName);
  }

  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(withClipboardName);
}
