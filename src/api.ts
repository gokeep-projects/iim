import { invoke } from "@tauri-apps/api/core";

export type PeerStatus = "online" | "away" | "offline";

export interface PeerProfile {
  peer_id: string;
  display_name: string;
  hostname: string;
  avatar_hash?: string | null;
  status: PeerStatus;
  endpoints: string[];
  fingerprint: string;
  public_key?: number[];
}

export interface ContactMetadata {
  peer_id: string;
  remark: string;
  group_name: string;
  favorite: boolean;
  blocked: boolean;
}

export interface TrustedPeer {
  peer_id: string;
  fingerprint: string;
  trusted_at: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  group_announcement?: string;
  group_announcement_pinned?: boolean;
  group_owner_peer_id?: string;
  last_message_at: number;
  last_message_preview: string;
  unread_count: number;
  manual_unread: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  draft_preview: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachments: MessageAttachment[];
  created_at: number;
  status: "queued" | "sending" | "delivered" | "read" | "failed" | "received";
  recalled: boolean;
  quote?: MessageQuote | null;
  favorited: boolean;
  reactions: MessageReaction[];
  send_attempts?: number;
  last_attempt_at?: number;
}

export interface MessageReaction {
  sender_id: string;
  reaction: string;
}

export interface MessageDeliveryReceipt {
  peer_id: string;
  acknowledged_at: number | null;
}

export interface MessageAttachment {
  type: "transfer" | string;
  manifest: TransferManifest;
}

export interface MessageQuote {
  message_id: string;
  sender_id: string;
  body_preview: string;
}

export interface ConversationDraft {
  conversation_id: string;
  text: string;
  quote?: MessageQuote | null;
  updated_at: number;
}

export interface NetworkSettings {
  auto_discovery: boolean;
  multicast: boolean;
  seed_peers: string[];
  scan_ranges: string[];
  discovery_interval_secs: number;
  peer_ttl_secs: number;
}

export interface OutboxDeliveryPolicy {
  retry_after_millis: number;
  max_attempts: number;
  batch_limit: number;
}

export interface TransportConfig {
  listen_port: number;
  heartbeat_secs: number;
  max_idle_timeout_secs: number;
  outbox: OutboxDeliveryPolicy;
}

export const defaultTransportConfig: TransportConfig = {
  listen_port: 24251,
  heartbeat_secs: 15,
  max_idle_timeout_secs: 60,
  outbox: {
    retry_after_millis: 10_000,
    max_attempts: 3,
    batch_limit: 50,
  },
};

export type SendShortcut = "enter" | "ctrl_enter";
export type ScreenshotShortcut = "ctrl_alt_a" | "ctrl_shift_a" | "none";
export type WindowShortcut = "ctrl_alt_i" | "ctrl_shift_i" | "none";

export interface AppShortcuts {
  send_message: SendShortcut;
  screenshot: ScreenshotShortcut;
  toggle_window: WindowShortcut;
}

export const defaultAppShortcuts: AppShortcuts = {
  send_message: "enter",
  screenshot: "ctrl_alt_a",
  toggle_window: "ctrl_alt_i",
};

export interface AppPreferences {
  dark_mode: boolean;
  send_shortcut: SendShortcut;
  shortcuts: AppShortcuts;
  show_notification_preview: boolean;
  privacy_mode: boolean;
  close_to_tray: boolean;
  login_enabled: boolean;
  login_password_hash: string;
  profile_signature: string;
  avatar_label: string;
  avatar_image: string;
  require_contact_for_messaging: boolean;
}

export interface TransferManifest {
  transfer_id: string;
  files: Array<{
    path: string;
    relative_path?: string | null;
    size: number;
    sha256: string;
  }>;
  total_bytes: number;
  chunk_size: number;
  sha256: string;
}

export interface TransferTask {
  id: string;
  conversationId?: string;
  name: string;
  status: string;
  errorMessage: string;
  totalBytes: number;
  sentBytes: number;
  files: string[];
  resumable: boolean;
}

