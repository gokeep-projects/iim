import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  NetworkSettings,
  PeerProfile,
  StorageOverview,
  TransportConfig,
  TransferTask,
} from "../api";
import WorkspacePanel from "./WorkspacePanel.svelte";

const settings: NetworkSettings = {
  auto_discovery: true,
  multicast: true,
  seed_peers: [],
  scan_ranges: [],
  discovery_interval_secs: 3,
  peer_ttl_secs: 15,
};

const transportConfig: TransportConfig = {
  listen_port: 25251,
  heartbeat_secs: 20,
  max_idle_timeout_secs: 90,
  outbox: {
    retry_after_millis: 15_000,
    max_attempts: 9,
    batch_limit: 25,
  },
};

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-search-1",
    conversation_id: "direct:peer-a",
    sender_id: "peer-a",
    body: "今晚值班我来处理",
    attachments: [],
    created_at: 1_700_000_010_000,
    status: "received",
    recalled: false,
    quote: null,
    favorited: false,
    reactions: [],
    ...patch,
  };
}

function transferTask(patch: Partial<TransferTask> = {}): TransferTask {
  return {
    id: "transfer-failed",
    name: "设计稿.zip",
    status: "failed",
    errorMessage: "connection reset",
    totalBytes: 4096,
    sentBytes: 1024,
    files: ["设计稿.zip"],
    resumable: true,
    ...patch,
  };
}

function storageOverview(patch: Partial<StorageOverview> = {}): StorageOverview {
  return {
    data_dir: "C:/Users/admin/AppData/Roaming/IIM",
    database_path: "C:/Users/admin/AppData/Roaming/IIM/iim.sqlite",
    database_key_path: "C:/Users/admin/AppData/Roaming/IIM/db.key.dpapi",
    database_key_protection: "Windows DPAPI",
    received_files_dir: "C:/Users/admin/AppData/Roaming/IIM/received_files",
    staged_files_dir: "C:/Users/admin/AppData/Roaming/IIM/staged",
    database_bytes: 2_621_440,
    received_bytes: 5_242_880,
    staged_bytes: 327_680,
    transfer_task_count: 3,
    ...patch,
  };
}

function selfProfile(patch: Partial<PeerProfile> = {}): PeerProfile {
  return {
    peer_id: "local-peer-id",
    display_name: "Local User",
    hostname: "local-host",
    avatar_hash: null,
    status: "online",
    endpoints: ["0.0.0.0:24251"],
    fingerprint: "abc123fingerprint",
    public_key: [1, 2, 3],
    ...patch,
  };
}

describe("WorkspacePanel search results", () => {
  it("renders a compact profile card with host, endpoint, and status actions", async () => {
    const changeStatus = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        self: selfProfile({
          display_name: "林溪",
          hostname: "linxi-pc",
          endpoints: ["192.168.1.77:24251"],
          status: "away",
        }),
        profileName: "林溪",
        profileHostname: "linxi-pc",
        profileStatus: "away",
        profileSignature: "随时在线处理内网协作",
        avatarLabel: "灵",
        onProfileStatusChange: changeStatus,
      },
    });

    const card = screen.getByRole("region", { name: "个人名片" });
    expect(within(card).getByText("灵")).toBeInTheDocument();
    expect(within(card).getByText("林溪")).toBeInTheDocument();
    expect(within(card).getByText("随时在线处理内网协作")).toBeInTheDocument();
    expect(within(card).getByText("linxi-pc")).toBeInTheDocument();
    expect(within(card).getByText("192.168.1.77:24251")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "离开" })).toHaveAttribute("aria-pressed", "true");

    await fireEvent.click(within(card).getByRole("button", { name: "在线" }));
    expect(changeStatus).toHaveBeenCalledWith("online");
  });

  it("shows user-readable conversation titles for search and favorite messages", () => {
    render(WorkspacePanel, {
      props: {
        section: "search",
        query: "值班",
        settings,
        searchResults: [message()],
        favoriteMessages: [message({ id: "msg-fav-1", favorited: true })],
        todoMessages: [message({ id: "msg-todo-1" })],
        conversationTitles: { "direct:peer-a": "研发一号" },
      },
    });

    expect(screen.getAllByText(/研发一号/)).toHaveLength(3);
    expect(screen.getByText("消息待办")).toBeInTheDocument();
  });

  it("shows outbox messages and opens the original conversation", async () => {
    const openMessage = vi.fn();
    const retryOutbox = vi.fn();
    const outbox = message({
      id: "msg-outbox-failed",
      body: "retry this payload",
      sender_id: "local-peer-id",
      status: "failed",
    });

    render(WorkspacePanel, {
      props: {
        section: "search",
        query: "retry",
        settings,
        outboxMessages: [outbox],
        conversationTitles: { "direct:peer-a": "研发一号" },
        onOpenMessageResult: openMessage,
        onRetryOutboxMessages: retryOutbox,
      },
    });

    expect(screen.getByText("发件箱")).toBeInTheDocument();
    expect(screen.getByText("发送失败")).toHaveClass("failed");
    expect(screen.getByText("retry this payload")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "全部重试" }));
    await fireEvent.click(screen.getByRole("button", { name: "打开" }));

    expect(retryOutbox).toHaveBeenCalledTimes(1);
    expect(openMessage).toHaveBeenCalledWith(outbox);
  });

  it("uses attachment summaries for search and favorite results without text", () => {
    const attachmentMessage = message({
      id: "msg-attachment-only",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "transfer-result",
            files: [
              {
                path: "C:/work/report.pdf",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
            ],
            total_bytes: 4096,
            chunk_size: 262144,
            sha256: "b".repeat(64),
          },
        },
      ],
    });
    render(WorkspacePanel, {
      props: {
        section: "search",
        query: "report",
        settings,
        searchResults: [attachmentMessage],
        favoriteMessages: [attachmentMessage],
        conversationTitles: { "direct:peer-a": "研发一号" },
      },
    });

    expect(screen.getAllByText("文件：report.pdf")).toHaveLength(2);
  });

  it("hides search and favorite message previews while privacy mode is enabled", () => {
    const attachmentMessage = message({
      id: "msg-private-attachment",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "transfer-private-result",
            files: [
              {
                path: "C:/work/payroll.xlsx",
                relative_path: null,
                size: 4096,
                sha256: "a".repeat(64),
              },
            ],
            total_bytes: 4096,
            chunk_size: 262144,
            sha256: "b".repeat(64),
          },
        },
      ],
    });
    render(WorkspacePanel, {
      props: {
        section: "search",
        privacyMode: true,
        query: "secret",
        settings,
        searchResults: [
          message({ body: "secret launch plan" }),
          attachmentMessage,
        ],
        favoriteMessages: [
          message({ id: "msg-private-fav", body: "favorite salary note" }),
        ],
        conversationTitles: { "direct:peer-a": "研发一号" },
      },
    });

    expect(screen.queryByText("secret launch plan")).not.toBeInTheDocument();
    expect(screen.queryByText("favorite salary note")).not.toBeInTheDocument();
    expect(screen.queryByText("文件：payroll.xlsx")).not.toBeInTheDocument();
    expect(screen.getAllByText("消息预览已隐藏")).toHaveLength(3);
  });

  it("uses file name summaries for multi-file attachment results without text", () => {
    const attachmentMessage = message({
      id: "msg-multi-attachment-only",
      body: "",
      attachments: [
        {
          type: "transfer",
          manifest: {
            transfer_id: "transfer-multi-result",
            files: [
              {
                path: "a.txt",
                relative_path: null,
                size: 1,
                sha256: "a".repeat(64),
              },
              {
                path: "b.txt",
                relative_path: null,
                size: 1,
                sha256: "b".repeat(64),
              },
            ],
            total_bytes: 2,
            chunk_size: 262144,
            sha256: "c".repeat(64),
          },
        },
      ],
    });
    render(WorkspacePanel, {
      props: {
        section: "search",
        query: "附件",
        settings,
        searchResults: [attachmentMessage],
      },
    });

    expect(screen.getByText("文件：a.txt、b.txt")).toBeInTheDocument();
  });

  it("opens the exact message from search results", async () => {
    const openMessageResult = vi.fn();
    const result = message({ id: "msg-search-target" });
    render(WorkspacePanel, {
      props: {
        section: "search",
        query: "值班",
        settings,
        searchResults: [result],
        onOpenMessageResult: openMessageResult,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "打开" }));

    expect(openMessageResult).toHaveBeenCalledWith(result);
  });
});

