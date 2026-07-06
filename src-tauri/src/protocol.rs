use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::identity::to_hex;

pub const PROTOCOL_VERSION: u16 = 1;
pub const DISCOVERY_PORT: u16 = 24250;
pub const QUIC_PORT: u16 = 24251;

pub fn is_valid_transfer_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed == value
        && trimmed != "."
        && trimmed != ".."
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageStatus {
    Queued,
    Sending,
    Delivered,
    Read,
    Failed,
    Received,
}

impl MessageStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Sending => "sending",
            Self::Delivered => "delivered",
            Self::Read => "read",
            Self::Failed => "failed",
            Self::Received => "received",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "queued" => Some(Self::Queued),
            "sending" => Some(Self::Sending),
            "delivered" => Some(Self::Delivered),
            "read" => Some(Self::Read),
            "failed" => Some(Self::Failed),
            "received" => Some(Self::Received),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageQuote {
    pub message_id: String,
    pub sender_id: String,
    pub body_preview: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageReaction {
    pub sender_id: String,
    pub reaction: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageAttachment {
    #[serde(rename = "type")]
    pub kind: String,
    pub manifest: TransferManifest,
}

impl MessageAttachment {
    pub fn transfer(manifest: TransferManifest) -> Self {
        Self {
            kind: "transfer".to_string(),
            manifest,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatBody {
    pub message_id: String,
    pub conversation_id: String,
    pub sender_id: String,
    #[serde(default)]
    pub recipients: Vec<String>,
    #[serde(default)]
    pub signature: Vec<u8>,
    #[serde(default)]
    pub quote: Option<MessageQuote>,
    #[serde(default)]
    pub attachments: Vec<MessageAttachment>,
    pub body: String,
    pub created_at: i64,
}

impl ChatBody {
    pub fn targets_peer(&self, peer_id: &str) -> bool {
        self.recipients.is_empty() || self.recipients.iter().any(|recipient| recipient == peer_id)
    }

    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "message_id": self.message_id,
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "quote": self.quote,
            "attachments": self.attachments,
            "body": self.body,
            "created_at": self.created_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AckFrame {
    pub message_id: String,
    pub conversation_id: String,
    #[serde(default)]
    pub sender_id: String,
    #[serde(default)]
    pub signature: Vec<u8>,
    pub received_at: i64,
}

impl AckFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "message_id": self.message_id,
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "received_at": self.received_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadReceiptFrame {
    pub conversation_id: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub message_ids: Vec<String>,
    pub read_at: i64,
    #[serde(default)]
    pub signature: Vec<u8>,
}

impl ReadReceiptFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "message_ids": self.message_ids,
            "read_at": self.read_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TypingFrame {
    pub conversation_id: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub active: bool,
    pub updated_at: i64,
    #[serde(default)]
    pub signature: Vec<u8>,
}

impl TypingFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "active": self.active,
            "updated_at": self.updated_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NudgeFrame {
    pub conversation_id: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub nudged_at: i64,
    #[serde(default)]
    pub signature: Vec<u8>,
}

impl NudgeFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "nudged_at": self.nudged_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageRevokeFrame {
    pub conversation_id: String,
    pub message_id: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub revoked_at: i64,
    #[serde(default)]
    pub signature: Vec<u8>,
}

impl MessageRevokeFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "message_id": self.message_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "revoked_at": self.revoked_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MessageReactionFrame {
    pub conversation_id: String,
    pub message_id: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub reaction: String,
    pub active: bool,
    pub reacted_at: i64,
    #[serde(default)]
    pub signature: Vec<u8>,
}

impl MessageReactionFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "message_id": self.message_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "reaction": self.reaction,
            "active": self.active,
            "reacted_at": self.reacted_at,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GroupInviteFrame {
    pub conversation_id: String,
    pub name: String,
    #[serde(default)]
    pub announcement: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub member_peer_ids: Vec<String>,
    #[serde(default)]
    pub signature: Vec<u8>,
}

impl GroupInviteFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "name": self.name,
            "announcement": self.announcement,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "member_peer_ids": self.member_peer_ids,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransferAnnouncementFrame {
    pub conversation_id: String,
    pub sender_id: String,
    pub recipients: Vec<String>,
    pub signature: Vec<u8>,
    pub manifest: TransferManifest,
}

impl TransferAnnouncementFrame {
    pub fn signing_payload(&self) -> Vec<u8> {
        serde_json::json!({
            "conversation_id": self.conversation_id,
            "sender_id": self.sender_id,
            "recipients": self.recipients,
            "transfer_id": self.manifest.transfer_id,
            "manifest_sha256": self.manifest.sha256,
            "total_bytes": self.manifest.total_bytes,
        })
        .to_string()
        .into_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub sender_id: String,
    pub body: String,
    pub attachments: Vec<MessageAttachment>,
    pub created_at: i64,
    pub status: MessageStatus,
    pub recalled: bool,
    pub quote: Option<MessageQuote>,
    pub favorited: bool,
    pub reactions: Vec<MessageReaction>,
    #[serde(default)]
    pub send_attempts: u32,
    #[serde(default)]
    pub last_attempt_at: i64,
}

impl From<(ChatBody, MessageStatus)> for ChatMessage {
    fn from((body, status): (ChatBody, MessageStatus)) -> Self {
        Self {
            id: body.message_id,
            conversation_id: body.conversation_id,
            sender_id: body.sender_id,
            body: body.body,
            attachments: body.attachments,
            created_at: body.created_at,
            status,
            recalled: false,
            quote: body.quote,
            favorited: false,
            reactions: Vec::new(),
            send_attempts: 0,
            last_attempt_at: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    #[serde(default)]
    pub relative_path: String,
    #[serde(skip)]
    pub source_path: String,
    pub size: u64,
    pub sha256: String,
}

impl FileEntry {
    pub fn new(path: String, size: u64, sha256: String) -> Self {
        let relative_path = std::path::Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("received-file")
            .to_string();
        Self {
            path,
            relative_path,
            source_path: String::new(),
            size,
            sha256,
        }
    }

    pub fn with_relative_path(mut self, relative_path: impl Into<String>) -> Self {
        self.relative_path = relative_path.into();
        self
    }

    pub fn with_source_path(mut self, source_path: impl Into<String>) -> Self {
        self.source_path = source_path.into();
        self
    }

    pub fn local_source_path(&self) -> &str {
        if self.source_path.is_empty() {
            &self.path
        } else {
            &self.source_path
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransferManifest {
    pub transfer_id: String,
    pub files: Vec<FileEntry>,
    pub total_bytes: u64,
    pub chunk_size: u64,
    pub sha256: String,
}

impl TransferManifest {
    pub fn from_entries(
        transfer_id: String,
        files: Vec<FileEntry>,
        chunk_size: u64,
    ) -> Result<Self, ProtocolError> {
        validate_manifest_entries(&transfer_id, &files, chunk_size)?;
        let total_bytes = manifest_total_bytes(&files)?;
        let sha256 = manifest_digest(&transfer_id, &files, chunk_size);
        Ok(Self {
            transfer_id,
            files,
            total_bytes,
            chunk_size,
            sha256,
        })
    }

    pub fn validate(&self) -> Result<(), ProtocolError> {
        validate_manifest_entries(&self.transfer_id, &self.files, self.chunk_size)?;
        let total_bytes = manifest_total_bytes(&self.files)?;
        if self.total_bytes != total_bytes {
            return Err(ProtocolError::InvalidTransferTotal);
        }
        if self.sha256 != manifest_digest(&self.transfer_id, &self.files, self.chunk_size) {
            return Err(ProtocolError::InvalidManifestDigest);
        }
        Ok(())
    }
}

fn validate_manifest_entries(
    transfer_id: &str,
    files: &[FileEntry],
    chunk_size: u64,
) -> Result<(), ProtocolError> {
    if !is_valid_transfer_id(transfer_id) {
        return Err(ProtocolError::InvalidTransferId);
    }
    if files.is_empty() {
        return Err(ProtocolError::EmptyTransfer);
    }
    if chunk_size == 0 {
        return Err(ProtocolError::InvalidChunkSize);
    }
    let mut relative_paths = HashSet::new();
    for file in files {
        if file.path.trim().is_empty() {
            return Err(ProtocolError::InvalidFilePath);
        }
        if !file.relative_path.trim().is_empty() && !is_safe_relative_file_path(&file.relative_path)
        {
            return Err(ProtocolError::InvalidFilePath);
        }
        let target_path = normalized_manifest_relative_path(file);
        if !relative_paths.insert(target_path) {
            return Err(ProtocolError::InvalidFilePath);
        }
        if !is_sha256_hex(&file.sha256) {
            return Err(ProtocolError::InvalidFileDigest);
        }
    }
    Ok(())
}

fn manifest_total_bytes(files: &[FileEntry]) -> Result<u64, ProtocolError> {
    files.iter().try_fold(0u64, |total, file| {
        total
            .checked_add(file.size)
            .ok_or(ProtocolError::TransferSizeOverflow)
    })
}

fn manifest_digest(transfer_id: &str, files: &[FileEntry], chunk_size: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(transfer_id.as_bytes());
    hasher.update(chunk_size.to_le_bytes());
    for file in files {
        hasher.update(file.path.as_bytes());
        hasher.update(file.relative_path.as_bytes());
        hasher.update(file.size.to_le_bytes());
        hasher.update(file.sha256.as_bytes());
    }
    to_hex(&hasher.finalize())
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_safe_relative_file_path(value: &str) -> bool {
    if value.starts_with(['/', '\\']) || value.contains(':') {
        return false;
    }
    value.split(['/', '\\']).all(is_safe_windows_path_component)
}

fn is_safe_windows_path_component(component: &str) -> bool {
    if component.is_empty()
        || component == "."
        || component == ".."
        || component.ends_with([' ', '.'])
        || component
            .chars()
            .any(|ch| ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
    {
        return false;
    }

    let stem = component
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !stem
            .strip_prefix("COM")
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=9).contains(&value))
        && !stem
            .strip_prefix("LPT")
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=9).contains(&value))
}

fn normalized_manifest_relative_path(file: &FileEntry) -> String {
    if file.relative_path.trim().is_empty() {
        std::path::Path::new(&file.path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("received-file")
            .to_string()
    } else {
        file.relative_path.replace('\\', "/")
    }
    .to_lowercase()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProtocolFrame {
    Chat(ChatBody),
    Ack(AckFrame),
    Typing(TypingFrame),
    Nudge(NudgeFrame),
    ReadReceipt(ReadReceiptFrame),
    GroupInvite(GroupInviteFrame),
    MessageRevoke(MessageRevokeFrame),
    MessageReaction(MessageReactionFrame),
    TransferAnnouncement(TransferAnnouncementFrame),
    TransferManifest(TransferManifest),
}

impl ProtocolFrame {
    pub fn version(&self) -> u16 {
        PROTOCOL_VERSION
    }

    pub fn encode(&self) -> Result<Vec<u8>, ProtocolError> {
        let envelope = FrameEnvelope {
            version: PROTOCOL_VERSION,
            frame: self.clone(),
        };
        bincode::serialize(&envelope).map_err(ProtocolError::Encode)
    }

    pub fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        let envelope: FrameEnvelope = bincode::deserialize(bytes).map_err(ProtocolError::Decode)?;
        if envelope.version != PROTOCOL_VERSION {
            return Err(ProtocolError::UnsupportedVersion(envelope.version));
        }
        Ok(envelope.frame)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct FrameEnvelope {
    version: u16,
    frame: ProtocolFrame,
}

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("encode frame: {0}")]
    Encode(#[source] Box<bincode::ErrorKind>),
    #[error("decode frame: {0}")]
    Decode(#[source] Box<bincode::ErrorKind>),
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u16),
    #[error("chunk size must be greater than zero")]
    InvalidChunkSize,
    #[error("transfer id cannot be empty")]
    InvalidTransferId,
    #[error("transfer must contain at least one file")]
    EmptyTransfer,
    #[error("file path cannot be empty")]
    InvalidFilePath,
    #[error("file sha256 must be a 64 character hex digest")]
    InvalidFileDigest,
    #[error("transfer total size overflowed")]
    TransferSizeOverflow,
    #[error("transfer total size does not match file entries")]
    InvalidTransferTotal,
    #[error("manifest digest does not match file entries")]
    InvalidManifestDigest,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_receipt_frame_round_trips_through_protocol_envelope() {
        let frame = ProtocolFrame::ReadReceipt(ReadReceiptFrame {
            conversation_id: "direct:peer-a".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["local-peer".to_string()],
            message_ids: vec!["msg-1".to_string(), "msg-2".to_string()],
            read_at: 1_700_000_000_000,
            signature: vec![1, 2, 3, 4],
        });

        let encoded = frame.encode().expect("encode read receipt frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode read receipt frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn typing_frame_round_trips_through_protocol_envelope() {
        let frame = ProtocolFrame::Typing(TypingFrame {
            conversation_id: "direct:peer-a".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["local-peer".to_string()],
            active: true,
            updated_at: 1_700_000_000_123,
            signature: vec![9, 8, 7],
        });

        let encoded = frame.encode().expect("encode typing frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode typing frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn nudge_frame_round_trips_through_protocol_envelope() {
        let frame = ProtocolFrame::Nudge(NudgeFrame {
            conversation_id: "direct:peer-a".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["local-peer".to_string()],
            nudged_at: 1_700_000_000_111,
            signature: vec![4, 3, 2, 1],
        });

        let encoded = frame.encode().expect("encode nudge frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode nudge frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn message_revoke_frame_round_trips_through_protocol_envelope() {
        let frame = ProtocolFrame::MessageRevoke(MessageRevokeFrame {
            conversation_id: "direct:peer-a".to_string(),
            message_id: "msg-1".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["local-peer".to_string()],
            revoked_at: 1_700_000_000_456,
            signature: vec![1, 3, 5],
        });

        let encoded = frame.encode().expect("encode revoke frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode revoke frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn message_reaction_frame_round_trips_through_protocol_envelope() {
        let frame = ProtocolFrame::MessageReaction(MessageReactionFrame {
            conversation_id: "direct:peer-a".to_string(),
            message_id: "msg-1".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["local-peer".to_string()],
            reaction: "ok".to_string(),
            active: true,
            reacted_at: 1_700_000_000_789,
            signature: vec![2, 4, 6],
        });

        let encoded = frame.encode().expect("encode reaction frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode reaction frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn group_invite_frame_round_trips_through_protocol_envelope() {
        let frame = ProtocolFrame::GroupInvite(GroupInviteFrame {
            conversation_id: "group:alpha".to_string(),
            name: "Alpha Team".to_string(),
            announcement: "15:00 发布窗口，先同步回滚方案。".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["peer-b".to_string()],
            member_peer_ids: vec!["peer-a".to_string(), "peer-b".to_string()],
            signature: vec![7, 7, 7],
        });

        let encoded = frame.encode().expect("encode group invite frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode group invite frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn transfer_announcement_frame_round_trips_through_protocol_envelope() {
        let manifest = TransferManifest::from_entries(
            "transfer-1".to_string(),
            vec![FileEntry::new(
                "report.pdf".to_string(),
                4096,
                "a".repeat(64),
            )],
            262_144,
        )
        .expect("manifest");
        let frame = ProtocolFrame::TransferAnnouncement(TransferAnnouncementFrame {
            conversation_id: "direct:peer-a".to_string(),
            sender_id: "peer-a".to_string(),
            recipients: vec!["local-peer".to_string()],
            signature: vec![5, 5, 5],
            manifest,
        });

        let encoded = frame.encode().expect("encode transfer announcement frame");
        let decoded = ProtocolFrame::decode(&encoded).expect("decode transfer announcement frame");

        assert_eq!(decoded, frame);
    }

    #[test]
    fn transfer_manifest_rejects_empty_or_malformed_entries() {
        assert!(matches!(
            TransferManifest::from_entries("transfer-empty".to_string(), Vec::new(), 262_144),
            Err(ProtocolError::EmptyTransfer)
        ));
        assert!(matches!(
            TransferManifest::from_entries(
                " ".to_string(),
                vec![FileEntry::new("file.txt".to_string(), 1, "a".repeat(64))],
                262_144
            ),
            Err(ProtocolError::InvalidTransferId)
        ));
        for transfer_id in [
            "../outside",
            "..\\outside",
            "C:outside",
            "transfer/child",
            "transfer\\child",
            ".",
            "..",
            " transfer",
            "transfer ",
        ] {
            assert!(matches!(
                TransferManifest::from_entries(
                    transfer_id.to_string(),
                    vec![FileEntry::new("file.txt".to_string(), 1, "a".repeat(64))],
                    262_144
                ),
                Err(ProtocolError::InvalidTransferId)
            ));
        }
        assert!(matches!(
            TransferManifest::from_entries(
                "transfer-bad-path".to_string(),
                vec![FileEntry::new(" ".to_string(), 1, "a".repeat(64))],
                262_144
            ),
            Err(ProtocolError::InvalidFilePath)
        ));
        assert!(matches!(
            TransferManifest::from_entries(
                "transfer-bad-digest".to_string(),
                vec![FileEntry::new(
                    "file.txt".to_string(),
                    1,
                    "not-sha".to_string()
                )],
                262_144
            ),
            Err(ProtocolError::InvalidFileDigest)
        ));
    }

    #[test]
    fn transfer_manifest_rejects_unsafe_relative_paths() {
        for relative_path in [
            "../secret.txt",
            "docs/../../secret.txt",
            "/absolute/secret.txt",
            "\\absolute\\secret.txt",
            "C:\\secret.txt",
            "folder//secret.txt",
            "folder/./secret.txt",
        ] {
            assert!(matches!(
                TransferManifest::from_entries(
                    "transfer-bad-relative-path".to_string(),
                    vec![FileEntry::new("secret.txt".to_string(), 1, "a".repeat(64))
                        .with_relative_path(relative_path)],
                    262_144
                ),
                Err(ProtocolError::InvalidFilePath)
            ));
        }
    }

    #[test]
    fn transfer_manifest_rejects_windows_unsafe_relative_path_components() {
        for relative_path in [
            "docs/report<draft>.txt",
            "docs/report?.txt",
            "docs/report*.txt",
            "docs/report\"draft\".txt",
            "docs/report|draft.txt",
            "docs/report.txt ",
            "docs/report.",
            "docs/CON.txt",
            "docs/Lpt1.log",
            "docs/com9",
            "docs/control\u{0001}.txt",
        ] {
            assert!(matches!(
                TransferManifest::from_entries(
                    "transfer-bad-windows-path".to_string(),
                    vec![FileEntry::new("report.txt".to_string(), 1, "a".repeat(64))
                        .with_relative_path(relative_path)],
                    262_144
                ),
                Err(ProtocolError::InvalidFilePath)
            ));
        }
    }

    #[test]
    fn transfer_manifest_rejects_duplicate_relative_paths() {
        assert!(matches!(
            TransferManifest::from_entries(
                "transfer-duplicate-relative-path".to_string(),
                vec![
                    FileEntry::new("source-a.txt".to_string(), 1, "a".repeat(64))
                        .with_relative_path("reports/summary.txt"),
                    FileEntry::new("source-b.txt".to_string(), 1, "b".repeat(64))
                        .with_relative_path("reports/summary.txt"),
                ],
                262_144
            ),
            Err(ProtocolError::InvalidFilePath)
        ));
    }

    #[test]
    fn transfer_manifest_validate_rejects_tampered_totals_and_digest() {
        let manifest = TransferManifest::from_entries(
            "transfer-valid".to_string(),
            vec![FileEntry::new("file.txt".to_string(), 12, "a".repeat(64))],
            262_144,
        )
        .expect("manifest");
        assert!(manifest.validate().is_ok());

        let mut wrong_total = manifest.clone();
        wrong_total.total_bytes += 1;
        assert!(matches!(
            wrong_total.validate(),
            Err(ProtocolError::InvalidTransferTotal)
        ));

        let mut wrong_digest = manifest;
        wrong_digest.sha256 = "b".repeat(64);
        assert!(matches!(
            wrong_digest.validate(),
            Err(ProtocolError::InvalidManifestDigest)
        ));
    }
}