export interface PendingFileDraft {
  id: string;
  name: string;
  path: string;
  sourceLabel: string;
  size?: number | null;
  directory?: boolean;
}

export interface StorageOverview {
  data_dir: string;
  database_path: string;
  database_key_path: string;
  database_key_protection: string;
  received_files_dir: string;
  staged_files_dir: string;
  database_bytes: number;
  received_bytes: number;
  staged_bytes: number;
  transfer_task_count: number;
}

export interface StorageMigrationProgress {
  phase: string;
  completed: number;
  total: number;
  current_path: string;
}

export interface TypingEvent {
  conversation_id: string;
  sender_id: string;
  display_name: string;
  active: boolean;
  updated_at: number;
}

export interface NudgeEvent {
  conversation_id: string;
  sender_id: string;
  display_name: string;
  nudged_at: number;
}

const demoTransfers: TransferTask[] = [
  {
    id: "preview-transfer-active",
    conversationId: "direct:demo-peer",
    name: "设计稿同步",
    status: "sending",
    errorMessage: "",
    totalBytes: 12582912,
    sentBytes: 5242880,
    files: ["首页设计.fig", "组件标注.png", "交互说明.md"],
    resumable: false,
  },
  {
    id: "preview-transfer-history",
    conversationId: "direct:demo-peer",
    name: "历史资料包",
    status: "delivered",
    errorMessage: "",
    totalBytes: 5242880,
    sentBytes: 5242880,
    files: ["历史资料包.zip", "说明.txt"],
    resumable: false,
  },
];

const hasTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const demoPeer: PeerProfile = {
  peer_id: "demo-peer",
  display_name: "研发一号",
  hostname: "rd-pc",
  avatar_hash: null,
  status: "online",
  endpoints: ["192.168.1.42:24251"],
  fingerprint: "f".repeat(64),
  public_key: Array(32).fill(15),
};

const demoOpsPeer: PeerProfile = {
  peer_id: "ops-peer",
  display_name: "运维二号",
  hostname: "ops-pc",
  avatar_hash: null,
  status: "online",
  endpoints: ["192.168.1.87:24251"],
  fingerprint: "b".repeat(64),
  public_key: Array(32).fill(11),
};

const demoOfflinePeer: PeerProfile = {
  peer_id: "offline-peer",
  display_name: "设计三号",
  hostname: "design-pc",
  avatar_hash: null,
  status: "offline",
  endpoints: ["192.168.1.99:24251"],
  fingerprint: "c".repeat(64),
  public_key: Array(32).fill(12),
};

const demoQaPeer: PeerProfile = {
  peer_id: "qa-peer",
  display_name: "测试四号",
  hostname: "qa-pc",
  avatar_hash: null,
  status: "online",
  endpoints: ["192.168.1.66:24251"],
  fingerprint: "d".repeat(64),
  public_key: Array(32).fill(13),
};

const demoFinancePeer: PeerProfile = {
  peer_id: "finance-peer",
  display_name: "财务五号",
  hostname: "finance-pc",
  avatar_hash: null,
  status: "away",
  endpoints: ["192.168.1.76:24251"],
  fingerprint: "e".repeat(64),
  public_key: Array(32).fill(14),
};

const demoHrPeer: PeerProfile = {
  peer_id: "hr-peer",
  display_name: "人事六号",
  hostname: "hr-pc",
  avatar_hash: null,
  status: "online",
  endpoints: ["192.168.1.86:24251"],
  fingerprint: "9".repeat(64),
  public_key: Array(32).fill(9),
};