describe("WorkspacePanel settings", () => {
  it("shows a focused shortcut settings section for only core message actions", async () => {
    const setSendShortcut = vi.fn();
    const setScreenshotShortcut = vi.fn();
    const setWindowShortcut = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "preferences",
        sendShortcut: "enter",
        shortcuts: {
          send_message: "enter",
          screenshot: "ctrl_alt_a",
          toggle_window: "ctrl_alt_i",
        },
        onSetSendShortcut: setSendShortcut,
        onSetScreenshotShortcut: setScreenshotShortcut,
        onSetWindowShortcut: setWindowShortcut,
      },
    });

    const shortcuts = screen.getByRole("region", { name: "快捷键设置" });
    expect(within(shortcuts).getByText("发送消息")).toBeInTheDocument();
    expect(within(shortcuts).getByText("截图")).toBeInTheDocument();
    expect(within(shortcuts).getByText("打开/关闭窗口")).toBeInTheDocument();
    expect(within(shortcuts).getByText("Enter")).toBeInTheDocument();
    expect(within(shortcuts).getByText("Ctrl+Alt+A")).toBeInTheDocument();
    expect(within(shortcuts).getByText("Ctrl+Alt+I")).toBeInTheDocument();
    expect(within(shortcuts).queryByText("通知预览")).not.toBeInTheDocument();
    expect(within(shortcuts).queryByText("隐私保护")).not.toBeInTheDocument();
    expect(within(shortcuts).queryByText("主题")).not.toBeInTheDocument();

    await fireEvent.click(within(shortcuts).getByRole("button", { name: "Ctrl+Enter" }));
    await fireEvent.click(within(shortcuts).getByRole("button", { name: "Ctrl+Shift+A" }));
    await fireEvent.click(within(shortcuts).getByRole("button", { name: "Ctrl+Shift+I" }));
    expect(setSendShortcut).toHaveBeenCalledWith("ctrl_enter");
    expect(setScreenshotShortcut).toHaveBeenCalledWith("ctrl_shift_a");
    expect(setWindowShortcut).toHaveBeenCalledWith("ctrl_shift_i");
  });

  it("folds notification controls into settings preferences", async () => {
    const enableNotifications = vi.fn();
    const togglePreview = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "notifications",
        settings,
        settingsTab: "preferences",
        notificationReady: false,
        showNotificationPreview: true,
        onEnableNotifications: enableNotifications,
        onToggleNotificationPreview: togglePreview,
      },
    });

    expect(screen.queryByText("消息提醒")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "偏好概览" })).toHaveTextContent("系统通知 未授权");
    const notificationPanel = screen.getByRole("region", { name: "提醒与隐私" });
    expect(notificationPanel).toHaveTextContent("通知设置已合并到设置页");

    await fireEvent.click(within(notificationPanel).getByRole("button", { name: "开启系统通知" }));
    await fireEvent.click(within(notificationPanel).getByRole("button", { name: "隐藏通知消息内容" }));

    expect(enableNotifications).toHaveBeenCalledTimes(1);
    expect(togglePreview).toHaveBeenCalledTimes(1);
  });

  it("uses distinct presence tones for each compact local status choice", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        self: selfProfile(),
      },
    });

    const presenceGroup = screen.getByRole("group", {
      name: "本机在线状态",
    });
    const onlineButton = within(presenceGroup).getByRole("button", { name: "在线" });
    const awayButton = within(presenceGroup).getByRole("button", { name: "离开" });
    const offlineButton = within(presenceGroup).getByRole("button", { name: "隐身" });
    const onlinePresence = within(onlineButton).getByText("", { selector: ".presence-dot" });
    const awayPresence = within(
      within(presenceGroup).getByRole("button", { name: "离开" }),
    ).getByText("", { selector: ".presence-dot" });
    const offlinePresence = within(
      within(presenceGroup).getByRole("button", { name: "隐身" }),
    ).getByText("", { selector: ".presence-dot" });

    expect(onlineButton).toHaveClass("compact");
    expect(awayButton).toHaveClass("compact");
    expect(offlineButton).toHaveClass("compact");
    expect(onlinePresence).toHaveClass("online");
    expect(awayPresence).toHaveClass("away");
    expect(awayPresence).not.toHaveClass("offline");
    expect(offlinePresence).toHaveClass("offline");
    expect(offlinePresence).not.toHaveClass("away");
  });

  it("opens the settings tab requested by its parent", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
      },
    });

    expect(screen.getByText("24250/UDP")).toBeInTheDocument();
    expect(screen.getAllByText("24251/QUIC").length).toBeGreaterThan(0);
    expect(screen.getByText("3s")).toBeInTheDocument();
    expect(screen.getByText("15s")).toBeInTheDocument();
  });

  it("does not expose editable advanced discovery timing values", async () => {
    const intervalChange = vi.fn();
    const ttlChange = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
        discoveryIntervalText: "3",
        peerTtlText: "15",
        onDiscoveryIntervalTextChange: intervalChange,
        onPeerTtlTextChange: ttlChange,
      },
    });

    expect(screen.getByText("3s")).toBeInTheDocument();
    expect(screen.getByText("15s")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("3")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("15")).not.toBeInTheDocument();

    expect(intervalChange).not.toHaveBeenCalled();
    expect(ttlChange).not.toHaveBeenCalled();
  });

  it("shows invalid network input warnings in advanced discovery settings", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
        networkInputWarning: "已忽略无效网络配置：种子节点 bad-host",
      },
    });

    expect(
      screen.getByText("已忽略无效网络配置：种子节点 bad-host"),
    ).toBeInTheDocument();
  });

  it("shows a guided storage migration workflow and prevents duplicate migration clicks", async () => {
    const migrateStorage = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "storage",
        storageOverview: storageOverview(),
        storageMigrationActive: true,
        storageMigrationProgress: {
          phase: "copying",
          completed: 2,
          total: 5,
          current_path: "D:/IIM-Moved/received_files/design.zip",
        },
        onMigrateStorageDirectory: migrateStorage,
      },
    });

    const migration = screen.getByRole("region", { name: "数据目录迁移" });
    expect(migration).toHaveTextContent("当前目录");
    expect(migration).toHaveTextContent("加密数据库、密钥、接收文件、剪贴板暂存");
    expect(migration).toHaveTextContent("迁移完成后自动重启");
    expect(within(migration).getByText("复制").closest("article")).toHaveClass("active");
    expect(within(migration).getByText("准备").closest("article")).toHaveClass("done");

    const migrateButton = within(migration).getByRole("button", { name: "正在迁移数据目录" });
    expect(migrateButton).toBeDisabled();
    await fireEvent.click(migrateButton);
    expect(migrateStorage).not.toHaveBeenCalled();

    const progress = screen.getByRole("region", { name: "数据目录迁移进度" });
    expect(progress).toHaveTextContent("复制文件");
    expect(progress).toHaveTextContent("2/5");
  });

  it("explains that network discovery uses default local-direct settings", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
      },
    });

    expect(screen.getByText("默认内网直连")).toBeInTheDocument();
    expect(screen.getByText(/联系人页就是设备发现与管理入口/)).toBeInTheDocument();
    expect(screen.queryByText(/RFC1918/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1024/)).not.toBeInTheDocument();
  });

  it("summarizes live discovery health in network settings", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings: {
          ...settings,
          auto_discovery: true,
          multicast: false,
          seed_peers: ["192.168.1.20:24251"],
          scan_ranges: ["192.168.2.0/24"],
        },
        settingsTab: "network",
        peers: [
          selfProfile({ peer_id: "peer-a", status: "online" }),
          selfProfile({ peer_id: "peer-b", status: "offline" }),
          selfProfile({ peer_id: "peer-c", status: "away" }),
        ],
      },
    });

    const health = screen.getByLabelText("发现健康摘要");
    expect(health).toHaveTextContent("发现设备 3 台");
    expect(health).toHaveTextContent("在线 1 · 暂不可达 2");
    expect(health).toHaveTextContent("直连端口 24251/QUIC");
    expect(health).toHaveTextContent("发现广播 24250/UDP");
    expect(health).toHaveTextContent("发现策略 自动发现");
    expect(health).toHaveTextContent("广播受限，优先检查网络策略");
    expect(health).toHaveTextContent("最近告警 正常");
  });

  it("shows actionable diagnostics for network discovery risks", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings: {
          ...settings,
          auto_discovery: false,
          multicast: false,
          seed_peers: [],
          scan_ranges: [],
        },
        settingsTab: "network",
        peers: [],
        networkWarnings: ["QUIC send failed to 192.168.1.20:24251"],
        storageOverview: null,
      },
    });

    const diagnostics = screen.getByLabelText("网络诊断建议");
    expect(diagnostics).toHaveTextContent("自动发现已关闭");
    expect(diagnostics).toHaveTextContent("没有发现可联系设备");
    expect(diagnostics).toHaveTextContent("默认发现受限");
    expect(diagnostics).toHaveTextContent("最近网络警告");
    expect(diagnostics).toHaveTextContent(
      "QUIC send failed to 192.168.1.20:24251",
    );
  });

  it("refreshes network diagnostics from the diagnostics panel", async () => {
    const refreshPeers = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
        peers: [selfProfile({ peer_id: "peer-a", status: "online" })],
        onRefreshPeers: refreshPeers,
      },
    });

    const diagnostics = screen.getByLabelText("网络诊断建议");
    await fireEvent.click(within(diagnostics).getByRole("button", { name: "刷新诊断" }));

    expect(refreshPeers).toHaveBeenCalledTimes(1);
  });

  it("shows a busy refresh state while network diagnostics are refreshing", async () => {
    let finishRefresh: () => void = () => {};
    const refreshPeers = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
        peers: [selfProfile({ peer_id: "peer-a", status: "online" })],
        onRefreshPeers: refreshPeers,
      },
    });

    const diagnostics = screen.getByLabelText("网络诊断建议");
    const refresh = within(diagnostics).getByRole("button", { name: "刷新诊断" });
    await fireEvent.click(refresh);

    expect(refreshPeers).toHaveBeenCalledTimes(1);
    expect(diagnostics).toHaveAttribute("aria-busy", "true");
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveClass("loading");

    finishRefresh();
    await waitFor(() => expect(diagnostics).toHaveAttribute("aria-busy", "false"));
  });

  it("copies a network diagnostic report for support handoff", async () => {
    const copyNetworkDiagnostics = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings: {
          ...settings,
          auto_discovery: false,
          multicast: false,
          seed_peers: ["192.168.1.20:24251"],
          scan_ranges: ["192.168.2.0/24"],
        },
        settingsTab: "network",
        peers: [selfProfile({ peer_id: "peer-a", status: "online" })],
        networkWarnings: ["UDP broadcast failed"],
        onCopyNetworkDiagnostics: copyNetworkDiagnostics,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "复制诊断报告" }));

    expect(copyNetworkDiagnostics).toHaveBeenCalledWith(
      expect.stringContaining("自动发现：关闭"),
    );
    expect(copyNetworkDiagnostics).toHaveBeenCalledWith(
      expect.stringContaining("默认发现受限"),
    );
    expect(copyNetworkDiagnostics).toHaveBeenCalledWith(
      expect.stringContaining("UDP broadcast failed"),
    );
  });

  it("shows reliable delivery policy in network settings", async () => {
    const copyNetworkDiagnostics = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
        transportConfig,
        onCopyNetworkDiagnostics: copyNetworkDiagnostics,
      },
    });

    const networkStatus = screen.getByLabelText("网络状态");
    expect(networkStatus).toHaveTextContent("25251/QUIC");
    expect(networkStatus).toHaveTextContent("可靠重试 15s");
    expect(networkStatus).toHaveTextContent("最大尝试 9 次");
    expect(networkStatus).toHaveTextContent("重试批量 25");

    const diagnostics = screen.getByLabelText("网络诊断建议");
    await fireEvent.click(within(diagnostics).getByRole("button", { name: "复制诊断报告" }));

    expect(copyNetworkDiagnostics).toHaveBeenCalledWith(
      expect.stringContaining("QUIC 监听端口：25251"),
    );
    expect(copyNetworkDiagnostics).toHaveBeenCalledWith(
      expect.stringContaining("outbox 重试：15s / 9 次 / 每批 25"),
    );
  });

  it("routes settings category clicks through the parent settings controller", async () => {
    const openSettingsTab = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        onOpenSettingsTab: openSettingsTab,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "存储" }));
    await fireEvent.click(screen.getByRole("button", { name: "安全" }));

    expect(openSettingsTab).toHaveBeenCalledWith("storage");
    expect(openSettingsTab).toHaveBeenCalledWith("security");
  });

  it("offers copy actions for local identity verification values", async () => {
    const copyIdentityValue = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        self: selfProfile(),
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "复制设备 ID" }));
    await fireEvent.click(screen.getByRole("button", { name: "复制证书指纹" }));

    expect(copyIdentityValue).toHaveBeenCalledWith("local-peer-id", "设备 ID");
    expect(copyIdentityValue).toHaveBeenCalledWith(
      "abc123fingerprint",
      "证书指纹",
    );
  });

  it("copies storage paths for diagnostics", async () => {
    const copyStoragePath = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "storage",
        storageOverview: {
          data_dir: "C:/iim/data",
          database_path: "C:/iim/data/history.db",
          database_key_path: "C:/iim/data/history.key",
          database_key_protection: "DPAPI",
          received_files_dir: "C:/iim/data/received_files",
          staged_files_dir: "C:/iim/data/staged",
          database_bytes: 4096,
          received_bytes: 1024,
          staged_bytes: 2048,
          transfer_task_count: 2,
        },
        onCopyStoragePath: copyStoragePath,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制接收文件路径" }),
    );

    expect(copyStoragePath).toHaveBeenCalledWith(
      "C:/iim/data/received_files",
      "接收文件路径",
    );
  });

  it("opens storage paths directly from each storage path row", async () => {
    const openStorage = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "storage",
        storageOverview: {
          data_dir: "C:/iim/data",
          database_path: "C:/iim/data/history.db",
          database_key_path: "C:/iim/data/history.key",
          database_key_protection: "DPAPI",
          received_files_dir: "C:/iim/data/received_files",
          staged_files_dir: "C:/iim/data/staged",
          database_bytes: 4096,
          received_bytes: 1024,
          staged_bytes: 2048,
          transfer_task_count: 2,
        },
        onOpenStorage: openStorage,
      },
    });

    expect(screen.queryByRole("region", { name: "打开存储目录" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "存储路径" })).toHaveTextContent("常用目录可直接打开");

    await fireEvent.click(screen.getByRole("button", { name: "打开接收文件路径" }));
    await fireEvent.click(screen.getByRole("button", { name: "打开暂存路径" }));

    expect(openStorage).toHaveBeenCalledWith("received");
    expect(openStorage).toHaveBeenCalledWith("staged");
  });

  it("keeps storage migration as the primary storage workflow", async () => {
    const migrateStorage = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "storage",
        storageOverview: storageOverview({
          data_dir: "C:/iim/data",
          database_path: "C:/iim/data/history.db",
          database_key_path: "C:/iim/data/history.key",
          database_key_protection: "DPAPI",
          received_files_dir: "C:/iim/data/received_files",
          staged_files_dir: "C:/iim/data/staged",
        }),
        onMigrateStorageDirectory: migrateStorage,
      },
    });

    const migration = screen.getByRole("region", { name: "数据目录迁移" });
    expect(migration).toHaveTextContent("C:/iim/data");
    expect(migration).toHaveTextContent("迁移完成后自动重启");
    const migrate = within(migration).getByRole("button", { name: "选择新的数据目录" });
    expect(migrate).toHaveClass("storage-migration-action");

    await fireEvent.click(migrate);
    expect(migrateStorage).toHaveBeenCalledTimes(1);
  });

  it("copies a storage diagnostic report for support handoff", async () => {
    const copyStorageDiagnostics = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "storage",
        storageOverview: {
          data_dir: "C:/iim/data",
          database_path: "C:/iim/data/history.db",
          database_key_path: "C:/iim/data/history.key",
          database_key_protection: "DPAPI",
          received_files_dir: "C:/iim/data/received_files",
          staged_files_dir: "C:/iim/data/staged",
          database_bytes: 4096,
          received_bytes: 1024,
          staged_bytes: 2048,
          transfer_task_count: 2,
        },
        transferTasks: [
          {
            id: "transfer-failed",
            conversationId: "direct:peer-a",
            name: "季度材料.zip",
            status: "failed",
            errorMessage: "disk full",
            totalBytes: 4096,
            sentBytes: 2048,
            files: ["季度材料.zip"],
            resumable: true,
          },
        ],
        onCopyStorageDiagnostics: copyStorageDiagnostics,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制存储诊断报告" }),
    );

    expect(copyStorageDiagnostics).toHaveBeenCalledTimes(1);
    const report = copyStorageDiagnostics.mock.calls[0][0] as string;
    expect(report).toContain("灵犀内网通存储诊断");
    expect(report).toContain("数据库：C:/iim/data/history.db");
    expect(report).toContain("缓存占用：3.0 KB");
    expect(report).toContain("失败任务：1");
  });

  it("shows encrypted database size in storage overview", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "storage",
        storageOverview: {
          data_dir: "C:/iim/data",
          database_path: "C:/iim/data/history.db",
          database_key_path: "C:/iim/data/history.key",
          database_key_protection: "DPAPI",
          received_files_dir: "C:/iim/data/received_files",
          staged_files_dir: "C:/iim/data/staged",
          database_bytes: 4096,
          received_bytes: 1024,
          staged_bytes: 2048,
          transfer_task_count: 2,
        },
      },
    });

    const overview = screen.getByRole("region", { name: "存储用量概览" });
    expect(overview).toHaveTextContent("数据库");
    expect(overview).toHaveTextContent("4.0 KB");
  });

  it("searches trusted devices and copies fingerprints", async () => {
    const copyTrustedFingerprint = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        trustedPeers: [
          {
            peer_id: "peer-alpha",
            fingerprint: "alpha-fingerprint",
            trusted_at: 1_700_000_000,
          },
          {
            peer_id: "peer-beta",
            fingerprint: "beta-fingerprint",
            trusted_at: 1_700_000_100,
          },
        ],
        onCopyTrustedFingerprint: copyTrustedFingerprint,
      },
    });

    await fireEvent.input(screen.getByPlaceholderText("搜索设备 ID 或指纹"), {
      target: { value: "beta" },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: "复制 peer-beta 指纹" }),
    );

    expect(screen.getByText("peer-beta")).toBeInTheDocument();
    expect(screen.queryByText("peer-alpha")).not.toBeInTheDocument();
    expect(copyTrustedFingerprint).toHaveBeenCalledWith(
      "beta-fingerprint",
      "peer-beta 指纹",
    );
  });

  it("defaults to open communication and toggles add-friend-only messaging", async () => {
    const toggleRequireContact = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        requireContactForMessaging: false,
        onToggleRequireContactForMessaging: toggleRequireContact,
      },
    });

	    const summary = screen.getByLabelText("安全策略摘要");
	    expect(summary).toHaveTextContent("当前模式 无需加好友");
	    expect(summary).toHaveTextContent("指纹信任 0 台");
	    expect(summary).toHaveTextContent("指纹校验 一致");
	
	    const policy = screen.getByRole("group", { name: "通信权限策略" });
	    expect(within(policy).getByRole("button", { name: "无需加好友" })).toHaveAttribute("aria-pressed", "true");
	    expect(within(policy).getByText("默认：无需加好友")).toBeInTheDocument();
	    expect(within(policy).getByText("同网段发现后可直接发消息和文件；设备指纹仍会被 TOFU 校验。")).toBeInTheDocument();
	    expect(screen.getByText("已信任设备不是好友列表")).toBeInTheDocument();
	    expect(screen.getByText("它只保存设备 ID 与证书指纹。默认模式仍允许发现设备直接通信；仅联系人模式下，添加好友后会自动建立设备信任。")).toBeInTheDocument();
	
	    await fireEvent.click(within(policy).getByRole("button", { name: "仅联系人可通信" }));
	
	    expect(toggleRequireContact).toHaveBeenCalledWith(true);
	  });

  it("copies a trusted device audit record with current fingerprint status", async () => {
    const copyIdentityValue = vi.fn();
    const betaPeer: PeerProfile = {
      peer_id: "peer-beta",
      display_name: "Beta Device",
      hostname: "beta-host",
      status: "online",
      endpoints: ["192.168.1.42:24251"],
      fingerprint: "beta-fingerprint",
    };
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        peers: [betaPeer],
        trustedPeers: [
          {
            peer_id: "peer-beta",
            fingerprint: "beta-fingerprint",
            trusted_at: 1_700_000_100,
          },
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制 Beta Device 信任记录" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledTimes(1);
    const [report, label] = copyIdentityValue.mock.calls[0];
    expect(label).toBe("Beta Device 信任记录");
    expect(report).toContain("灵犀内网通信任记录");
    expect(report).toContain("设备 ID：peer-beta");
    expect(report).toContain("信任指纹：beta-fingerprint");
    expect(report).toContain("当前发现状态：可联系");
    expect(report).toContain("当前主机名：beta-host");
    expect(report).toContain("当前端点：192.168.1.42:24251");
    expect(report).toContain("当前上报指纹：beta-fingerprint");
    expect(report).toContain("指纹校验：一致");
    expect(screen.getByText("当前发现指纹一致")).toBeInTheDocument();
  });

  it("warns when a discovered trusted device reports a different fingerprint", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        peers: [
          {
            peer_id: "peer-beta",
            display_name: "Beta Device",
            hostname: "beta-host",
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "current-fingerprint",
          },
        ],
        trustedPeers: [
          {
            peer_id: "peer-beta",
            fingerprint: "trusted-fingerprint",
            trusted_at: 1_700_000_100,
          },
        ],
      },
    });

    expect(screen.getByText("当前发现指纹与信任记录不一致")).toHaveClass(
      "trust-warning",
    );
  });

  it("copies a security diagnostic report with fingerprint mismatches and warnings", async () => {
    const copyIdentityValue = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        peers: [
          {
            peer_id: "peer-beta",
            display_name: "Beta Device",
            hostname: "beta-host",
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "current-fingerprint",
          },
        ],
        trustedPeers: [
          {
            peer_id: "peer-beta",
            fingerprint: "trusted-fingerprint",
            trusted_at: 1_700_000_100,
          },
        ],
        networkWarnings: [
          "Peer fingerprint rejected for Beta Device: fingerprint changed",
          "Discovery bind failed: port 24250",
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "复制诊断报告" }));

    expect(copyIdentityValue).toHaveBeenCalledTimes(1);
    const [report, label] = copyIdentityValue.mock.calls[0];
    expect(label).toBe("安全诊断报告");
    expect(report).toContain("灵犀内网通安全诊断");
    expect(report).toContain("已信任设备：1");
    expect(report).toContain("指纹不一致：1");
    expect(report).toContain("安全告警：1");
    expect(report).toContain("不一致清单：Beta Device (peer-beta)");
    expect(report).toContain("Peer fingerprint rejected for Beta Device");
    expect(report).not.toContain("Discovery bind failed");
    expect(report).toContain("当前发现指纹与信任记录不一致");
  });

  it("exposes a privacy mode switch in workspace preferences", async () => {
    const togglePrivacyMode = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "preferences",
        privacyMode: true,
        onTogglePrivacyMode: togglePrivacyMode,
      },
    });

    expect(screen.getByText("隐私模式")).toBeInTheDocument();
    expect(screen.getByText("保护中")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "关闭隐私模式" }));

    expect(togglePrivacyMode).toHaveBeenCalledTimes(1);
  });
});

