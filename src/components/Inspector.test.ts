import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessage,
  ContactMetadata,
  ConversationSummary,
  NetworkSettings,
  PeerProfile,
  TransferTask,
  StorageOverview,
} from "../api";
import Inspector from "./Inspector.svelte";

const settings: NetworkSettings = {
  auto_discovery: true,
  multicast: true,
  seed_peers: [],
  scan_ranges: [],
  discovery_interval_secs: 3,
  peer_ttl_secs: 15,
};

const conversation: ConversationSummary = {
  id: "direct:peer-a",
  title: "Alice",
  last_message_at: 1700000000000,
  last_message_preview: "",
  unread_count: 0,
  pinned: false,
  muted: false,
  archived: false,
  draft_preview: "",
};

const storageOverview: StorageOverview = {
  data_dir: "C:/iim/data",
  database_path: "C:/iim/data/iim.sqlite",
  database_key_path: "C:/iim/data/db.key.dpapi",
  database_key_protection: "Windows DPAPI",
  received_files_dir: "C:/iim/data/received_files",
  staged_files_dir: "C:/iim/data/staged",
  database_bytes: 4096,
  received_bytes: 8192,
  staged_bytes: 2048,
  transfer_task_count: 3,
};

function transferTask(patch: Partial<TransferTask> = {}): TransferTask {
  return {
    id: "transfer-failed",
    name: "资料包.zip",
    status: "failed",
    errorMessage: "timeout",
    totalBytes: 8192,
    sentBytes: 2048,
    files: ["资料包.zip"],
    resumable: true,
    ...patch,
  };
}

function peer(patch: Partial<PeerProfile> = {}): PeerProfile {
  return {
    peer_id: "peer-a",
    display_name: "Alice",
    hostname: "alice-pc",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.42:24251"],
    fingerprint: "b".repeat(64),
    public_key: [2],
    ...patch,
  };
}

function message(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-file-1",
    conversation_id: "direct:peer-a",
    sender_id: "peer-a",
    body: "sent a file",
    attachments: [
      {
        type: "transfer",
        manifest: {
          transfer_id: "transfer-file-1",
          files: [
            {
              path: "C:\\Docs\\report.pdf",
              relative_path: "report.pdf",
              size: 2048,
              sha256: "1".repeat(64),
            },
          ],
          total_bytes: 2048,
          chunk_size: 262144,
          sha256: "2".repeat(64),
        },
      },
    ],
    created_at: 1700000000000,
    status: "received",
    recalled: false,
    quote: null,
    favorited: false,
    reactions: [],
    ...patch,
  };
}

function imageMessage(): ChatMessage {
  const item = message();
  item.id = "msg-image-1";
  item.body = "sent image";
  item.attachments[0].manifest.transfer_id = "transfer-image-1";
  item.attachments[0].manifest.files = [
    {
      path: "C:\\Pics\\screen.png",
      relative_path: "screen.png",
      size: 8192,
      sha256: "3".repeat(64),
    },
  ];
  item.attachments[0].manifest.total_bytes = 8192;
  return item;
}