const demoExtraPeers: PeerProfile[] = [
  {
    peer_id: "demo-rd",
    display_name: "研发七号",
    hostname: "rd-node",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.107:24251"],
    fingerprint: "a".repeat(64),
    public_key: Array(32).fill(10),
  },
  {
    peer_id: "demo-support",
    display_name: "客服八号",
    hostname: "support-desk",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.118:24251"],
    fingerprint: "1".repeat(64),
    public_key: Array(32).fill(16),
  },
  {
    peer_id: "demo-admin",
    display_name: "行政九号",
    hostname: "admin-room",
    avatar_hash: null,
    status: "away",
    endpoints: ["192.168.1.129:24251"],
    fingerprint: "2".repeat(64),
    public_key: Array(32).fill(17),
  },
  {
    peer_id: "demo-security",
    display_name: "安保十号",
    hostname: "security-gate",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.146:24251"],
    fingerprint: "3".repeat(64),
    public_key: Array(32).fill(18),
  },
  {
    peer_id: "demo-market",
    display_name: "市场十二号",
    hostname: "marketing-pc",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.162:24251"],
    fingerprint: "4".repeat(64),
    public_key: Array(32).fill(19),
  },
  {
    peer_id: "demo-frontdesk",
    display_name: "前台十四号",
    hostname: "frontdesk",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.184:24251"],
    fingerprint: "5".repeat(64),
    public_key: Array(32).fill(20),
  },
  {
    peer_id: "demo-lab",
    display_name: "实验室十五号",
    hostname: "lab-node",
    avatar_hash: null,
    status: "online",
    endpoints: ["192.168.1.195:24251"],
    fingerprint: "6".repeat(64),
    public_key: Array(32).fill(21),
  },
];

const demoTrustedPeers: TrustedPeer[] = [
  {
    peer_id: demoPeer.peer_id,
    fingerprint: demoPeer.fingerprint,
    trusted_at: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    peer_id: demoOpsPeer.peer_id,
    fingerprint: demoOpsPeer.fingerprint,
    trusted_at: Math.floor(Date.now() / 1000) - 7200,
  },
];

const localProfile: PeerProfile = {
  peer_id: "local-demo",
  display_name: "本机用户",
  hostname: "本机预览",
  avatar_hash: null,
  status: "online",
  endpoints: ["0.0.0.0:24251"],
  fingerprint: "a".repeat(64),
  public_key: Array(32).fill(10),
};

const demoMessages = (conversationId: string): ChatMessage[] => [
  {
    id: "hello",
    conversation_id: conversationId,
    sender_id: "demo-peer",
    body: "欢迎使用 iim。无需服务器，同网段自动发现；联系人页就是设备发现与管理入口。",
    attachments: [],
    created_at: Date.now() - 180000,
    status: "received",
    recalled: false,
    quote: null,
    favorited: true,
    reactions: [{ sender_id: "local-demo", reaction: "👍" }],
  },
  {
    id: "file",
    conversation_id: conversationId,
    sender_id: "local-demo",
    body: "文件、截图、群聊、聊天记录搜索、安全信任和网络配置入口都已经接到功能闭环。",
    attachments: [
      {
        type: "transfer",
        manifest: {
          transfer_id: "preview-transfer-history",
          files: [
            { path: "历史资料包.zip", size: 5242880, sha256: "0".repeat(64) },
          ],
          total_bytes: 5242880,
          chunk_size: 262144,
          sha256: "0".repeat(64),
        },
      },
    ],
    created_at: Date.now() - 60000,
    status: "queued",
    recalled: false,
    favorited: false,
    reactions: [],
    quote: {
      message_id: "hello",
      sender_id: "demo-peer",
      body_preview: "欢迎使用 iim。无需服务器...",
    },
  },
];

export async function getSelfProfile(): Promise<PeerProfile> {
  if (!hasTauri()) return localProfile;
  return invoke("get_self_profile");
}

export async function updateSelfProfile(
  profile: PeerProfile,
): Promise<PeerProfile> {
  if (!hasTauri()) return profile;
  return invoke("update_self_profile", { profile });
}

export async function listPeers(): Promise<PeerProfile[]> {
  if (!hasTauri()) {
    return [demoPeer, demoOpsPeer, demoOfflinePeer, demoQaPeer, demoFinancePeer, demoHrPeer, ...demoExtraPeers];
  }
  return invoke("list_peers");
}