describe("WorkspacePanel transfers", () => {
  it("uses one compact transfer history list instead of separate diagnostics-style sections", () => {
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [
          transferTask({
            id: "transfer-active-history-list",
            name: "active.zip",
            status: "sending",
            files: ["active.zip"],
          }),
          transferTask({
            id: "transfer-done-history-list",
            name: "done.zip",
            status: "delivered",
            files: ["done.zip"],
            sentBytes: 4096,
          }),
        ],
      },
    });

    expect(screen.getByRole("region", { name: "文件传输统计" })).toHaveTextContent("活跃");
    const history = screen.getByRole("region", { name: "文件传输历史" });
    expect(within(history).getByText("active.zip")).toBeInTheDocument();
    expect(within(history).getByText("done.zip")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "传输概览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "活跃传输" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "历史记录" })).not.toBeInTheDocument();
  });

  it("filters transfer tasks by file name or task id", async () => {
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [
          transferTask({
            id: "transfer-design",
            name: "design.zip",
            status: "sending",
            files: ["design.zip"],
          }),
          transferTask({
            id: "transfer-report",
            name: "report.pdf",
            status: "delivered",
            files: ["report.pdf"],
            sentBytes: 4096,
          }),
        ],
      },
    });

    await fireEvent.input(
      screen.getByPlaceholderText("搜索文件名、任务 ID 或状态"),
      { target: { value: "report" } },
    );

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.queryByText("design.zip")).not.toBeInTheDocument();
  });

  it("filters transfer tasks by failed status", async () => {
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [
          transferTask({
            id: "transfer-active",
            name: "active.zip",
            status: "sending",
            files: ["active.zip"],
          }),
          transferTask({
            id: "transfer-failed",
            name: "failed.zip",
            status: "failed",
            files: ["failed.zip"],
          }),
          transferTask({
            id: "transfer-done",
            name: "done.zip",
            status: "delivered",
            files: ["done.zip"],
            sentBytes: 4096,
          }),
        ],
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: "失败" }));

    expect(screen.getByText("failed.zip")).toBeInTheDocument();
    expect(screen.queryByText("active.zip")).not.toBeInTheDocument();
    expect(screen.queryByText("done.zip")).not.toBeInTheDocument();
  });

  it("copies transfer task identifiers from active and history rows", async () => {
    const copyTransferId = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [
          transferTask({
            id: "transfer-active-copy",
            name: "active.zip",
            status: "sending",
            files: ["active.zip"],
          }),
          transferTask({
            id: "transfer-history-copy",
            name: "history.zip",
            status: "delivered",
            files: ["history.zip"],
            sentBytes: 4096,
            resumable: false,
          }),
        ],
        onCopyTransferId: copyTransferId,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制 active.zip 传输任务 ID" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "复制 history.zip 传输任务 ID" }),
    );

    expect(copyTransferId).toHaveBeenCalledWith("transfer-active-copy", "active.zip 传输任务 ID");
    expect(copyTransferId).toHaveBeenCalledWith("transfer-history-copy", "history.zip 传输任务 ID");
  });

  it("keeps transfer diagnostics out of the files workspace surface", () => {
    const copyTransferDiagnostics = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [
          transferTask({
            id: "transfer-active-diagnostic",
            name: "active.zip",
            status: "sending",
            files: ["active.zip"],
            totalBytes: 8192,
            sentBytes: 2048,
          }),
          transferTask({
            id: "transfer-failed-diagnostic",
            name: "failed.zip",
            status: "failed",
            files: ["failed.zip"],
            errorMessage: "network lost",
            totalBytes: 4096,
            sentBytes: 1024,
          }),
          transferTask({
            id: "transfer-history-diagnostic",
            name: "history.zip",
            status: "delivered",
            files: ["history.zip"],
            totalBytes: 2048,
            sentBytes: 2048,
            resumable: false,
          }),
        ],
      },
    });

    expect(screen.queryByRole("button", { name: /诊断/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/传输诊断/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /复制 .* 传输记录/ })).not.toBeInTheDocument();
    expect(screen.queryByText("复制记录")).not.toBeInTheDocument();
    expect(copyTransferDiagnostics).not.toHaveBeenCalled();
  });

  it("keeps transfer task records out of the files workspace primary actions", () => {
    const copyTransferDiagnostics = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [
          transferTask({
            id: "transfer-active-record",
            conversationId: "direct:peer-a",
            name: "active.zip",
            status: "sending",
            files: ["active.zip", "docs/readme.md"],
            totalBytes: 8192,
            sentBytes: 2048,
          }),
          transferTask({
            id: "transfer-failed-record",
            conversationId: "direct:peer-b",
            name: "failed.zip",
            status: "failed",
            files: ["failed.zip"],
            errorMessage: "network lost",
            totalBytes: 4096,
            sentBytes: 1024,
            resumable: false,
          }),
        ],
      },
    });

    expect(screen.queryByRole("button", { name: "复制 active.zip 传输记录" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制 failed.zip 传输记录" })).not.toBeInTheDocument();
    expect(copyTransferDiagnostics).not.toHaveBeenCalled();
  });

  it("offers resume for failed transfer history", async () => {
    const resumeTransfer = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [transferTask()],
        onResumeTransfer: resumeTransfer,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "重新广播" }));

    const failedTransfer = screen.getByText("设计稿.zip").closest("article");
    expect(failedTransfer).not.toBeNull();
    expect(
      within(failedTransfer as HTMLElement).getByText("失败"),
    ).toBeInTheDocument();
    expect(screen.getByText("失败原因：connection reset")).toBeInTheDocument();
    expect(resumeTransfer).toHaveBeenCalledWith("transfer-failed");
  });

  it("does not offer resume when a failed transfer has no local source", () => {
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
        transferTasks: [transferTask({ resumable: false })],
      },
    });

    expect(
      screen.queryByRole("button", { name: "重新广播" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("本机缺少可重新广播的源文件或授权信息"),
    ).toBeInTheDocument();
  });
});