describe("Inspector tabs", () => {
  it("offers the network status tab from a direct conversation", async () => {
    const tabChange = vi.fn();
    render(Inspector, {
      props: {
        settings,
        onTabChange: tabChange,
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: "网络" }));

    expect(tabChange).toHaveBeenCalledWith("network");
  });

  it("offers the storage tab from a direct conversation", async () => {
    const tabChange = vi.fn();
    render(Inspector, {
      props: {
        settings,
        onTabChange: tabChange,
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: "存储" }));

    expect(tabChange).toHaveBeenCalledWith("storage");
  });

  it("offers the network status tab from a group conversation", async () => {
    const tabChange = vi.fn();
    render(Inspector, {
      props: {
        settings,
        isGroup: true,
        onTabChange: tabChange,
      },
    });

    await fireEvent.click(screen.getByRole("tab", { name: "网络" }));

    expect(tabChange).toHaveBeenCalledWith("network");
  });

  it("copies the direct peer fingerprint from the security tab", async () => {
    const copyIdentityValue = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "security",
        activePeer: peer({ fingerprint: "alice-fingerprint" }),
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制设备指纹" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith(
      "alice-fingerprint",
      "Alice 设备指纹",
    );
  });

  it("copies direct conversation peer endpoints from the details tab", async () => {
    const copyIdentityValue = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "details",
        activePeer: peer({
          endpoints: ["192.168.1.42:24251", "10.8.0.42:24251"],
        }),
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制 Alice 直连端点" }),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith(
      "192.168.1.42:24251\n10.8.0.42:24251",
      "Alice 直连端点",
    );
  });

  it("separates current members from addable contacts in the group editor", async () => {
    const toggleMember = vi.fn();
    const announcementChange = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "研发群",
        groupAnnouncementDraft: "明天 10:00 发版，先完成回归。",
        groupMemberDraftIds: ["peer-a"],
        peers: [
          {
            peer_id: "local",
            display_name: "我",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          {
            peer_id: "peer-a",
            display_name: "研发一号",
            hostname: "rd-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
        ],
        allPeers: [
          {
            peer_id: "peer-a",
            display_name: "研发一号",
            hostname: "rd-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
          {
            peer_id: "peer-b",
            display_name: "运维二号",
            hostname: "ops-pc",
            avatar_hash: null,
            status: "away",
            endpoints: ["192.168.1.87:24251"],
            fingerprint: "c".repeat(64),
            public_key: [3],
          },
        ],
        onToggleGroupMember: toggleMember,
        onGroupAnnouncementChange: announcementChange,
      },
    });

    expect(screen.getByText("群公告")).toBeInTheDocument();
    const announcement = screen.getByLabelText("群公告");
    expect(announcement).toHaveValue("明天 10:00 发版，先完成回归。");
    await fireEvent.input(announcement, {
      target: { value: "今天只同步阻塞问题。" },
    });
    expect(announcementChange).toHaveBeenCalledWith("今天只同步阻塞问题。");

    const currentMembers = screen.getByRole("group", { name: "当前群成员" });
    expect(within(currentMembers).getByText("我（我）")).toBeInTheDocument();
    expect(within(currentMembers).getByText("研发一号")).toBeInTheDocument();

    const addableContacts = screen.getByRole("group", { name: "可添加联系人" });
    await fireEvent.click(within(addableContacts).getByTitle("添加 运维二号"));

    expect(toggleMember).toHaveBeenCalledWith("peer-b");
  });

  it("bulk adds reachable contacts and removes unavailable group members", async () => {
    const toggleMember = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "Ops",
        groupMemberDraftIds: ["peer-online", "peer-offline", "peer-missing"],
        peers: [
          {
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          {
            peer_id: "peer-online",
            display_name: "Online Member",
            hostname: "online-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.20:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
          {
            peer_id: "peer-offline",
            display_name: "Offline Member",
            hostname: "offline-pc",
            avatar_hash: null,
            status: "offline",
            endpoints: [],
            fingerprint: "c".repeat(64),
            public_key: [3],
          },
        ],
        allPeers: [
          {
            peer_id: "peer-online",
            display_name: "Online Member",
            hostname: "online-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.20:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
          {
            peer_id: "peer-add-online",
            display_name: "Add Online",
            hostname: "add-online-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.21:24251"],
            fingerprint: "d".repeat(64),
            public_key: [4],
          },
          {
            peer_id: "peer-add-offline",
            display_name: "Add Offline",
            hostname: "add-offline-pc",
            avatar_hash: null,
            status: "offline",
            endpoints: [],
            fingerprint: "e".repeat(64),
            public_key: [5],
          },
        ],
        onToggleGroupMember: toggleMember,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "添加可联系 1" }));
    await fireEvent.click(screen.getByRole("button", { name: "移除暂不可达 2" }));

    expect(toggleMember.mock.calls.map((call) => call[0])).toEqual([
      "peer-add-online",
      "peer-offline",
      "peer-missing",
    ]);
  });

  it("copies a group conversation diagnostic report from the members sidebar", async () => {
    const copyIdentityValue = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        conversation: {
          ...conversation,
          id: "group:ops",
          title: "Ops 群",
          pinned: true,
          muted: true,
        },
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "Ops 群",
        groupMemberDraftIds: ["peer-a", "peer-b"],
        peers: [
          {
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          peer({ peer_id: "peer-a", display_name: "Alice", status: "online" }),
          peer({ peer_id: "peer-b", display_name: "Bob", status: "offline" }),
        ],
        messages: [
          message({ conversation_id: "group:ops", status: "sending" }),
          message({ id: "msg-failed", conversation_id: "group:ops", status: "failed", attachments: [] }),
        ],
        transferTasks: [
          transferTask({ conversationId: "group:ops", status: "failed" }),
          transferTask({ id: "transfer-active", conversationId: "group:ops", status: "sending", errorMessage: "" }),
        ],
        networkWarnings: ["Group invite failed"],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "复制会话诊断" }));

    expect(copyIdentityValue).toHaveBeenCalledTimes(1);
    const [report, label] = copyIdentityValue.mock.calls[0];
    expect(label).toBe("会话诊断报告");
    expect(report).toContain("灵犀内网通会话诊断");
    expect(report).toContain("会话：Ops 群");
    expect(report).toContain("会话 ID：group:ops");
    expect(report).toContain("类型：群聊");
    expect(report).toContain("成员 3，可联系 2，暂不可达 1");
    expect(report).toContain("置顶：是");
    expect(report).toContain("免打扰：是");
    expect(report).toContain("消息数量：2");
    expect(report).toContain("待发送/发送中消息：1");
    expect(report).toContain("失败消息：1");
    expect(report).toContain("附件文件：1");
    expect(report).toContain("活跃传输：1");
    expect(report).toContain("失败传输：1");
    expect(report).toContain("最近网络警告：Group invite failed");
  });

  it("offers resume for failed transfers in the details sidebar", async () => {
    const resumeTransfer = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "transfers",
        transferTasks: [transferTask()],
        onResumeTransfer: resumeTransfer,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "重新广播" }));

    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("失败原因：timeout")).toBeInTheDocument();
    expect(resumeTransfer).toHaveBeenCalledWith("transfer-failed");
  });

  it("explains when failed transfers cannot be resumed", () => {
    render(Inspector, {
      props: {
        settings,
        tab: "transfers",
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

  it("shows group member presence and opens direct chat from the sidebar", async () => {
    const openDirectConversation = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "Ops",
        groupMemberDraftIds: ["peer-a"],
        peers: [
          {
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          {
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
            avatar_hash: null,
            status: "offline",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
        ],
        allPeers: [],
        onOpenDirectConversation: openDirectConversation,
      },
    });

    expect(screen.getByLabelText("Alice 暂不可达状态")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alice 离线状态")).not.toBeInTheDocument();
    expect(screen.queryByText("alice-pc · 暂不可达")).not.toBeInTheDocument();
    expect(screen.getByText("alice-pc")).toBeInTheDocument();

    await fireEvent.click(screen.getByTitle("与 Alice 私聊"));

    expect(openDirectConversation).toHaveBeenCalledWith("peer-a");
  });

  it("copies group member identity values from the members sidebar", async () => {
    const copyIdentityValue = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupMemberDraftIds: ["peer-a"],
        peers: [
          {
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          {
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "alice-fingerprint",
            public_key: [2],
          },
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    const currentMembers = screen.getByRole("group", { name: "当前群成员" });
    await fireEvent.click(
      within(currentMembers).getByTitle("复制 Alice 设备 ID"),
    );
    await fireEvent.click(
      within(currentMembers).getByTitle("复制 Alice 设备指纹"),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith("peer-a", "Alice 设备 ID");
    expect(copyIdentityValue).toHaveBeenCalledWith(
      "alice-fingerprint",
      "Alice 设备指纹",
    );
  });

  it("copies group member direct endpoints from the members sidebar", async () => {
    const copyIdentityValue = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupMemberDraftIds: ["peer-a"],
        peers: [
          peer({
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
          }),
          peer({
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
            endpoints: ["192.168.1.42:24251", "10.8.0.42:24251"],
            fingerprint: "alice-fingerprint",
          }),
        ],
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    const currentMembers = screen.getByRole("group", { name: "当前群成员" });
    await fireEvent.click(
      within(currentMembers).getByTitle("复制 Alice 直连端点"),
    );

    expect(copyIdentityValue).toHaveBeenCalledWith(
      "192.168.1.42:24251\n10.8.0.42:24251",
      "Alice 直连端点",
    );
  });

  it("filters group members by reachability", async () => {
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "Ops",
        groupMemberDraftIds: ["peer-online", "peer-offline"],
        peers: [
          {
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          {
            peer_id: "peer-online",
            display_name: "Online Alice",
            hostname: "online-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
          {
            peer_id: "peer-offline",
            display_name: "Offline Bob",
            hostname: "offline-pc",
            avatar_hash: null,
            status: "offline",
            endpoints: ["192.168.1.88:24251"],
            fingerprint: "c".repeat(64),
            public_key: [3],
          },
        ],
        allPeers: [],
      },
    });

    expect(
      screen.getByRole("button", { name: "可联系 2" }),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "暂不可达 1" }));

    const currentMembers = screen.getByRole("group", { name: "当前群成员" });
    expect(within(currentMembers).getByText("Offline Bob")).toBeInTheDocument();
    expect(
      within(currentMembers).queryByText("Online Alice"),
    ).not.toBeInTheDocument();
    expect(
      within(currentMembers).queryByText("Me（我）"),
    ).not.toBeInTheDocument();
  });

  it("keeps unresolved saved group members visible as unreachable placeholders", () => {
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "Ops",
        groupMemberDraftIds: ["peer-known", "peer-missing"],
        peers: [
          {
            peer_id: "local",
            display_name: "Me",
            hostname: "local-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["0.0.0.0:24251"],
            fingerprint: "a".repeat(64),
            public_key: [1],
          },
          {
            peer_id: "peer-known",
            display_name: "Known Alice",
            hostname: "known-pc",
            avatar_hash: null,
            status: "online",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
        ],
        allPeers: [],
      },
    });

    expect(screen.getByText("未发现成员")).toBeInTheDocument();
    expect(screen.getByText("peer-missing")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "暂不可达 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("+0 / -0")).toBeInTheDocument();
  });

  it("renders away group members with the gray offline visual tone", () => {
    render(Inspector, {
      props: {
        settings,
        tab: "members",
        isGroup: true,
        selfPeerId: "local",
        groupNameDraft: "Ops",
        groupMemberDraftIds: ["peer-a"],
        peers: [
          {
            peer_id: "peer-a",
            display_name: "Alice",
            hostname: "alice-pc",
            avatar_hash: null,
            status: "away",
            endpoints: ["192.168.1.42:24251"],
            fingerprint: "b".repeat(64),
            public_key: [2],
          },
        ],
        allPeers: [],
      },
    });

    const presence = screen.getByLabelText("Alice 暂不可达状态");
    expect(presence).toHaveClass("offline");
    expect(presence).not.toHaveClass("away");
    expect(presence).toHaveAttribute("title", "暂不可达");
    expect(screen.queryByText("离开")).not.toBeInTheDocument();
  });

  it("edits direct contact metadata from the details sidebar", async () => {
    const metadataChange = vi.fn();
    const saveMetadata = vi.fn();
    const contactMetadata: Record<string, ContactMetadata> = {
      "peer-a": {
        peer_id: "peer-a",
        remark: "Team Lead",
        group_name: "Ops",
        favorite: true,
        blocked: false,
      },
    };

    render(Inspector, {
      props: {
        settings,
        tab: "details",
        activePeer: peer(),
        contactMetadata,
        onContactMetadataChange: metadataChange,
        onSaveContactMetadata: saveMetadata,
      },
    });

    const contactCard = screen.getByLabelText("联系人资料");
    const remarkInput = within(contactCard).getByLabelText("备注");
    const groupInput = within(contactCard).getByLabelText("分组");

    expect(
      within(contactCard).getByDisplayValue("Team Lead"),
    ).toBeInTheDocument();
    expect(within(contactCard).getByDisplayValue("Ops")).toBeInTheDocument();

    await fireEvent.input(remarkInput, { target: { value: "Alice Ops" } });
    await fireEvent.input(groupInput, { target: { value: "Support" } });
    await fireEvent.click(
      within(contactCard).getByRole("button", { name: "取消星标" }),
    );
    await fireEvent.click(
      within(contactCard).getByRole("button", { name: "阻止联系人" }),
    );
    await fireEvent.click(
      within(contactCard).getByRole("button", { name: "保存联系人资料" }),
    );

    expect(metadataChange).toHaveBeenCalledWith("peer-a", {
      remark: "Alice Ops",
    });
    expect(metadataChange).toHaveBeenCalledWith("peer-a", {
      group_name: "Support",
    });
    expect(metadataChange).toHaveBeenCalledWith("peer-a", { favorite: false });
    expect(metadataChange).toHaveBeenCalledWith("peer-a", { blocked: true });
    expect(saveMetadata).toHaveBeenCalledWith("peer-a");
  });

  it("copies a direct conversation diagnostic report from the details sidebar", async () => {
    const copyIdentityValue = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "details",
        conversation: {
          ...conversation,
          pinned: false,
          muted: true,
          archived: true,
        },
        activePeer: peer({
          display_name: "Alice",
          endpoints: ["192.168.1.42:24251"],
          status: "online",
        }),
        messages: [
          message({ status: "queued" }),
          message({ id: "msg-ok", attachments: [] }),
        ],
        transferTasks: [
          transferTask({ conversationId: "direct:peer-a", status: "failed" }),
          transferTask({ id: "transfer-other", conversationId: "direct:other", status: "failed" }),
        ],
        networkWarning: "QUIC send failed",
        onCopyIdentityValue: copyIdentityValue,
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "复制会话诊断" }));

    expect(copyIdentityValue).toHaveBeenCalledTimes(1);
    const [report, label] = copyIdentityValue.mock.calls[0];
    expect(label).toBe("会话诊断报告");
    expect(report).toContain("灵犀内网通会话诊断");
    expect(report).toContain("会话：Alice");
    expect(report).toContain("会话 ID：direct:peer-a");
    expect(report).toContain("类型：直连");
    expect(report).toContain("Alice 可联系，端点 192.168.1.42:24251");
    expect(report).toContain("免打扰：是");
    expect(report).toContain("归档：是");
    expect(report).toContain("消息数量：2");
    expect(report).toContain("待发送/发送中消息：1");
    expect(report).toContain("附件文件：1");
    expect(report).toContain("失败传输：1");
    expect(report).toContain("最近网络警告：QUIC send failed");
  });

  it("shows recent conversation files from message attachments", async () => {
    const openTransfer = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "details",
        activePeer: peer(),
        messages: [message()],
        onOpenTransfer: openTransfer,
      },
    });

    const files = screen.getByLabelText("会话文件");
    expect(within(files).getByText("report.pdf")).toBeInTheDocument();
    expect(within(files).getByText("2.0 KB")).toBeInTheDocument();

    await fireEvent.click(within(files).getByRole("button", { name: "定位" }));

    expect(openTransfer).toHaveBeenCalledWith("transfer-file-1");
  });

  it("shows recent conversation images separately from generic files", async () => {
    const openTransfer = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "details",
        activePeer: peer(),
        messages: [message(), imageMessage()],
        onOpenTransfer: openTransfer,
      },
    });

    const images = screen.getByLabelText("会话图片");
    expect(within(images).getByText("screen.png")).toBeInTheDocument();
    expect(within(images).getByText("8.0 KB")).toBeInTheDocument();

    await fireEvent.click(within(images).getByRole("button", { name: "定位" }));

    expect(openTransfer).toHaveBeenCalledWith("transfer-image-1");
  });

  it("previews shared images from the conversation details gallery", async () => {
    const openTransfer = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "details",
        activePeer: peer(),
        messages: [imageMessage()],
        onOpenTransfer: openTransfer,
      },
    });

    const images = screen.getByLabelText("会话图片");
    await fireEvent.click(
      within(images).getByRole("button", { name: "预览图片 screen.png" }),
    );

    const dialog = screen.getByRole("dialog", { name: "图片预览 screen.png" });
    expect(
      within(dialog).getByRole("img", { name: "screen.png" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("8.0 KB · 对方")).toBeInTheDocument();

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "定位到传输任务" }),
    );
    expect(openTransfer).toHaveBeenCalledWith("transfer-image-1");

    await fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(
      screen.queryByRole("dialog", { name: "图片预览 screen.png" }),
    ).not.toBeInTheDocument();
  });

  it("filters transfer tasks to the active conversation when ownership is known", () => {
    render(Inspector, {
      props: {
        settings,
        tab: "transfers",
        conversation,
        transferTasks: [
          transferTask({
            id: "transfer-current",
            conversationId: "direct:peer-a",
            name: "current.zip",
          }),
          transferTask({
            id: "transfer-other",
            conversationId: "direct:peer-b",
            name: "other.zip",
          }),
        ],
      },
    });

    expect(screen.getByText("current.zip")).toBeInTheDocument();
    expect(screen.queryByText("other.zip")).not.toBeInTheDocument();
  });

  it("shows actionable storage controls in the details sidebar", async () => {
    const refreshStorage = vi.fn();
    const openStorage = vi.fn();
    const clearStagedFiles = vi.fn();
    const copyStoragePath = vi.fn();
    const copyStorageDiagnostics = vi.fn();
    render(Inspector, {
      props: {
        settings,
        tab: "storage",
        storageOverview,
        transferTasks: [transferTask(), transferTask({ id: "transfer-2" })],
        onRefreshStorage: refreshStorage,
        onOpenStorage: openStorage,
        onClearStagedFiles: clearStagedFiles,
        onCopyStoragePath: copyStoragePath,
        onCopyStorageDiagnostics: copyStorageDiagnostics,
      },
    });

    expect(screen.getAllByText("Windows DPAPI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10.0 KB").length).toBeGreaterThan(0);
    expect(screen.getByText("C:/iim/data/iim.sqlite")).toBeInTheDocument();
    expect(screen.getByText("C:/iim/data/received_files")).toBeInTheDocument();

    await fireEvent.click(
      screen.getByRole("button", { name: "刷新存储信息" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "打开接收目录" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "复制接收目录路径" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "复制存储诊断报告" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "清理剪贴板暂存" }),
    );

    expect(refreshStorage).toHaveBeenCalledOnce();
    expect(openStorage).toHaveBeenCalledWith("received");
    expect(copyStoragePath).toHaveBeenCalledWith("C:/iim/data/received_files", "接收目录路径");
    expect(copyStorageDiagnostics).toHaveBeenCalledTimes(1);
    expect(copyStorageDiagnostics.mock.calls[0][0]).toContain("灵犀内网通存储诊断");
    expect(copyStorageDiagnostics.mock.calls[0][0]).toContain("数据库：C:/iim/data/iim.sqlite");
    expect(clearStagedFiles).toHaveBeenCalledOnce();
  });
});

