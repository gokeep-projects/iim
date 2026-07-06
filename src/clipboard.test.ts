import { describe, expect, it } from "vitest";
import { clipboardFilesFromData } from "./clipboard";

describe("clipboardFilesFromData", () => {
  it("extracts image files from clipboard items when the files list is empty", () => {
    const image = new File(["shot"], "", { type: "image/png" });
    const data = {
      files: [],
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => image
        }
      ]
    } as unknown as DataTransfer;

    const files = clipboardFilesFromData(data);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("clipboard-image-1.png");
    expect(files[0].type).toBe("image/png");
  });

  it("prefers explicit clipboard files and preserves their names", () => {
    const namedFile = new File(["report"], "report.txt", { type: "text/plain" });
    const data = {
      files: [namedFile],
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => new File(["shot"], "", { type: "image/png" })
        }
      ]
    } as unknown as DataTransfer;

    expect(clipboardFilesFromData(data)).toEqual([namedFile]);
  });
});