export async function listContactMetadata(): Promise<ContactMetadata[]> {
  if (!hasTauri()) {
    return [
      {
        peer_id: "demo-peer",
        remark: "研发一号",
        group_name: "研发部",
        favorite: true,
        blocked: false,
      },
      {
        peer_id: "ops-peer",
        remark: "运维二号",
        group_name: "运维",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "offline-peer",
        remark: "设计三号",
        group_name: "设计",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "qa-peer",
        remark: "测试四号",
        group_name: "研发部",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "finance-peer",
        remark: "财务五号",
        group_name: "职能",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "hr-peer",
        remark: "人事六号",
        group_name: "职能",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-rd",
        remark: "研发七号",
        group_name: "研发部",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-support",
        remark: "客服八号",
        group_name: "客服",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-admin",
        remark: "行政九号",
        group_name: "职能",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-security",
        remark: "安保十号",
        group_name: "园区",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-market",
        remark: "市场十二号",
        group_name: "市场",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-frontdesk",
        remark: "前台十四号",
        group_name: "园区",
        favorite: false,
        blocked: false,
      },
      {
        peer_id: "demo-lab",
        remark: "实验室十五号",
        group_name: "研发部",
        favorite: false,
        blocked: false,
      },
    ];
  }
  return invoke("list_contact_metadata");
}

export async function updateContactMetadata(
  metadata: ContactMetadata,
): Promise<ContactMetadata> {
  if (!hasTauri()) return metadata;
  return invoke("update_contact_metadata", { metadata });
}