describe("Inspector network warnings", () => {
  it("shows invalid network input warnings in the network sidebar", () => {
    render(Inspector, {
      props: {
        settings,
        tab: "network",
        networkInputWarning: "已忽略无效网络配置：扫描网段 10.0.0.0/8",
      },
    });

    expect(
      screen.getByText("已忽略无效网络配置：扫描网段 10.0.0.0/8"),
    ).toBeInTheDocument();
  });

  it("shows recent network warnings as a troubleshooting list", () => {
    render(Inspector, {
      props: {
        settings,
        tab: "network",
        networkWarnings: ["文件公告未同步", "群聊邀请未广播"],
      },
    });

    const warnings = screen.getByRole("list", { name: "最近网络告警" });
    expect(within(warnings).getByText("文件公告未同步")).toBeInTheDocument();
    expect(within(warnings).getByText("群聊邀请未广播")).toBeInTheDocument();
  });

  it("copies a network diagnostic report from the network sidebar", async () => {
    const copyNetworkDiagnostics = vi.fn();
    render(Inspector, {
      props: {
        settings: {
          ...settings,
          auto_discovery: false,
          multicast: false,
          seed_peers: ["192.168.1.20"],
          scan_ranges: ["192.168.1.0/24"],
          discovery_interval_secs: 5,
          peer_ttl_secs: 45,
        },
        tab: "network",
        networkWarnings: ["UDP broadcast failed"],
        onCopyNetworkDiagnostics: copyNetworkDiagnostics,
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "复制网络诊断报告" }),
    );

    expect(copyNetworkDiagnostics).toHaveBeenCalledTimes(1);
    const report = copyNetworkDiagnostics.mock.calls[0][0] as string;
    expect(report).toContain("灵犀内网通网络诊断");
    expect(report).toContain("自动发现：关闭");
    expect(report).toContain("种子节点：192.168.1.20");
    expect(report).toContain("扫描网段：192.168.1.0/24");
    expect(report).toContain("最近警告：UDP broadcast failed");
  });
});
