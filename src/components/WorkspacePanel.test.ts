import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type {
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
  it("keeps the settings page heading concise", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
      },
    });

    expect(screen.getByRole("heading", { name: "设置", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("管理个人资料、直连网络、加密存储、安全信任、通知与外观。")).not.toBeInTheDocument();
  });

  it("keeps contact editing in the profile pane instead of expanding list rows", async () => {
    const updateMetadata = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
          }),
        ],
        contactMetadata: {
          "peer-a": {
            peer_id: "peer-a",
            remark: "研发一号",
            group_name: "研发部",
            favorite: false,
            blocked: false,
          },
        },
        onContactMetadataChange: updateMetadata,
      },
    });

    expect(document.querySelector(".contact-edit-grid")).not.toBeInTheDocument();
    const profile = screen.getByRole("region", { name: "联系人资料" });
    const remark = within(profile).getByRole("textbox", { name: "备注" });
    const group = within(profile).getByRole("textbox", { name: "分组" });
    expect(remark).toHaveValue("研发一号");
    expect(group).toHaveValue("研发部");

    await fireEvent.input(remark, { target: { value: "研发负责人" } });
    expect(updateMetadata).toHaveBeenCalledWith("peer-a", { remark: "研发负责人" });
  });

  it("keeps the transfer workspace heading concise", () => {
    render(WorkspacePanel, {
      props: {
        section: "files",
        settings,
      },
    });

    expect(screen.getByRole("heading", { name: "传输任务", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("以历史列表为主，快速检索文件名、任务 ID、状态和失败原因。")).not.toBeInTheDocument();
  });

  it("renders a compact profile card with host, endpoint, and status actions", async () => {
    const changeStatus = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        self: selfProfile({
          display_name: "林溪",
          hostname: "dev-pc",
          endpoints: ["192.168.1.77:24251"],
          status: "away",
        }),
        profileName: "林溪",
        profileHostname: "dev-pc",
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
    expect(within(card).getByText("dev-pc")).toBeInTheDocument();
    expect(within(card).getByText("192.168.1.77")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "离开" })).toHaveAttribute("aria-pressed", "true");

    await fireEvent.click(within(card).getByRole("button", { name: "在线" }));
    expect(changeStatus).toHaveBeenCalledWith("online");
  });

  it("keeps avatar editing with personal information and previews a custom image", async () => {
    const saveProfile = vi.fn();
    const saveProfileExtras = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        self: selfProfile({ display_name: "林溪" }),
        profileName: "林溪",
        avatarImage: "data:image/png;base64,avatar-preview",
        onSaveProfile: saveProfile,
        onSaveProfileExtras: saveProfileExtras,
      },
    });

    const card = screen.getByRole("region", { name: "个人名片" });
    expect(within(card).getByRole("img", { name: "当前头像" })).toHaveAttribute(
      "src",
      "data:image/png;base64,avatar-preview",
    );
    expect(screen.getByRole("region", { name: "头像设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传头像" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "保存个人信息" }));
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfileExtras).toHaveBeenCalledTimes(1);
  });

  it("opens avatar positioning in a focused dialog after choosing an image", async () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        self: selfProfile({ display_name: "林溪" }),
        profileName: "林溪",
      },
    });

    const input = screen.getByLabelText("选择头像图片");
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    await fireEvent.change(input, { target: { files: [file] } });

    const dialog = await screen.findByRole("dialog", { name: "调整头像" });
    expect(within(dialog).getByText("移动和缩放图片，选择头像显示范围")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("缩放")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("左右位置")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("上下位置")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "应用头像" })).toBeInTheDocument();
  });

  it("does not mix avatar editing into general preferences", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "preferences",
      },
    });

    expect(screen.queryByRole("region", { name: "头像设置" })).not.toBeInTheDocument();
  });

  it("falls back to contacts instead of rendering the legacy message workbench", () => {
    render(WorkspacePanel, {
      props: {
        section: "search" as never,
        settings,
      },
    });

    expect(screen.getByRole("heading", { name: "联系人", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "搜索结果" })).not.toBeInTheDocument();
    expect(screen.queryByText("消息待办")).not.toBeInTheDocument();
    expect(screen.queryByText("发件箱")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("region", { name: "偏好概览" })).not.toBeInTheDocument();
    const notificationPanel = screen.getByRole("region", { name: "提醒与隐私" });
    const notificationCommand = within(notificationPanel).getByRole("button", { name: "开启系统通知" });
    expect(notificationCommand).toHaveClass("section-compact-action");

    await fireEvent.click(notificationCommand);
    await fireEvent.click(within(notificationPanel).getByRole("switch", { name: "通知预览" }));

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

  it("marks the active settings category in the settings navigation", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "network",
      },
    });

    const nav = screen.getByRole("navigation", { name: "设置分类" });
    const profile = within(nav).getByRole("button", { name: "个人" });
    const network = within(nav).getByRole("button", { name: "网络" });
    expect(network).toHaveAttribute("aria-current", "page");
    expect(profile).not.toHaveAttribute("aria-current");
  });

  it("renders preference toggles as switches with checked state", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "preferences",
        notificationReady: true,
        showNotificationPreview: true,
        privacyMode: false,
        closeToTray: true,
        dark: false,
        loginEnabled: true,
      },
    });

    expect(screen.getByRole("switch", { name: "通知预览" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "隐私模式" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "关闭时隐藏到托盘" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "深色主题" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "登录密码" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "最小化到托盘" })).toHaveClass("section-compact-action");
  });

  it("keeps the notification preview preference stable while privacy mode overrides it", () => {
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "preferences",
        showNotificationPreview: true,
        privacyMode: true,
      },
    });

    const preview = screen.getByRole("switch", { name: "通知预览" });
    expect(preview).toHaveAttribute("aria-checked", "true");
    expect(preview).toBeDisabled();
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

  it("keeps support diagnostic copying out of network settings", () => {
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

    expect(screen.queryByRole("button", { name: "复制诊断报告" })).not.toBeInTheDocument();
    expect(copyNetworkDiagnostics).not.toHaveBeenCalled();
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
    expect(networkStatus).toHaveTextContent("最大尝试 3 次");
    expect(networkStatus).toHaveTextContent("重试批量 25");

    expect(screen.queryByRole("button", { name: "复制诊断报告" })).not.toBeInTheDocument();
    expect(copyNetworkDiagnostics).not.toHaveBeenCalled();
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

  it("navigates settings categories with arrow and boundary keys", async () => {
    const openSettingsTab = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "profile",
        onOpenSettingsTab: openSettingsTab,
      },
    });

    const profileTab = screen.getByRole("button", { name: "个人" });
    expect(profileTab).toHaveAttribute("aria-current", "page");

    await fireEvent.keyDown(profileTab, { key: "ArrowDown" });
    expect(openSettingsTab).toHaveBeenLastCalledWith("network");
    expect(screen.getByRole("button", { name: "网络" })).toHaveAttribute("aria-current", "page");

    await fireEvent.keyDown(screen.getByRole("button", { name: "网络" }), { key: "End" });
    expect(openSettingsTab).toHaveBeenLastCalledWith("preferences");
    expect(screen.getByRole("button", { name: "偏好" })).toHaveAttribute("aria-current", "page");
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

  it("keeps diagnostic report copying out of storage settings", () => {
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

    expect(screen.queryByRole("button", { name: "复制存储诊断报告" })).not.toBeInTheDocument();
    expect(copyStorageDiagnostics).not.toHaveBeenCalled();
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

  it("searches discovered and trusted devices in one list", async () => {
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

    await fireEvent.input(screen.getByRole("textbox", { name: "搜索设备指纹" }), {
      target: { value: "beta" },
    });

    expect(screen.getByText("peer-beta")).toBeInTheDocument();
    expect(screen.queryByText("peer-alpha")).not.toBeInTheDocument();
    expect(screen.getByText("已信任")).toBeInTheDocument();
    expect(copyTrustedFingerprint).not.toHaveBeenCalled();
  });

  it("renders trusted devices in batches and loads the next batch at the scroll boundary", async () => {
    const trustedPeers = Array.from({ length: 60 }, (_, index) => ({
      peer_id: `peer-${String(index + 1).padStart(2, "0")}`,
      fingerprint: `fingerprint-${String(index + 1).padStart(2, "0")}`,
      trusted_at: 1_700_000_000 + index,
    }));
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        trustedPeers,
      },
    });

    const list = screen.getByLabelText("设备指纹列表");
    expect(within(list).getByText("peer-25")).toBeInTheDocument();
    expect(within(list).queryByText("peer-26")).not.toBeInTheDocument();
    expect(screen.getByText(/25 \/ 60 台/)).toBeInTheDocument();

    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 260 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 350 },
    });
    await fireEvent.scroll(list);

    await waitFor(() => {
      expect(within(list).getByText("peer-26")).toBeInTheDocument();
      expect(screen.getByText(/50 \/ 60 台/)).toBeInTheDocument();
    });
  });

  it("searches every discovered device without rendering the complete list first", async () => {
    const peers = Array.from({ length: 60 }, (_, index) => {
      const number = index + 1;
      return selfProfile({
        peer_id: `device-${String(number).padStart(2, "0")}`,
        display_name: `设备 ${number}`,
        hostname: `office-${number}`,
        endpoints: [`10.20.30.${number}:24251`],
        fingerprint: `device-fingerprint-${number}`,
      });
    });
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        peers,
      },
    });

    const list = screen.getByLabelText("设备指纹列表");
    expect(within(list).queryByText("设备 54")).not.toBeInTheDocument();
    await fireEvent.input(screen.getByRole("textbox", { name: "搜索设备指纹" }), {
      target: { value: "10.20.30.54" },
    });

    expect(within(list).getByText("设备 54")).toBeInTheDocument();
    expect(within(list).queryByText("设备 1")).not.toBeInTheDocument();
    expect(screen.getByText(/1 \/ 1 台/)).toBeInTheDocument();
  });

  it("refreshes discovered and trusted fingerprints together", async () => {
    const refreshPeers = vi.fn();
    const refreshTrustedPeers = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "settings",
        settings,
        settingsTab: "security",
        onRefreshPeers: refreshPeers,
        onRefreshTrustedPeers: refreshTrustedPeers,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "刷新设备指纹" }));

    expect(refreshPeers).toHaveBeenCalledTimes(1);
    expect(refreshTrustedPeers).toHaveBeenCalledTimes(1);
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
	
	    const policy = screen.getByRole("radiogroup", { name: "通信权限策略" });
	    expect(within(policy).getByRole("radio", { name: "无需加好友" })).toHaveAttribute("aria-checked", "true");
	    expect(within(policy).getByText("默认：无需加好友")).toBeInTheDocument();
	    expect(within(policy).getByText("同网段发现后可直接发消息和文件；设备指纹仍会被 TOFU 校验。")).toBeInTheDocument();
	    expect(screen.getByText("已信任设备不是好友列表")).toBeInTheDocument();
	    expect(screen.getByText("它只保存设备 ID 与证书指纹。默认模式仍允许发现设备直接通信；仅联系人模式下，添加好友后会自动建立设备信任。")).toBeInTheDocument();
	
	    await fireEvent.click(within(policy).getByRole("radio", { name: "仅联系人可通信" }));
	
	    expect(toggleRequireContact).toHaveBeenCalledWith(true);
	  });

  it("shows a trusted device with current IP and fingerprint status", () => {
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

    const list = screen.getByLabelText("设备指纹列表");
    expect(within(list).getByText("Beta Device")).toBeInTheDocument();
    expect(within(list).getByText("beta-host · 192.168.1.42")).toBeInTheDocument();
    expect(within(list).getByText("已信任")).toBeInTheDocument();
    expect(within(list).queryByText(/24251/)).not.toBeInTheDocument();
    expect(copyIdentityValue).not.toHaveBeenCalled();
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

    expect(screen.getByText("指纹异常")).toHaveClass("danger");
  });

  it("keeps diagnostic report copying out of security settings", () => {
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

    expect(screen.queryByRole("button", { name: "复制诊断报告" })).not.toBeInTheDocument();
    expect(copyIdentityValue).not.toHaveBeenCalled();
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

    const privacySwitch = screen.getByRole("switch", { name: "隐私模式" });
    expect(privacySwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "通知预览" })).toBeDisabled();

    await fireEvent.click(privacySwitch);

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
  it("keeps group selection controls inside the group dialog", async () => {
    const createGroup = vi.fn();
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [selfProfile({ peer_id: "peer-a", display_name: "Alice" })],
        onCreateGroup: createGroup,
      },
    });

    const overview = screen.getByLabelText("联系人概览");
    const createButton = screen.getByRole("button", { name: "创建群聊" });
    expect(within(overview).queryByText(/已选/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 Alice 加入群聊" })).not.toBeInTheDocument();
    expect(createButton).toBeEnabled();

    await fireEvent.click(createButton);
    expect(createGroup).toHaveBeenCalledTimes(1);
  });

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

  it("shows peer IP addresses without ports in both list and details", () => {
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
        focusedContactPeerId: "peer-online",
      },
    });

    const list = screen.getByRole("region", { name: "发现设备列表" });
    expect(within(list).getByText("Online Alice")).toBeInTheDocument();
    expect(within(list).getByText("Away Bob")).toBeInTheDocument();
    expect(within(list).getByText("192.168.31.24")).toBeInTheDocument();
    expect(within(list).getByText("10.0.8.24")).toBeInTheDocument();
    expect(within(list).queryByText("192.168.31.24:24251")).not.toBeInTheDocument();
    const profile = screen.getByRole("region", { name: "联系人资料" });
    expect(within(profile).getByText("192.168.31.24")).toBeInTheDocument();
    expect(within(profile).queryByText("192.168.31.24:24251")).not.toBeInTheDocument();
    expect(screen.queryByText("可联系设备")).not.toBeInTheDocument();
    expect(screen.queryByText("暂不可达设备")).not.toBeInTheDocument();
  });

  it("searches contacts by IP address without disturbing the profile layout", async () => {
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [
          selfProfile({ peer_id: "peer-a", display_name: "研发一号", hostname: "rd-01", endpoints: ["192.168.10.8:24251"] }),
          selfProfile({ peer_id: "peer-b", display_name: "客服二号", hostname: "support-02", endpoints: ["10.20.30.40:24251"] }),
        ],
      },
    });

    await fireEvent.input(screen.getByRole("searchbox", { name: "搜索联系人" }), { target: { value: "10.20.30" } });

    const list = screen.getByRole("region", { name: "发现设备列表" });
    expect(within(list).getByText("support-02")).toBeInTheDocument();
    expect(within(list).queryByText("rd-01")).not.toBeInTheDocument();
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

  it("copies contact IP addresses without ports from the contact profile", async () => {
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
      within(profile).getByRole("button", { name: "复制联系人 IP 地址" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith(
      "192.168.31.24\n10.0.8.24",
      "联系人 IP 地址",
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
    await fireEvent.click(within(profile).getByText("设备与安全信息"));
    await fireEvent.click(
      within(profile).getByRole("button", { name: "复制设备记录" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledTimes(1);
    const [report, label] = copyIdentityValue.mock.calls[0];
    expect(label).toBe("研发一号 联系人记录");
    expect(report).toContain("iim 联系人记录");
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

  it("shows visible disabled refresh feedback while contacts are refreshing", () => {
    render(WorkspacePanel, {
      props: {
        section: "contacts",
        settings,
        peers: [],
        refreshingPeers: true,
      },
    });

    const refreshActions = document.querySelectorAll<HTMLButtonElement>(".refresh-action");
    expect(refreshActions.length).toBeGreaterThanOrEqual(2);
    for (const action of refreshActions) {
      expect(action).toBeDisabled();
      expect(action).toHaveAttribute("aria-busy", "true");
      expect(action).toHaveClass("loading");
    }
  });
});