export async function listConversations(): Promise<ConversationSummary[]> {
  if (!hasTauri()) {
    return [
      {
        id: "direct:demo-peer",
        title: "研发一号",
        group_owner_peer_id: "",
        last_message_at: Date.now(),
        last_message_preview: "文件、截图、群聊和聊天记录搜索都已就绪",
        unread_count: 0,
        manual_unread: false,
        pinned: true,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "group:lan",
        title: "内网群聊",
        group_owner_peer_id: "local-demo",
        last_message_at: Date.now() - 60000,
        last_message_preview: "今天的内网同步会议 15:00 开始",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "group:project-alpha",
        title: "Alpha 项目组",
        group_owner_peer_id: "local-demo",
        last_message_at: Date.now() - 120000,
        last_message_preview: "请测试、研发、设计同步今天的打包验收结果。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "group:office",
        title: "办公室通知",
        group_owner_peer_id: "local-demo",
        last_message_at: Date.now() - 180000,
        last_message_preview: "下午 15:00 内网同步会，文件请直接拖到聊天框。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "group:support-shift",
        title: "客服值班群",
        group_owner_peer_id: "local-demo",
        last_message_at: Date.now() - 210000,
        last_message_preview: "晚班同事请确认文件接收目录和通知开关。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "group:ops-security",
        title: "运维安保联动群",
        group_owner_peer_id: "local-demo",
        last_message_at: Date.now() - 300000,
        last_message_preview: "门禁网段今晚升级，运维和安保同步观察广播发现。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: true,
        archived: false,
        draft_preview: "",
      },
      {
        id: "group:all-hands",
        title: "全员通知群",
        group_owner_peer_id: "local-demo",
        last_message_at: Date.now() - 420000,
        last_message_preview: "新版 iim 已在内网灰度，大家可以用群聊和文件传输试用。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "direct:ops-peer",
        title: "运维二号",
        group_owner_peer_id: "",
        last_message_at: Date.now() - 240000,
        last_message_preview: "跨网段种子节点已更新，稍后刷新联系人。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "direct:demo-support",
        title: "客服八号",
        group_owner_peer_id: "",
        last_message_at: Date.now() - 540000,
        last_message_preview: "客户截图可以直接粘贴发送，文件也支持拖拽。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "direct:demo-market",
        title: "市场十二号",
        group_owner_peer_id: "",
        last_message_at: Date.now() - 650000,
        last_message_preview: "宣传物料我放到共享目录，也可以直接走文件传输。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
      {
        id: "direct:demo-frontdesk",
        title: "前台十四号",
        group_owner_peer_id: "",
        last_message_at: Date.now() - 760000,
        last_message_preview: "访客 Wi-Fi 这边已确认，不影响办公网广播。",
        unread_count: 0,
        manual_unread: false,
        pinned: false,
        muted: false,
        archived: false,
        draft_preview: "",
      },
    ];
  }
  return invoke("list_conversations");
}

export async function getConversationDraft(
  conversationId: string,
): Promise<ConversationDraft | null> {
  if (!hasTauri()) return null;
  return invoke("get_conversation_draft", { conversationId });
}

export async function saveConversationDraft(
  conversationId: string,
  text: string,
  quote: MessageQuote | null,
): Promise<ConversationSummary | null> {
  if (!hasTauri()) return null;
  return invoke("save_conversation_draft", { conversationId, text, quote });
}

export async function listMessages(
  conversationId: string,
  beforeCreatedAt?: number | null,
  limit = 200,
): Promise<ChatMessage[]> {
  if (!hasTauri()) {
    const messages = demoMessages(conversationId).filter(
      (message) => !beforeCreatedAt || message.created_at < beforeCreatedAt,
    );
    return messages.slice(Math.max(0, messages.length - limit));
  }
  return invoke("list_messages", { conversationId, limit, beforeCreatedAt });
}

export async function exportConversationHistory(
  conversationId: string,
  path: string,
): Promise<string> {
  if (!hasTauri()) return path;
  return invoke("export_conversation_history", { conversationId, path });
}

export async function deleteMessage(messageId: string): Promise<void> {
  if (!hasTauri()) return;
  return invoke("delete_message", { messageId });
}

export async function retryMessage(message: ChatMessage): Promise<ChatMessage> {
  if (!hasTauri()) return { ...message, status: "queued" };
  return invoke("retry_message", { messageId: message.id });
}

export async function setMessageFavorite(
  message: ChatMessage,
  favorite: boolean,
): Promise<ChatMessage> {
  if (!hasTauri()) return { ...message, favorited: favorite };
  return invoke("set_message_favorite", { messageId: message.id, favorite });
}

export async function setMessagePin(
  message: ChatMessage,
  pinned: boolean,
): Promise<ChatMessage> {
  if (!hasTauri()) return message;
  return invoke("set_message_pin", { messageId: message.id, pinned });
}

export async function setMessageTodo(
  message: ChatMessage,
  todo: boolean,
): Promise<ChatMessage> {
  if (!hasTauri()) return message;
  return invoke("set_message_todo", { messageId: message.id, todo });
}

export async function setMessageReaction(
  message: ChatMessage,
  reaction: string,
  active: boolean,
): Promise<ChatMessage> {
  if (!hasTauri()) {
    const current = message.reactions ?? [];
    const reactions = active
      ? [
          ...current.filter(
            (item) =>
              !(item.sender_id === "local-demo" && item.reaction === reaction),
          ),
          { sender_id: "local-demo", reaction },
        ]
      : current.filter(
          (item) =>
            !(item.sender_id === "local-demo" && item.reaction === reaction),
        );
    return { ...message, reactions };
  }
  return invoke("set_message_reaction", {
    messageId: message.id,
    reaction,
    active,
  });
}

export async function listFavoriteMessages(): Promise<ChatMessage[]> {
  if (!hasTauri())
    return demoMessages("direct:demo-peer").filter(
      (message) => message.favorited,
    );
  return invoke("list_favorite_messages");
}

export async function listPinnedMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  if (!hasTauri()) return demoMessages(conversationId).slice(0, 1);
  return invoke("list_pinned_messages", { conversationId });
}

export async function listTodoMessages(): Promise<ChatMessage[]> {
  if (!hasTauri()) return [];
  return invoke("list_todo_messages");
}