describe("WorkspacePanel contacts empty state", () => {
  it("filters contacts by favorite and blocked status", async () => {
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-a",
            display_name: "Alice",
            status: "online",
          }),
          selfProfile({
            peer_id: "peer-b",
            display_name: "Bob",
            status: "offline",
          }),
          selfProfile({
            peer_id: "peer-c",
            display_name: "Carol",
            status: "online",
          }),
        ],
        contactMetadata: {
          "peer-a": {
            peer_id: "peer-a",
            remark: "",
            group_name: "",
            favorite: true,
            blocked: false,
          },
          "peer-b": {
            peer_id: "peer-b",
            remark: "",
            group_name: "",
            favorite: false,
            blocked: true,
          },
          "peer-c": {
            peer_id: "peer-c",
            remark: "",
            group_name: "",
            favorite: false,
            blocked: false,
          },
        },
      },
    });

    const directory = screen.getByLabelText("联系人概览")
      .parentElement as HTMLElement;

    await fireEvent.click(screen.getByRole("tab", { name: "星标" }));
    expect(within(directory).getByText("Alice")).toBeInTheDocument();
    expect(within(directory).queryByText("Bob")).not.toBeInTheDocument();
    expect(within(directory).queryByText("Carol")).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("tab", { name: "阻止" }));
    expect(within(directory).getByText("Bob")).toBeInTheDocument();
    expect(within(directory).queryByText("Alice")).not.toBeInTheDocument();
  });

  it("renders unreachable contact states as a single gray unavailable state", () => {
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-away",
            display_name: "Away Alice",
            status: "away",
          }),
          selfProfile({
            peer_id: "peer-offline",
            display_name: "Offline Bob",
            status: "offline",
          }),
        ],
      },
    });

    const awayPresence = screen.getAllByLabelText("Away Alice 暂不可达状态");
    const offlinePresence =
      screen.getAllByLabelText("Offline Bob 暂不可达状态");
    expect(awayPresence.length).toBeGreaterThan(0);
    expect(offlinePresence.length).toBeGreaterThan(0);
    for (const presence of [...awayPresence, ...offlinePresence]) {
      expect(presence).toHaveClass("offline");
      expect(presence).toHaveAttribute("title", "暂不可达");
    }
    expect(
      screen.queryByLabelText("Away Alice 离开状态"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Offline Bob 离线状态"),
    ).not.toBeInTheDocument();
  });

  it("renders one discovery list and highlights peer IP endpoints without repeated reachability groups", () => {
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-online",
            display_name: "Online Alice",
            hostname: "alice-pc",
            status: "online",
            endpoints: ["192.168.31.24:24251"],
          }),
          selfProfile({
            peer_id: "peer-away",
            display_name: "Away Bob",
            hostname: "bob-pc",
            status: "away",
            endpoints: ["10.0.8.24:24251"],
          }),
        ],
      },
    });

    const list = screen.getByRole("region", { name: "发现设备列表" });
    expect(within(list).getByText("Online Alice")).toBeInTheDocument();
    expect(within(list).getByText("Away Bob")).toBeInTheDocument();
    expect(within(list).getByText("192.168.31.24:24251")).toHaveClass("contact-ip-pill");
    expect(within(list).getByText("10.0.8.24:24251")).toHaveClass("contact-ip-pill");
    expect(screen.queryByText("可联系设备")).not.toBeInTheDocument();
    expect(screen.queryByText("暂不可达设备")).not.toBeInTheDocument();
  });

  it("copies contact identity values from the contact profile", async () => {
    const copyIdentityValue = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-a",
            display_name: "Alice",
            fingerprint: "alice-fingerprint",
          }),
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    const profile = screen.getByRole("region", { name: "联系人资料" });
    await fireEvent.click(
      within(profile).getByRole("button", { name: "复制联系人设备 ID" }),
    );
    await fireEvent.click(
      within(profile).getByRole("button", { name: "复制联系人设备指纹" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith("peer-a", "联系人设备 ID");
    expect(copyIdentityValue).toHaveBeenCalledWith(
      "alice-fingerprint",
      "联系人设备指纹",
    );
  });

  it("copies contact direct endpoints from the contact profile", async () => {
    const copyIdentityValue = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-endpoint",
            display_name: "Endpoint Alice",
            endpoints: ["192.168.31.24:24251", "10.0.8.24:24251"],
          }),
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    const profile = screen.getByRole("region", { name: "联系人资料" });
    await fireEvent.click(
      within(profile).getByRole("button", { name: "复制联系人直连端点" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith(
      "192.168.31.24:24251\n10.0.8.24:24251",
      "联系人直连端点",
    );
  });

  it("copies a contact audit record from the contact profile", async () => {
    const copyIdentityValue = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
            endpoints: ["192.168.31.24:24251"],
            fingerprint: "alice-fingerprint",
          }),
        ],
        contactMetadata: {
          "peer-a": {
            peer_id: "peer-a",
            remark: "研发一号",
            group_name: "研发部",
            favorite: true,
            blocked: false,
          },
        },
        trustedPeers: [
          {
            peer_id: "peer-a",
            fingerprint: "alice-fingerprint",
            trusted_at: 1_700_000_000,
          },
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    const profile = screen.getByRole("region", { name: "联系人资料" });
    await fireEvent.click(
      within(profile).getByRole("button", { name: "复制记录" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledTimes(1);
    const [report, label] = copyIdentityValue.mock.calls[0];
    expect(label).toBe("研发一号 联系人记录");
    expect(report).toContain("灵犀内网通联系人记录");
    expect(report).toContain("显示名：Alice");
    expect(report).toContain("备注：研发一号");
    expect(report).toContain("分组：研发部");
    expect(report).toContain("状态：可联系");
    expect(report).toContain("安全策略：允许通信");
    expect(report).toContain("主机名：alice-pc");
    expect(report).toContain("直连端点：192.168.31.24:24251");
    expect(report).toContain("设备 ID：peer-a");
    expect(report).toContain("当前指纹：alice-fingerprint");
    expect(report).toContain("TOFU 信任：已信任");
    expect(report).toContain("信任指纹：alice-fingerprint");
    expect(report).toContain("指纹校验：一致");
  });

  it("focuses the requested contact profile from the sidebar contact action", () => {
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        focusedContactPeerId: "peer-b",
        peers: [
          selfProfile({
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
          }),
          selfProfile({
            peer_id: "peer-b",
            display_name: "Bob",
            hostname: "bob-pc",
          }),
        ],
      },
    });

    const profile = screen.getByRole("region", { name: "联系人资料" });
    expect(within(profile).getByRole("heading", { name: "Bob" })).toBeInTheDocument();
    expect(within(profile).getAllByText("bob-pc")).toHaveLength(2);
    expect(within(profile).queryByRole("heading", { name: "Alice" })).not.toBeInTheDocument();
  });

  it("does not offer network discovery configuration from empty contacts", () => {
    const openSettingsTab = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [],
        onOpenSettingsTab: openSettingsTab,
      },
    });

    expect(screen.queryByRole("button", { name: "配置网络发现" })).not.toBeInTheDocument();
    expect(screen.getByText(/暂无联系人/)).toBeInTheDocument();
    expect(openSettingsTab).not.toHaveBeenCalled();
  });
});
