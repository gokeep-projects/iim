import { describe, expect, it } from "vitest";
import { validateNetworkInputs, validateNetworkTiming } from "./networkValidation";

describe("validateNetworkInputs", () => {
  it("normalizes IPv4 seeds, scan ranges and removes duplicates", () => {
    const result = validateNetworkInputs(
      "192.168.1.20:24251 192.168.1.20,10.0.0.8",
      "192.168.1.0/24 192.168.1.42 192.168.1.0/24"
    );

    expect(result.seedPeers).toEqual(["10.0.0.8", "192.168.1.20"]);
    expect(result.scanRanges).toEqual(["192.168.1.0/24", "192.168.1.42"]);
    expect(result.warning).toBe("");
  });

  it("reports invalid seeds and scan ranges before saving", () => {
    const result = validateNetworkInputs("192.168.1.20:70000 bad-host", "10.0.0.0/8 192.168.1.0/33 nope");

    expect(result.seedPeers).toEqual([]);
    expect(result.scanRanges).toEqual([]);
    expect(result.invalidSeedPeers).toEqual(["192.168.1.20:70000", "bad-host"]);
    expect(result.invalidScanRanges).toEqual(["10.0.0.0/8", "192.168.1.0/33", "nope"]);
    expect(result.warning).toContain("已忽略无效网络配置");
    expect(result.warning).toContain("种子节点");
    expect(result.warning).toContain("扫描网段");
  });

  it("allows at most 1024 scan targets to match backend discovery limits", () => {
    const result = validateNetworkInputs("", "172.16.0.0/22 172.16.0.0/21");

    expect(result.scanRanges).toEqual(["172.16.0.0/22"]);
    expect(result.invalidScanRanges).toEqual(["172.16.0.0/21"]);
  });

  it("rejects non-private discovery targets before saving", () => {
    const result = validateNetworkInputs(
      "10.12.0.5 172.16.5.10 192.168.1.20 8.8.8.8 127.0.0.1 224.0.0.1",
      "10.8.9.44/24 172.20.1.5/30 192.168.3.44 8.8.8.0/30 127.0.0.0/30"
    );

    expect(result.seedPeers).toEqual(["10.12.0.5", "172.16.5.10", "192.168.1.20"]);
    expect(result.scanRanges).toEqual(["10.8.9.0/24", "172.20.1.4/30", "192.168.3.44"]);
    expect(result.invalidSeedPeers).toEqual(["8.8.8.8", "127.0.0.1", "224.0.0.1"]);
    expect(result.invalidScanRanges).toEqual(["8.8.8.0/30", "127.0.0.0/30"]);
  });
});

describe("validateNetworkTiming", () => {
  it("clamps discovery interval and peer ttl to backend limits", () => {
    const result = validateNetworkTiming("0", "999", 3, 15);

    expect(result.discoveryIntervalSecs).toBe(1);
    expect(result.peerTtlSecs).toBe(600);
    expect(result.adjustedFields).toEqual(["发现间隔", "离线判定"]);
    expect(result.warning).toContain("发现间隔");
    expect(result.warning).toContain("离线判定");
  });

  it("uses current saved timing when text input is not numeric", () => {
    const result = validateNetworkTiming("soon", "later", 9, 90);

    expect(result.discoveryIntervalSecs).toBe(9);
    expect(result.peerTtlSecs).toBe(90);
    expect(result.warning).toContain("已使用当前值");
  });

  it("treats blank timing fields as unchanged instead of zero", () => {
    const result = validateNetworkTiming("", " ", 12, 120);

    expect(result.discoveryIntervalSecs).toBe(12);
    expect(result.peerTtlSecs).toBe(120);
  });
});