export async function listOutboxMessages(): Promise<ChatMessage[]> {
  if (!hasTauri())
    return demoMessages("direct:demo-peer").filter((message) =>
      ["queued", "sending", "failed"].includes(message.status),
    );
  return invoke("list_outbox_messages");
}

export async function listMessageDeliveryReceipts(
  messageId: string,
): Promise<MessageDeliveryReceipt[]> {
  if (!hasTauri()) return [];
  return invoke("list_message_delivery_receipts", { messageId });
}

export async function revokeMessage(
  message: ChatMessage,
): Promise<ChatMessage> {
  if (!hasTauri()) return { ...message, body: "", recalled: true };
  return invoke("revoke_message", { messageId: message.id });
}

export async function forwardMessage(
  message: ChatMessage,
  targetConversationId: string,
): Promise<ChatMessage> {
  if (!hasTauri()) {
    return {
      ...message,
      id: `preview-forward-${Date.now()}`,
      conversation_id: targetConversationId,
      sender_id: "local-demo",
      created_at: Date.now(),
      status: "queued",
      recalled: false,
      favorited: false,
      reactions: [],
      quote: null,
    };
  }
  return invoke("forward_message", {
    messageId: message.id,
    targetConversationId,
  });
}

export async function sendText(
  conversationId: string,
  text: string,
  quote: MessageQuote | null = null,
): Promise<ChatMessage> {
  if (!hasTauri()) {
    return {
      id: `preview-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: "local-demo",
      body: text,
      attachments: [],
      created_at: Date.now(),
      status: "queued",
      recalled: false,
      favorited: false,
      reactions: [],
      quote,
    };
  }
  return invoke("send_text", { conversationId, text, quote });
}

export async function sendTyping(
  conversationId: string,
  active: boolean,
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("send_typing", { conversationId, active });
}

export async function sendNudge(conversationId: string): Promise<void> {
  if (!hasTauri()) return;
  return invoke("send_nudge", { conversationId });
}

export async function sendFiles(
  conversationId: string,
  paths: string[],
  text = "",
  quote: MessageQuote | null = null,
): Promise<ChatMessage> {
  if (!hasTauri()) {
    const manifest = {
      transfer_id: `preview-transfer-${Date.now()}`,
      files: paths.map((path) => ({ path, size: 0, sha256: "0".repeat(64) })),
      total_bytes: 0,
      chunk_size: 262144,
      sha256: "0".repeat(64),
    };
    return {
      id: `preview-file-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: "local-demo",
      body: text.trim() || (paths.length === 1 ? `已选择文件：${paths[0]}` : `已选择 ${paths.length} 个文件`),
      attachments: [{ type: "transfer", manifest }],
      created_at: Date.now(),
      status: "queued",
      recalled: false,
      favorited: false,
      reactions: [],
      quote,
    };
  }
  return invoke("send_files", { conversationId, paths, text, quote });
}

export async function stageClipboardFiles(files: File[]): Promise<string[]> {
  if (!hasTauri()) return [];
  const stagedFiles = await Promise.all(
    files.map(async (file) => ({
      file_name: file.name || "clipboard.bin",
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    })),
  );
  return invoke("stage_clipboard_files", { files: stagedFiles });
}

export async function listTransfers(): Promise<TransferTask[]> {
  if (!hasTauri()) return demoTransfers;
  return invoke("list_transfers");
}

export async function deleteTransfer(transferId: string): Promise<boolean> {
  if (!hasTauri()) return false;
  return invoke("delete_transfer", { transferId });
}

export async function cancelTransfer(transferId: string): Promise<boolean> {
  if (!hasTauri()) return true;
  return invoke("cancel_transfer", { transferId });
}

export async function resumeTransfer(
  transferId: string,
): Promise<TransferTask> {
  if (!hasTauri()) {
    return {
      id: transferId,
      name: transferId,
      status: "indexed",
      errorMessage: "",
      totalBytes: 0,
      sentBytes: 0,
      files: [],
      resumable: false,
    };
  }
  return invoke("resume_transfer", { transferId });
}

