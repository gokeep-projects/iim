export interface NetworkInputValidation {
  seedPeers: string[];
  scanRanges: string[];
  invalidSeedPeers: string[];
  invalidScanRanges: string[];
  warning: string;
}

export interface NetworkTimingValidation {
  discoveryIntervalSecs: number;
  peerTtlSecs: number;
  adjustedFields: string[];
  warning: string;
}

function splitNetworkTokens(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIpv4(value: string) {
  const octets = value.split(".");
  if (octets.length !== 4) return null;
  const parsed = octets.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255 ? number : null;
  });
  if (parsed.some((part) => part === null)) return null;
  return parsed.join(".");
}

function ipv4Parts(value: string) {
  const ip = parseIpv4(value);
  return ip ? ip.split(".").map(Number) : null;
}

function isPrivateUnicastIpv4(value: string) {
  const parts = ipv4Parts(value);
  if (!parts) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function ipv4ToNumber(value: string) {
  const parts = ipv4Parts(value);
  if (!parts) return null;
  return parts.reduce((total, part) => total * 256 + part, 0);
}

function numberToIpv4(value: number) {
  return [
    Math.floor(value / 2 ** 24) % 256,
    Math.floor(value / 2 ** 16) % 256,
    Math.floor(value / 2 ** 8) % 256,
    value % 256
  ].join(".");
}

function canonicalNetworkIpv4(value: string, prefix: number) {
  const numeric = ipv4ToNumber(value);
  if (numeric === null) return null;
  const blockSize = 2 ** (32 - prefix);
  return numberToIpv4(Math.floor(numeric / blockSize) * blockSize);
}

function normalizeIpv4Endpoint(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes(":")) {
    const ip = parseIpv4(trimmed);
    return ip && isPrivateUnicastIpv4(ip) ? ip : null;
  }

  const [host, portText] = trimmed.split(":");
  if (!host || !portText || trimmed.split(":").length !== 2) return null;
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const ip = parseIpv4(host);
  return ip && isPrivateUnicastIpv4(ip) ? ip : null;
}

function scanRangeHostCount(prefix: number) {
  const size = prefix === 0 ? 2 ** 32 : 2 ** (32 - prefix);
  if (size > 2) return size - 2;
  return size;
}

function normalizeScanRange(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("/")) return normalizeIpv4Endpoint(trimmed);

  const [base, prefixText] = trimmed.split("/");
  if (!base || !prefixText || trimmed.split("/").length !== 2) return null;
  const ip = parseIpv4(base);
  const prefix = Number(prefixText);
  if (!ip || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  if (!isPrivateUnicastIpv4(ip)) return null;
  if (scanRangeHostCount(prefix) > 1024) return null;
  const network = canonicalNetworkIpv4(ip, prefix);
  return network ? `${network}/${prefix}` : null;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "en-US", { numeric: true }));
}

function invalidSummary(label: string, values: string[]) {
  if (values.length === 0) return "";
  const sample = values.slice(0, 3).join("、");
  const suffix = values.length > 3 ? ` 等 ${values.length} 项` : "";
  return `${label} ${sample}${suffix}`;
}

export function validateNetworkInputs(seedText: string, rangeText: string): NetworkInputValidation {
  const seedPeers: string[] = [];
  const scanRanges: string[] = [];
  const invalidSeedPeers: string[] = [];
  const invalidScanRanges: string[] = [];

  for (const token of splitNetworkTokens(seedText)) {
    const normalized = normalizeIpv4Endpoint(token);
    if (normalized) {
      seedPeers.push(normalized);
    } else {
      invalidSeedPeers.push(token);
    }
  }

  for (const token of splitNetworkTokens(rangeText)) {
    const normalized = normalizeScanRange(token);
    if (normalized) {
      scanRanges.push(normalized);
    } else {
      invalidScanRanges.push(token);
    }
  }

  const warnings = [
    invalidSummary("种子节点", invalidSeedPeers),
    invalidSummary("扫描网段", invalidScanRanges)
  ].filter(Boolean);

  return {
    seedPeers: uniqueSorted(seedPeers),
    scanRanges: uniqueSorted(scanRanges),
    invalidSeedPeers: uniqueSorted(invalidSeedPeers),
    invalidScanRanges: uniqueSorted(invalidScanRanges),
    warning: warnings.length > 0 ? `已忽略无效网络配置：${warnings.join("；")}` : ""
  };
}

function normalizeNetworkSeconds(value: string, fallback: number, min: number, max: number, label: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    const normalizedFallback = Math.min(max, Math.max(min, fallback));
    return {
      value: normalizedFallback,
      warning: `${label}需为 ${min}-${max} 秒整数，已使用当前值 ${normalizedFallback} 秒`
    };
  }

  const parsed = Number(trimmed);
  const clamped = Math.min(max, Math.max(min, parsed));
  return {
    value: clamped,
    warning: clamped === parsed ? "" : `${label}需为 ${min}-${max} 秒整数，已调整为 ${clamped} 秒`
  };
}

export function validateNetworkTiming(
  discoveryIntervalText: string,
  peerTtlText: string,
  currentDiscoveryIntervalSecs: number,
  currentPeerTtlSecs: number
): NetworkTimingValidation {
  const discoveryInterval = normalizeNetworkSeconds(discoveryIntervalText, currentDiscoveryIntervalSecs, 1, 60, "发现间隔");
  const peerTtl = normalizeNetworkSeconds(peerTtlText, currentPeerTtlSecs, 5, 600, "离线判定");
  const warnings = [discoveryInterval.warning, peerTtl.warning].filter(Boolean);

  return {
    discoveryIntervalSecs: discoveryInterval.value,
    peerTtlSecs: peerTtl.value,
    adjustedFields: [
      discoveryInterval.warning ? "发现间隔" : "",
      peerTtl.warning ? "离线判定" : ""
    ].filter(Boolean),
    warning: warnings.join("；")
  };
}