export async function clearCompletedTransfers(): Promise<number> {
  if (!hasTauri()) return demoTransfers.length;
  return invoke("clear_completed_transfers");
}

export async function openTransferLocation(transferId: string): Promise<void> {
  if (!hasTauri()) return;
  return invoke("open_transfer_location", { transferId });
}

export async function getStorageOverview(): Promise<StorageOverview> {
  if (!hasTauri()) {
    return {
      data_dir: "%APPDATA%\\IIM",
      database_path: "%APPDATA%\\IIM\\iim.sqlite",
      database_key_path: "%APPDATA%\\IIM\\db.key.dpapi",
      database_key_protection: "Windows DPAPI",
      received_files_dir: "%APPDATA%\\IIM\\received_files",
      staged_files_dir: "%APPDATA%\\IIM\\staged",
      database_bytes: 2621440,
      received_bytes: 5242880,
      staged_bytes: 327680,
      transfer_task_count: demoTransfers.length,
    };
  }
  return invoke("get_storage_overview");
}

export async function clearStagedFiles(): Promise<void> {
  if (!hasTauri()) return;
  return invoke("clear_staged_files");
}

export async function openStorageLocation(
  kind: "data" | "received" | "staged",
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("open_storage_location", { kind });
}

export async function searchMessages(query: string): Promise<ChatMessage[]> {
  if (!hasTauri()) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return demoMessages("direct:demo-peer").filter((message) =>
      message.body.toLowerCase().includes(needle),
    );
  }
  return invoke("search_messages", { query });
}

export async function searchConversationMessages(
  conversationId: string,
  query: string,
): Promise<ChatMessage[]> {
  if (!hasTauri()) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return demoMessages(conversationId).filter(
      (message) =>
        message.body.toLowerCase().includes(needle) ||
        message.attachments.some((attachment) =>
          attachment.manifest.files.some((file) =>
            file.path.toLowerCase().includes(needle),
          ),
        ),
    );
  }
  return invoke("search_conversation_messages", { conversationId, query });
}

export async function listConversationMessagesBetween(
  conversationId: string,
  startAt: number,
  endAt: number,
): Promise<ChatMessage[]> {
  if (!hasTauri()) {
    return demoMessages(conversationId).filter(
      (message) => message.created_at >= startAt && message.created_at < endAt,
    );
  }
  return invoke("list_conversation_messages_between", {
    conversationId,
    startAt,
    endAt,
  });
}

export async function createGroup(
  name: string,
  memberPeerIds: string[],
): Promise<string> {
  if (!hasTauri()) return `group:${Date.now()}:${name}`;
  return invoke("create_group", { name, memberPeerIds });
}

export async function updateGroup(
  conversationId: string,
  name: string,
  announcement: string,
  announcementPinned: boolean,
  memberPeerIds: string[],
): Promise<ConversationSummary> {
  if (!hasTauri()) {
    return {
      id: conversationId,
      title: name.trim() || "内网群聊",
      group_announcement: announcement.trim(),
      group_announcement_pinned: announcementPinned,
      group_owner_peer_id: "local-demo",
      last_message_at: Date.now(),
      last_message_preview: "",
      unread_count: 0,
      manual_unread: false,
      pinned: false,
      muted: false,
      archived: false,
      draft_preview: "",
    };
  }
  return invoke("update_group", {
    request: {
      conversation_id: conversationId,
      name,
      announcement,
      announcement_pinned: announcementPinned,
      member_peer_ids: memberPeerIds,
    },
  });
}

export async function listGroupMembers(
  conversationId: string,
): Promise<string[]> {
  if (!hasTauri()) {
    if (conversationId === "group:project-alpha") return ["local-demo", "demo-peer", "offline-peer", "qa-peer"];
    return ["demo-peer", "ops-peer", "qa-peer", "local-demo"];
  }
  return invoke("list_group_members", { conversationId });
}

export async function updateConversationPreferences(
  preferences: Pick<
    ConversationSummary,
    "id" | "pinned" | "muted" | "archived"
  >,
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("update_conversation_preferences", {
    preferences: {
      conversation_id: preferences.id,
      pinned: preferences.pinned,
      muted: preferences.muted,
      archived: preferences.archived,
    },
  });
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("delete_conversation", { conversationId });
}

export async function clearConversationMessages(
  conversationId: string,
): Promise<number> {
  if (!hasTauri()) return demoMessages(conversationId).length;
  return invoke("clear_conversation_messages", { conversationId });
}

export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("mark_conversation_read", { conversationId });
}

export async function markConversationUnread(
  conversationId: string,
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("mark_conversation_unread", { conversationId });
}

export async function markAllConversationsRead(): Promise<number> {
  if (!hasTauri()) return 0;
  return invoke("mark_all_conversations_read");
}

export async function trustPeer(
  peerId: string,
  fingerprint: string,
): Promise<void> {
  if (!hasTauri()) return;
  return invoke("trust_peer", { peerId, fingerprint });
}

export async function listTrustedPeers(): Promise<TrustedPeer[]> {
  if (!hasTauri()) return demoTrustedPeers;
  return invoke("list_trusted_peers");
}

export async function removeTrustedPeer(peerId: string): Promise<boolean> {
  if (!hasTauri()) return true;
  return invoke("remove_trusted_peer", { peerId });
}

export async function getNetworkSettings(): Promise<NetworkSettings> {
  if (!hasTauri()) {
    return {
      auto_discovery: true,
      multicast: true,
      seed_peers: [],
      scan_ranges: [],
      discovery_interval_secs: 3,
      peer_ttl_secs: 15,
    };
  }
  return invoke("get_network_settings");
}

export async function getTransportConfig(): Promise<TransportConfig> {
  if (!hasTauri()) return defaultTransportConfig;
  return invoke("get_transport_config");
}

export async function updateNetworkSettings(
  settings: NetworkSettings,
): Promise<NetworkSettings> {
  if (!hasTauri()) return settings;
  return invoke("update_network_settings", { settings });
}

export async function getAppPreferences(): Promise<AppPreferences> {
  if (!hasTauri())
    return {
      dark_mode: false,
      send_shortcut: "enter",
      shortcuts: defaultAppShortcuts,
      show_notification_preview: true,
      privacy_mode: false,
      close_to_tray: true,
      login_enabled: false,
      login_password_hash: "",
      profile_signature: "",
      avatar_label: "",
      avatar_image: "",
      require_contact_for_messaging: false,
    };
  return invoke("get_app_preferences");
}

export async function migrateStorageDirectory(
  newDataDir: string,
): Promise<StorageOverview> {
  if (!hasTauri()) {
    return {
      data_dir: newDataDir,
      database_path: `${newDataDir}/iim.sqlite`,
      database_key_path: `${newDataDir}/db.key.dpapi`,
      database_key_protection: "Demo",
      received_files_dir: `${newDataDir}/received_files`,
      staged_files_dir: `${newDataDir}/staged`,
      database_bytes: 0,
      received_bytes: 0,
      staged_bytes: 0,
      transfer_task_count: 0,
    };
  }
  return invoke("migrate_storage_directory", { newDataDir });
}

export async function restartApp(): Promise<void> {
  if (!hasTauri()) return;
  return invoke("restart_app");
}

export async function updateAppPreferences(
  preferences: AppPreferences,
): Promise<AppPreferences> {
  if (!hasTauri()) return preferences;
  return invoke("update_app_preferences", { preferences });
}

export async function minimizeToTray(): Promise<void> {
  if (!hasTauri()) return;
  return invoke("minimize_to_tray");
}

export async function showMainWindow(): Promise<void> {
  if (!hasTauri()) return;
  return invoke("show_main_window");
}

export async function startScreenCapture(): Promise<void> {
  if (!hasTauri()) return;
  return invoke("start_screen_capture");
}
