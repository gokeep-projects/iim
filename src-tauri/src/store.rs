use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use anyhow::Context;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use uuid::Uuid;

use crate::discovery::NetworkSettings;
use crate::protocol::{
    ChatBody, ChatMessage, MessageAttachment, MessageQuote, MessageReaction, MessageStatus,
    TransferManifest,
};
use crate::store_key::load_or_create_store_key;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContactMetadata {
    pub peer_id: String,
    pub remark: String,
    pub group_name: String,
    pub favorite: bool,
    pub blocked: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct TrustedPeer {
    pub peer_id: String,
    pub fingerprint: String,
    pub trusted_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct MessageDeliveryReceipt {
    pub peer_id: String,
    pub acknowledged_at: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct AppPreferences {
    pub dark_mode: bool,
    pub send_shortcut: String,
    pub show_notification_preview: bool,
    pub privacy_mode: bool,
    pub close_to_tray: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            dark_mode: false,
            send_shortcut: "enter".to_string(),
            show_notification_preview: true,
            privacy_mode: false,
            close_to_tray: true,
        }
    }
}

impl AppPreferences {
    pub fn normalized(mut self) -> Self {
        if self.send_shortcut != "enter" && self.send_shortcut != "ctrl_enter" {
            self.send_shortcut = "enter".to_string();
        }
        if self.privacy_mode {
            self.show_notification_preview = false;
        }
        self
    }
}

pub struct EncryptedStore {
    connection: Mutex<Connection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransferCleanupResult {
    pub removed_count: usize,
    pub transfer_ids: Vec<String>,
}

impl EncryptedStore {
    fn connection(&self) -> anyhow::Result<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| anyhow::anyhow!("encrypted store connection lock is poisoned"))
    }

    pub fn open_default() -> anyhow::Result<Self> {
        let data_dir = default_data_dir();
        let path = default_store_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).context("create data directory")?;
        }
        let key = load_or_create_store_key(&data_dir).context("load protected database key")?;
        Self::open_path_with_key(path, &key)
    }

    pub fn open_memory_with_key(key: &str) -> anyhow::Result<Self> {
        let connection = Connection::open_in_memory().context("open in-memory database")?;
        configure_key(&connection, key)?;
        let store = Self {
            connection: Mutex::new(connection),
        };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_path_with_key(path: PathBuf, key: &str) -> anyhow::Result<Self> {
        let connection = Connection::open(path).context("open sqlite database")?;
        configure_key(&connection, key)?;
        let store = Self {
            connection: Mutex::new(connection),
        };
        store.migrate()?;
        Ok(store)
    }

    pub fn enqueue_outbox(&self, message: &ChatBody) -> anyhow::Result<()> {
        self.insert_message(message, MessageStatus::Queued)
    }

    pub fn insert_incoming_once(&self, message: &ChatBody) -> anyhow::Result<bool> {
        let connection = self.connection()?;
        let seen = connection.execute(
            "INSERT OR IGNORE INTO incoming_seen (message_id, seen_at) VALUES (?1, ?2)",
            params![message.message_id, Utc::now().timestamp()],
        )?;
        drop(connection);

        if seen == 0 {
            return Ok(false);
        }

        self.insert_message_inner(message, MessageStatus::Received, "INSERT OR IGNORE")?;
        Ok(true)
    }

    pub fn mark_acknowledged(&self, message_id: &str) -> anyhow::Result<()> {
        self.mark_delivered(message_id)
    }

    pub fn mark_peer_acknowledged(&self, message_id: &str, peer_id: &str) -> anyhow::Result<bool> {
        anyhow::ensure!(!message_id.trim().is_empty(), "message id cannot be empty");
        anyhow::ensure!(!peer_id.trim().is_empty(), "peer id cannot be empty");
        let Some(message) = self.get_chat_body(message_id.trim())? else {
            return Ok(false);
        };
        let mut recipients: Vec<String> = message
            .recipients
            .into_iter()
            .map(|recipient| recipient.trim().to_string())
            .filter(|recipient| !recipient.is_empty())
            .collect();
        recipients.sort();
        recipients.dedup();
        anyhow::ensure!(
            recipients
                .iter()
                .any(|recipient| recipient == peer_id.trim()),
            "ack sender is not a message recipient"
        );

        let connection = self.connection()?;
        let inserted = connection.execute(
            "INSERT OR IGNORE INTO message_acknowledgements (message_id, peer_id, acknowledged_at)
             VALUES (?1, ?2, ?3)",
            params![
                message_id.trim(),
                peer_id.trim(),
                Utc::now().timestamp_millis()
            ],
        )?;
        if inserted == 0 {
            return Ok(false);
        }
        let acknowledged_count: i64 = connection.query_row(
            "SELECT COUNT(DISTINCT peer_id) FROM message_acknowledgements WHERE message_id = ?1",
            params![message_id.trim()],
            |row| row.get(0),
        )?;
        drop(connection);

        if acknowledged_count as usize >= recipients.len() {
            self.mark_delivered(message_id.trim())?;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn message_delivery_receipts(
        &self,
        message_id: &str,
    ) -> anyhow::Result<Vec<MessageDeliveryReceipt>> {
        let message_id = message_id.trim();
        anyhow::ensure!(!message_id.is_empty(), "message id cannot be empty");
        let Some(message) = self.get_chat_body(message_id)? else {
            return Ok(Vec::new());
        };
        let mut recipients: Vec<String> = message
            .recipients
            .into_iter()
            .map(|recipient| recipient.trim().to_string())
            .filter(|recipient| !recipient.is_empty())
            .collect();
        recipients.sort();
        recipients.dedup();
        if recipients.is_empty() {
            return Ok(Vec::new());
        }

        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT peer_id, acknowledged_at
             FROM message_acknowledgements
             WHERE message_id = ?1",
        )?;
        let rows = statement.query_map(params![message_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut acknowledgements = HashMap::new();
        for row in rows {
            let (peer_id, acknowledged_at) = row?;
            acknowledgements.insert(peer_id, acknowledged_at);
        }
        Ok(recipients
            .into_iter()
            .map(|peer_id| MessageDeliveryReceipt {
                acknowledged_at: acknowledgements.get(&peer_id).copied(),
                peer_id,
            })
            .collect())
    }

    pub fn mark_read(&self, message_id: &str) -> anyhow::Result<()> {
        let connection = self.connection()?;
        connection.execute(
            "UPDATE messages SET status = ?1, updated_at = ?2
             WHERE id = ?3 AND status IN ('delivered', 'read')",
            params![
                MessageStatus::Read.as_str(),
                Utc::now().timestamp_millis(),
                message_id
            ],
        )?;
        Ok(())
    }

    pub fn mark_sending(&self, message_id: &str) -> anyhow::Result<()> {
        let connection = self.connection()?;
        let now = Utc::now().timestamp_millis();
        connection.execute(
            "UPDATE messages
             SET status = ?1,
                 send_attempts = send_attempts + 1,
                 last_attempt_at = ?2,
                 updated_at = ?2
             WHERE id = ?3 AND status IN ('queued', 'sending', 'failed')",
            params![MessageStatus::Sending.as_str(), now, message_id],
        )?;
        Ok(())
    }

    pub fn reset_message_for_retry(&self, message: &ChatBody) -> anyhow::Result<()> {
        self.insert_message(message, MessageStatus::Queued)?;
        let connection = self.connection()?;
        connection.execute(
            "UPDATE messages
             SET send_attempts = 0,
                 last_attempt_at = 0,
                 updated_at = ?1
             WHERE id = ?2",
            params![Utc::now().timestamp_millis(), message.message_id],
        )?;
        Ok(())
    }

    pub fn prune_blocked_recipients_for_retry<F>(
        &self,
        message: &mut ChatBody,
        sign: F,
    ) -> anyhow::Result<bool>
    where
        F: FnOnce(&[u8]) -> Vec<u8>,
    {
        let recipients = self.filter_unblocked_peer_ids(message.recipients.clone())?;
        if recipients.is_empty() {
            self.update_message_status(&message.message_id, MessageStatus::Failed)?;
            return Ok(false);
        }

        if recipients != message.recipients {
            message.recipients = recipients;
            message.signature = sign(&message.signing_payload());
            let connection = self.connection()?;
            connection.execute(
                "UPDATE messages
                 SET recipients_json = ?1,
                     signature_json = ?2,
                     updated_at = ?3
                 WHERE id = ?4 AND status IN ('queued', 'sending', 'failed')",
                params![
                    serde_json::to_string(&message.recipients)?,
                    serde_json::to_string(&message.signature)?,
                    Utc::now().timestamp_millis(),
                    message.message_id
                ],
            )?;
            connection.execute(
                "DELETE FROM message_acknowledgements WHERE message_id = ?1",
                params![message.message_id],
            )?;
        }

        Ok(true)
    }

    fn update_message_status(&self, message_id: &str, status: MessageStatus) -> anyhow::Result<()> {
        let connection = self.connection()?;
        connection.execute(
            "UPDATE messages SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status.as_str(), Utc::now().timestamp_millis(), message_id],
        )?;
        Ok(())
    }

    fn mark_delivered(&self, message_id: &str) -> anyhow::Result<()> {
        let connection = self.connection()?;
        connection.execute(
            "UPDATE messages SET status = ?1, updated_at = ?2
             WHERE id = ?3 AND status IN ('queued', 'sending', 'failed', 'delivered')",
            params![
                MessageStatus::Delivered.as_str(),
                Utc::now().timestamp_millis(),
                message_id
            ],
        )?;
        Ok(())
    }

    pub fn message_status(&self, message_id: &str) -> anyhow::Result<Option<MessageStatus>> {
        let connection = self.connection()?;
        let status = connection
            .query_row(
                "SELECT status FROM messages WHERE id = ?1",
                params![message_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(status.and_then(|value| MessageStatus::from_str(&value)))
    }

    pub fn message_is_retryable_outbox(&self, message_id: &str) -> anyhow::Result<bool> {
        Ok(matches!(
            self.message_status(message_id)?,
            Some(MessageStatus::Queued | MessageStatus::Sending | MessageStatus::Failed)
        ))
    }

    pub fn list_pending_outbox(&self, limit: u32) -> anyhow::Result<Vec<ChatBody>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, recipients_json, signature_json, quote_json, attachments_json
             FROM messages
             WHERE status IN ('queued', 'sending')
             ORDER BY created_at ASC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], row_to_chat_body)?;
        let mut messages = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        for message in &mut messages {
            hydrate_attachment_sources(&connection, &mut message.attachments)?;
        }
        Ok(messages)
    }

    pub fn list_retryable_outbox(
        &self,
        limit: u32,
        retry_after_millis: i64,
        max_attempts: u32,
    ) -> anyhow::Result<Vec<ChatBody>> {
        let connection = self.connection()?;
        let retry_before = Utc::now()
            .timestamp_millis()
            .saturating_sub(retry_after_millis.max(0));
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, recipients_json, signature_json, quote_json, attachments_json
             FROM messages
             WHERE status IN ('queued', 'sending')
               AND send_attempts < ?1
               AND (status = 'queued' OR last_attempt_at <= ?2)
             ORDER BY created_at ASC
             LIMIT ?3",
        )?;
        let rows =
            statement.query_map(params![max_attempts, retry_before, limit], row_to_chat_body)?;
        let mut messages = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        for message in &mut messages {
            hydrate_attachment_sources(&connection, &mut message.attachments)?;
        }
        Ok(messages)
    }

    pub fn list_outbox_messages(&self, limit: u32) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE status IN ('queued', 'sending', 'failed')
               AND recalled = 0
             ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
                      created_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], row_to_chat_message)?;
        let mut messages = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);
        for message in &mut messages {
            hydrate_attachment_sources(&connection, &mut message.attachments)?;
        }
        Ok(messages)
    }

    pub fn fail_exhausted_outbox(&self, max_attempts: u32) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let now = Utc::now().timestamp_millis();
        connection.execute(
            "UPDATE messages
             SET status = ?1, updated_at = ?2
             WHERE status IN ('queued', 'sending') AND send_attempts >= ?3",
            params![MessageStatus::Failed.as_str(), now, max_attempts],
        )?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE status = ?1 AND updated_at = ?2",
        )?;
        let rows = statement.query_map(
            params![MessageStatus::Failed.as_str(), now],
            row_to_chat_message,
        )?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn trust_peer(&self, peer_id: &str, fingerprint: &str) -> anyhow::Result<()> {
        anyhow::ensure!(!peer_id.is_empty(), "peer id cannot be empty");
        anyhow::ensure!(!fingerprint.is_empty(), "fingerprint cannot be empty");

        let connection = self.connection()?;
        let existing = connection
            .query_row(
                "SELECT fingerprint FROM trusted_peers WHERE peer_id = ?1",
                params![peer_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if let Some(trusted) = existing {
            anyhow::ensure!(
                trusted == fingerprint,
                "peer fingerprint changed for {peer_id}: trusted {trusted}, presented {fingerprint}"
            );
            return Ok(());
        }

        connection.execute(
            "INSERT INTO trusted_peers (peer_id, fingerprint, trusted_at) VALUES (?1, ?2, ?3)",
            params![peer_id, fingerprint, Utc::now().timestamp()],
        )?;
        Ok(())
    }

    pub fn list_trusted_peers(&self) -> anyhow::Result<Vec<TrustedPeer>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT peer_id, fingerprint, trusted_at
             FROM trusted_peers
             ORDER BY trusted_at DESC, peer_id ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(TrustedPeer {
                peer_id: row.get(0)?,
                fingerprint: row.get(1)?,
                trusted_at: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn remove_trusted_peer(&self, peer_id: &str) -> anyhow::Result<bool> {
        anyhow::ensure!(!peer_id.trim().is_empty(), "peer id cannot be empty");
        let connection = self.connection()?;
        let removed = connection.execute(
            "DELETE FROM trusted_peers WHERE peer_id = ?1",
            params![peer_id.trim()],
        )?;
        Ok(removed > 0)
    }

    pub fn list_contact_metadata(&self) -> anyhow::Result<Vec<ContactMetadata>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT peer_id, remark, group_name, favorite, blocked
             FROM contact_metadata
             ORDER BY favorite DESC, group_name ASC, remark ASC, peer_id ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(ContactMetadata {
                peer_id: row.get(0)?,
                remark: row.get(1)?,
                group_name: row.get(2)?,
                favorite: row.get::<_, i64>(3)? != 0,
                blocked: row.get::<_, i64>(4)? != 0,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_contact_metadata(
        &self,
        peer_id: &str,
        remark: &str,
        group_name: &str,
        favorite: bool,
        blocked: bool,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(!peer_id.trim().is_empty(), "peer id cannot be empty");
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO contact_metadata
                (peer_id, remark, group_name, favorite, blocked, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(peer_id) DO UPDATE SET
                remark = excluded.remark,
                group_name = excluded.group_name,
                favorite = excluded.favorite,
                blocked = excluded.blocked,
                updated_at = excluded.updated_at",
            params![
                peer_id.trim(),
                remark.trim(),
                group_name.trim(),
                favorite as i64,
                blocked as i64,
                Utc::now().timestamp_millis()
            ],
        )?;
        if blocked {
            connection.execute(
                "DELETE FROM local_transfer_authorizations WHERE peer_id = ?1",
                params![peer_id.trim()],
            )?;
        }
        Ok(())
    }

    pub fn is_peer_blocked(&self, peer_id: &str) -> anyhow::Result<bool> {
        let peer_id = peer_id.trim();
        if peer_id.is_empty() {
            return Ok(false);
        }
        let connection = self.connection()?;
        let blocked = connection
            .query_row(
                "SELECT blocked FROM contact_metadata WHERE peer_id = ?1",
                params![peer_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        Ok(blocked.unwrap_or(0) != 0)
    }

    pub fn filter_unblocked_peer_ids(&self, peer_ids: Vec<String>) -> anyhow::Result<Vec<String>> {
        if peer_ids.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.connection()?;
        let mut filtered = Vec::with_capacity(peer_ids.len());
        let mut statement =
            connection.prepare("SELECT blocked FROM contact_metadata WHERE peer_id = ?1")?;
        for peer_id in peer_ids {
            let peer_id = peer_id.trim().to_string();
            if peer_id.is_empty() {
                continue;
            }
            let blocked = statement
                .query_row(params![peer_id], |row| row.get::<_, i64>(0))
                .optional()?
                .unwrap_or(0)
                != 0;
            if !blocked {
                filtered.push(peer_id);
            }
        }
        Ok(filtered)
    }

    pub fn save_network_settings(&self, settings: &NetworkSettings) -> anyhow::Result<()> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            params![
                "network_settings",
                serde_json::to_string(settings)?,
                Utc::now().timestamp_millis()
            ],
        )?;
        Ok(())
    }

    pub fn load_network_settings(&self) -> anyhow::Result<Option<NetworkSettings>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params!["network_settings"],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }

    pub fn save_app_preferences(&self, preferences: &AppPreferences) -> anyhow::Result<()> {
        let connection = self.connection()?;
        connection.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            params![
                "app_preferences",
                serde_json::to_string(&preferences.clone().normalized())?,
                Utc::now().timestamp_millis()
            ],
        )?;
        Ok(())
    }

    pub fn load_app_preferences(&self) -> anyhow::Result<Option<AppPreferences>> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params!["app_preferences"],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|json| {
                serde_json::from_str::<AppPreferences>(&json)
                    .map(|preferences| preferences.normalized())
                    .map_err(Into::into)
            })
            .transpose()
    }

    pub fn create_group_conversation(
        &self,
        name: &str,
        member_peer_ids: &[String],
    ) -> anyhow::Result<String> {
        let conversation_id = format!("group:{}", Uuid::new_v4());
        self.upsert_group_conversation(&conversation_id, name, "", member_peer_ids)?;
        Ok(conversation_id)
    }

    pub fn upsert_group_conversation(
        &self,
        conversation_id: &str,
        name: &str,
        announcement: &str,
        member_peer_ids: &[String],
    ) -> anyhow::Result<()> {
        let title = name.trim();
        let announcement = announcement.trim();
        anyhow::ensure!(!title.is_empty(), "group name cannot be empty");
        anyhow::ensure!(
            conversation_id.starts_with("group:"),
            "group conversation id must start with group:"
        );
        anyhow::ensure!(
            !member_peer_ids.is_empty(),
            "group must contain at least one peer"
        );

        let mut members: Vec<String> = member_peer_ids
            .iter()
            .map(|peer_id| peer_id.trim().to_string())
            .filter(|peer_id| !peer_id.is_empty())
            .collect();
        members.sort();
        members.dedup();
        anyhow::ensure!(!members.is_empty(), "group must contain at least one peer");

        let now = Utc::now().timestamp_millis();
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT OR IGNORE INTO group_conversations (id, title, announcement, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![conversation_id, title, announcement, now, now],
        )?;
        transaction.execute(
            "UPDATE group_conversations SET title = ?1, announcement = ?2, updated_at = ?3 WHERE id = ?4",
            params![title, announcement, now, conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM group_members WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        for (position, peer_id) in members.iter().enumerate() {
            transaction.execute(
                "INSERT INTO group_members (conversation_id, peer_id, position)
                 VALUES (?1, ?2, ?3)",
                params![conversation_id, peer_id, position as i64],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn list_group_members(&self, conversation_id: &str) -> anyhow::Result<Vec<String>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT peer_id FROM group_members
             WHERE conversation_id = ?1
             ORDER BY position ASC, peer_id ASC",
        )?;
        let rows = statement.query_map(params![conversation_id], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn list_conversations(&self) -> anyhow::Result<Vec<ConversationSummary>> {
        let connection = self.connection()?;
        let mut conversations = Vec::new();
        let preferences = load_conversation_preferences(&connection)?;

        let mut group_statement = connection.prepare(
            "SELECT id, title, announcement, updated_at FROM group_conversations
             ORDER BY updated_at DESC",
        )?;
        let group_rows = group_statement.query_map([], |row| {
            Ok(ConversationSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                group_announcement: row.get(2)?,
                last_message_at: row.get(3)?,
                last_message_preview: String::new(),
                unread_count: 0,
                pinned: false,
                muted: false,
                archived: false,
                draft_preview: String::new(),
            })
        })?;
        conversations.extend(group_rows.collect::<Result<Vec<_>, _>>()?);

        let mut message_statement = connection.prepare(
            "SELECT
                m.conversation_id,
                MAX(m.created_at),
                COUNT(CASE WHEN m.status = 'received'
                    AND m.created_at > COALESCE(r.last_read_at, 0)
                    THEN 1 END),
                (SELECT latest.sender_id
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1),
                (SELECT latest.recipients_json
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1),
                (SELECT latest.status
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1),
                (SELECT EXISTS(
                    SELECT 1 FROM incoming_seen seen WHERE seen.message_id = latest.id
                 )
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1),
                (SELECT latest.body
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1),
                (SELECT latest.attachments_json
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1),
                (SELECT latest.recalled
                 FROM messages latest
                 WHERE latest.conversation_id = m.conversation_id
                 ORDER BY latest.created_at DESC, latest.updated_at DESC
                 LIMIT 1)
             FROM messages m
             LEFT JOIN conversation_reads r ON r.conversation_id = m.conversation_id
             GROUP BY m.conversation_id
             ORDER BY MAX(created_at) DESC",
        )?;
        let message_rows = message_statement.query_map([], |row| {
            let conversation_id = row.get::<_, String>(0)?;
            let latest_sender = row.get::<_, String>(3)?;
            let latest_recipients_json = row.get::<_, String>(4)?;
            let latest_status = row.get::<_, String>(5)?;
            let latest_is_incoming = row.get::<_, i64>(6)? != 0;
            let latest_body = row.get::<_, String>(7)?;
            let latest_attachments_json = row.get::<_, String>(8)?;
            let latest_recalled = row.get::<_, i64>(9)? != 0;
            Ok(ConversationSummary {
                title: direct_conversation_summary_title(
                    &conversation_id,
                    &latest_sender,
                    &latest_recipients_json,
                    &latest_status,
                    latest_is_incoming,
                ),
                id: conversation_id,
                group_announcement: String::new(),
                last_message_at: row.get(1)?,
                last_message_preview: message_preview(
                    &latest_body,
                    &latest_attachments_json,
                    latest_recalled,
                ),
                unread_count: row.get::<_, i64>(2)? as u32,
                pinned: false,
                muted: false,
                archived: false,
                draft_preview: String::new(),
            })
        })?;
        for summary in message_rows.collect::<Result<Vec<_>, _>>()? {
            if let Some(existing) = conversations
                .iter_mut()
                .find(|conversation| conversation.id == summary.id)
            {
                existing.last_message_at = existing.last_message_at.max(summary.last_message_at);
                existing.last_message_preview = summary.last_message_preview;
                existing.unread_count = summary.unread_count;
            } else {
                conversations.push(summary);
            }
        }

        let mut draft_statement = connection.prepare(
            "SELECT conversation_id, draft_text, quote_json, updated_at
             FROM conversation_drafts",
        )?;
        let draft_rows = draft_statement.query_map([], row_to_conversation_draft)?;
        for draft in draft_rows.collect::<Result<Vec<_>, _>>()? {
            let preview = draft_preview(&draft);
            if let Some(existing) = conversations
                .iter_mut()
                .find(|conversation| conversation.id == draft.conversation_id)
            {
                existing.last_message_at = existing.last_message_at.max(draft.updated_at);
                existing.draft_preview = preview;
            } else {
                conversations.push(ConversationSummary {
                    id: draft.conversation_id,
                    title: String::new(),
                    group_announcement: String::new(),
                    last_message_at: draft.updated_at,
                    last_message_preview: String::new(),
                    unread_count: 0,
                    pinned: false,
                    muted: false,
                    archived: false,
                    draft_preview: preview,
                });
            }
        }

        for conversation in &mut conversations {
            if let Some(preference) = preferences.get(&conversation.id) {
                conversation.pinned = preference.pinned;
                conversation.muted = preference.muted;
                conversation.archived = preference.archived;
                if preference.manual_unread {
                    conversation.unread_count = conversation.unread_count.max(1);
                }
            }
        }

        conversations.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then_with(|| a.archived.cmp(&b.archived))
                .then_with(|| b.last_message_at.cmp(&a.last_message_at))
        });
        Ok(conversations)
    }

    pub fn conversation_summary(
        &self,
        conversation_id: &str,
    ) -> anyhow::Result<Option<ConversationSummary>> {
        Ok(self
            .list_conversations()?
            .into_iter()
            .find(|conversation| conversation.id == conversation_id))
    }

    pub fn save_conversation_draft(
        &self,
        conversation_id: &str,
        text: &str,
        quote: &Option<MessageQuote>,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let connection = self.connection()?;
        let text = text.trim_end();
        if text.trim().is_empty() && quote.is_none() {
            connection.execute(
                "DELETE FROM conversation_drafts WHERE conversation_id = ?1",
                params![conversation_id.trim()],
            )?;
            return Ok(());
        }
        connection.execute(
            "INSERT INTO conversation_drafts
                (conversation_id, draft_text, quote_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(conversation_id) DO UPDATE SET
                draft_text = excluded.draft_text,
                quote_json = excluded.quote_json,
                updated_at = excluded.updated_at",
            params![
                conversation_id.trim(),
                text,
                serde_json::to_string(quote)?,
                Utc::now().timestamp_millis()
            ],
        )?;
        Ok(())
    }

    pub fn load_conversation_draft(
        &self,
        conversation_id: &str,
    ) -> anyhow::Result<Option<ConversationDraft>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT conversation_id, draft_text, quote_json, updated_at
                 FROM conversation_drafts
                 WHERE conversation_id = ?1",
                params![conversation_id.trim()],
                row_to_conversation_draft,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn mark_conversation_read(&self, conversation_id: &str) -> anyhow::Result<()> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO conversation_reads (conversation_id, last_read_at, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(conversation_id) DO UPDATE SET
                last_read_at = excluded.last_read_at,
                updated_at = excluded.updated_at",
            params![
                conversation_id.trim(),
                Utc::now().timestamp_millis(),
                Utc::now().timestamp_millis()
            ],
        )?;
        connection.execute(
            "UPDATE messages
             SET status = ?1, updated_at = ?2
             WHERE conversation_id = ?3 AND status = 'received'",
            params![
                MessageStatus::Read.as_str(),
                Utc::now().timestamp_millis(),
                conversation_id.trim()
            ],
        )?;
        connection.execute(
            "UPDATE conversation_preferences
             SET manual_unread = 0, updated_at = ?1
             WHERE conversation_id = ?2",
            params![Utc::now().timestamp_millis(), conversation_id.trim()],
        )?;
        Ok(())
    }

    pub fn mark_all_conversations_read(&self) -> anyhow::Result<usize> {
        let connection = self.connection()?;
        let now = Utc::now().timestamp_millis();
        let mut statement = connection.prepare(
            "SELECT conversation_id,
                    MAX(created_at),
                    SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END)
             FROM messages
             GROUP BY conversation_id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?.max(now),
                row.get::<_, i64>(2)?,
            ))
        })?;
        let conversation_stats = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        let manual_unread_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM conversation_preferences WHERE manual_unread = 1",
            [],
            |row| row.get(0),
        )?;
        for (conversation_id, last_read_at, _) in &conversation_stats {
            connection.execute(
                "INSERT INTO conversation_reads (conversation_id, last_read_at, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(conversation_id) DO UPDATE SET
                    last_read_at = excluded.last_read_at,
                    updated_at = excluded.updated_at",
                params![conversation_id, last_read_at.max(&now), now],
            )?;
        }
        let read_message_count = connection.execute(
            "UPDATE messages
             SET status = ?1, updated_at = ?2
             WHERE status = 'received'",
            params![MessageStatus::Read.as_str(), now],
        )?;
        connection.execute(
            "UPDATE conversation_preferences
             SET manual_unread = 0, updated_at = ?1
             WHERE manual_unread = 1",
            params![now],
        )?;

        Ok(read_message_count + manual_unread_count as usize)
    }

    pub fn mark_conversation_unread(&self, conversation_id: &str) -> anyhow::Result<()> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO conversation_preferences
                (conversation_id, manual_unread, updated_at)
             VALUES (?1, 1, ?2)
             ON CONFLICT(conversation_id) DO UPDATE SET
                manual_unread = 1,
                updated_at = excluded.updated_at",
            params![conversation_id.trim(), Utc::now().timestamp_millis()],
        )?;
        Ok(())
    }

    pub fn update_conversation_preferences(
        &self,
        conversation_id: &str,
        pinned: bool,
        muted: bool,
        archived: bool,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO conversation_preferences
                (conversation_id, pinned, muted, archived, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(conversation_id) DO UPDATE SET
                pinned = excluded.pinned,
                muted = excluded.muted,
                archived = excluded.archived,
                updated_at = excluded.updated_at",
            params![
                conversation_id.trim(),
                pinned as i64,
                muted as i64,
                archived as i64,
                Utc::now().timestamp_millis()
            ],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, conversation_id: &str) -> anyhow::Result<()> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "DELETE FROM incoming_seen
             WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?1)",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM message_acknowledgements
             WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?1)",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM local_transfer_sources
             WHERE transfer_id IN (SELECT id FROM transfers WHERE conversation_id = ?1)",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM local_transfer_authorizations
             WHERE transfer_id IN (SELECT id FROM transfers WHERE conversation_id = ?1)",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM messages WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM message_favorites WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM message_pins WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM message_todos WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM message_reactions WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM transfers WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM conversation_preferences WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM conversation_drafts WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM conversation_reads WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM group_members WHERE conversation_id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.execute(
            "DELETE FROM group_conversations WHERE id = ?1",
            params![conversation_id.trim()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn clear_conversation_messages(&self, conversation_id: &str) -> anyhow::Result<usize> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let conversation_id = conversation_id.trim();
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let deleted_count: usize = transaction.query_row(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )?;
        transaction.execute(
            "DELETE FROM incoming_seen
             WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?1)",
            params![conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM message_acknowledgements
             WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?1)",
            params![conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM message_favorites WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM message_pins WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM message_todos WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM message_reactions WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        transaction.execute(
            "DELETE FROM messages WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        transaction.commit()?;
        Ok(deleted_count)
    }

    pub fn set_message_favorite(
        &self,
        message_id: &str,
        favorite: bool,
    ) -> anyhow::Result<Option<ChatMessage>> {
        anyhow::ensure!(!message_id.trim().is_empty(), "message id cannot be empty");
        let Some(message) = self.get_message(message_id.trim())? else {
            return Ok(None);
        };
        let connection = self.connection()?;
        if favorite {
            connection.execute(
                "INSERT INTO message_favorites (message_id, conversation_id, favorited_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(message_id) DO UPDATE SET
                    conversation_id = excluded.conversation_id,
                    favorited_at = excluded.favorited_at",
                params![
                    message_id.trim(),
                    message.conversation_id,
                    Utc::now().timestamp_millis()
                ],
            )?;
        } else {
            connection.execute(
                "DELETE FROM message_favorites WHERE message_id = ?1",
                params![message_id.trim()],
            )?;
        }
        drop(connection);
        self.get_message(message_id.trim())
    }

    pub fn list_favorite_messages(&self, limit: u32) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT messages.id, messages.conversation_id, messages.sender_id, messages.body,
                    messages.created_at, messages.status, messages.recalled, messages.quote_json, messages.attachments_json,
                    messages.send_attempts, messages.last_attempt_at,
                    1,
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             INNER JOIN message_favorites f ON f.message_id = messages.id
             ORDER BY f.favorited_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], row_to_chat_message)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn set_message_pin(
        &self,
        message_id: &str,
        pinned: bool,
    ) -> anyhow::Result<Option<ChatMessage>> {
        anyhow::ensure!(!message_id.trim().is_empty(), "message id cannot be empty");
        let Some(message) = self.get_message(message_id.trim())? else {
            return Ok(None);
        };
        anyhow::ensure!(!message.recalled, "recalled message cannot be pinned");
        let connection = self.connection()?;
        if pinned {
            connection.execute(
                "INSERT INTO message_pins (message_id, conversation_id, pinned_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(message_id) DO UPDATE SET
                    conversation_id = excluded.conversation_id,
                    pinned_at = excluded.pinned_at",
                params![
                    message_id.trim(),
                    message.conversation_id,
                    Utc::now().timestamp_millis()
                ],
            )?;
        } else {
            connection.execute(
                "DELETE FROM message_pins WHERE message_id = ?1",
                params![message_id.trim()],
            )?;
        }
        drop(connection);
        self.get_message(message_id.trim())
    }

    pub fn list_pinned_messages(
        &self,
        conversation_id: &str,
        limit: u32,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT messages.id, messages.conversation_id, messages.sender_id, messages.body,
                    messages.created_at, messages.status, messages.recalled, messages.quote_json, messages.attachments_json,
                    messages.send_attempts, messages.last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             INNER JOIN message_pins p ON p.message_id = messages.id
             WHERE p.conversation_id = ?1
               AND messages.recalled = 0
             ORDER BY p.pinned_at DESC
             LIMIT ?2",
        )?;
        let rows =
            statement.query_map(params![conversation_id.trim(), limit], row_to_chat_message)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn set_message_todo(
        &self,
        message_id: &str,
        todo: bool,
    ) -> anyhow::Result<Option<ChatMessage>> {
        anyhow::ensure!(!message_id.trim().is_empty(), "message id cannot be empty");
        let Some(message) = self.get_message(message_id.trim())? else {
            return Ok(None);
        };
        anyhow::ensure!(
            !message.recalled,
            "recalled message cannot be marked as todo"
        );
        let connection = self.connection()?;
        if todo {
            connection.execute(
                "INSERT INTO message_todos (message_id, conversation_id, todo_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(message_id) DO UPDATE SET
                    conversation_id = excluded.conversation_id,
                    todo_at = excluded.todo_at",
                params![
                    message_id.trim(),
                    message.conversation_id,
                    Utc::now().timestamp_millis()
                ],
            )?;
        } else {
            connection.execute(
                "DELETE FROM message_todos WHERE message_id = ?1",
                params![message_id.trim()],
            )?;
        }
        drop(connection);
        self.get_message(message_id.trim())
    }

    pub fn list_todo_messages(&self, limit: u32) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT messages.id, messages.conversation_id, messages.sender_id, messages.body,
                    messages.created_at, messages.status, messages.recalled, messages.quote_json, messages.attachments_json,
                    messages.send_attempts, messages.last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             INNER JOIN message_todos t ON t.message_id = messages.id
             WHERE messages.recalled = 0
             ORDER BY t.todo_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], row_to_chat_message)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn set_message_reaction(
        &self,
        message_id: &str,
        conversation_id: &str,
        sender_id: &str,
        reaction: &str,
        active: bool,
    ) -> anyhow::Result<Option<ChatMessage>> {
        let message_id = message_id.trim();
        let conversation_id = conversation_id.trim();
        let sender_id = sender_id.trim();
        let reaction = reaction.trim();
        anyhow::ensure!(!message_id.is_empty(), "message id cannot be empty");
        anyhow::ensure!(
            !conversation_id.is_empty(),
            "conversation id cannot be empty"
        );
        anyhow::ensure!(!sender_id.is_empty(), "sender id cannot be empty");
        anyhow::ensure!(!reaction.is_empty(), "reaction cannot be empty");
        anyhow::ensure!(reaction.chars().count() <= 8, "reaction is too long");

        let Some(message) = self.get_message(message_id)? else {
            return Ok(None);
        };
        anyhow::ensure!(
            message.conversation_id == conversation_id,
            "reaction conversation mismatch"
        );
        anyhow::ensure!(!message.recalled, "recalled message cannot be reacted");

        let connection = self.connection()?;
        if active {
            connection.execute(
                "INSERT INTO message_reactions
                    (message_id, conversation_id, sender_id, reaction, reacted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(message_id, sender_id, reaction) DO UPDATE SET
                    conversation_id = excluded.conversation_id,
                    reacted_at = excluded.reacted_at",
                params![
                    message_id,
                    conversation_id,
                    sender_id,
                    reaction,
                    Utc::now().timestamp_millis()
                ],
            )?;
        } else {
            connection.execute(
                "DELETE FROM message_reactions
                 WHERE message_id = ?1 AND sender_id = ?2 AND reaction = ?3",
                params![message_id, sender_id, reaction],
            )?;
        }
        drop(connection);
        self.get_message(message_id)
    }

    pub fn search_messages(&self, query: &str) -> anyhow::Result<Vec<ChatMessage>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.connection()?;
        let needle = like_contains_needle(query);
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE body LIKE ?1 ESCAPE '\\' OR attachments_json LIKE ?1 ESCAPE '\\'
             ORDER BY created_at DESC
             LIMIT 100",
        )?;
        let rows = statement.query_map(params![needle], row_to_chat_message)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn search_conversation_messages(
        &self,
        conversation_id: &str,
        query: &str,
        limit: u32,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.connection()?;
        let needle = like_contains_needle(query);
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE conversation_id = ?1
               AND (body LIKE ?2 ESCAPE '\\' OR attachments_json LIKE ?2 ESCAPE '\\')
             ORDER BY created_at DESC
             LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![conversation_id.trim(), needle, limit],
            row_to_chat_message,
        )?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn list_conversation_messages_between(
        &self,
        conversation_id: &str,
        start_at: i64,
        end_at: i64,
        limit: u32,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE conversation_id = ?1
               AND created_at >= ?2
               AND created_at < ?3
             ORDER BY created_at ASC
             LIMIT ?4",
        )?;
        let rows = statement.query_map(
            params![conversation_id.trim(), start_at, end_at, limit],
            row_to_chat_message,
        )?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn list_messages(
        &self,
        conversation_id: &str,
        limit: u32,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        self.list_messages_before(conversation_id, None, limit)
    }

    pub fn list_messages_before(
        &self,
        conversation_id: &str,
        before_created_at: Option<i64>,
        limit: u32,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    favorited, reactions
             FROM (
                SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                       EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id) AS favorited,
                       COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                                 FROM message_reactions r WHERE r.message_id = messages.id), '') AS reactions
                FROM messages
                WHERE conversation_id = ?1
                  AND (?2 IS NULL OR created_at < ?2)
                ORDER BY created_at DESC
                LIMIT ?3
             )
             ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map(
            params![conversation_id, before_created_at, limit],
            row_to_chat_message,
        )?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn received_messages_for_read_receipt(
        &self,
        conversation_id: &str,
        local_peer_id: &str,
        limit: u32,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE conversation_id = ?1
               AND sender_id != ?2
               AND status = 'received'
             ORDER BY created_at DESC
             LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![conversation_id.trim(), local_peer_id, limit],
            row_to_chat_message,
        )?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn all_received_messages_for_read_receipts(
        &self,
        local_peer_id: &str,
    ) -> anyhow::Result<Vec<ChatMessage>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                    EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                    COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                              FROM message_reactions r WHERE r.message_id = messages.id), '')
             FROM messages
             WHERE sender_id != ?1
               AND status = 'received'
             ORDER BY conversation_id ASC, created_at DESC, id ASC",
        )?;
        let rows = statement.query_map(params![local_peer_id], row_to_chat_message)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_message(&self, message_id: &str) -> anyhow::Result<Option<ChatMessage>> {
        let connection = self.connection()?;
        let mut message = connection
            .query_row(
                "SELECT id, conversation_id, sender_id, body, created_at, status, recalled, quote_json, attachments_json, send_attempts, last_attempt_at,
                        EXISTS(SELECT 1 FROM message_favorites f WHERE f.message_id = messages.id),
                        COALESCE((SELECT group_concat(sender_id || char(31) || reaction, char(30))
                                  FROM message_reactions r WHERE r.message_id = messages.id), '')
                 FROM messages
                 WHERE id = ?1",
                params![message_id],
                row_to_chat_message,
            )
            .optional()?;
        if let Some(message) = message.as_mut() {
            hydrate_attachment_sources(&connection, &mut message.attachments)?;
        }
        Ok(message)
    }

    pub fn get_chat_body(&self, message_id: &str) -> anyhow::Result<Option<ChatBody>> {
        let connection = self.connection()?;
        let mut body = connection
            .query_row(
                "SELECT id, conversation_id, sender_id, body, created_at, recipients_json, signature_json, quote_json, attachments_json
                 FROM messages
                 WHERE id = ?1",
                params![message_id],
                row_to_chat_body,
            )
            .optional()?;
        if let Some(body) = body.as_mut() {
            hydrate_attachment_sources(&connection, &mut body.attachments)?;
        }
        Ok(body)
    }

    pub fn revoke_message(
        &self,
        message_id: &str,
        sender_id: &str,
    ) -> anyhow::Result<Option<ChatMessage>> {
        self.revoke_message_inner(message_id, None, sender_id)
    }

    pub fn revoke_message_in_conversation(
        &self,
        message_id: &str,
        conversation_id: &str,
        sender_id: &str,
    ) -> anyhow::Result<Option<ChatMessage>> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        self.revoke_message_inner(message_id, Some(conversation_id.trim()), sender_id)
    }

    fn revoke_message_inner(
        &self,
        message_id: &str,
        conversation_id: Option<&str>,
        sender_id: &str,
    ) -> anyhow::Result<Option<ChatMessage>> {
        anyhow::ensure!(!message_id.trim().is_empty(), "message id cannot be empty");
        anyhow::ensure!(!sender_id.trim().is_empty(), "sender id cannot be empty");

        let connection = self.connection()?;
        let existing = connection
            .query_row(
                "SELECT sender_id, conversation_id FROM messages WHERE id = ?1",
                params![message_id.trim()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((existing_sender, existing_conversation_id)) = existing else {
            return Ok(None);
        };
        anyhow::ensure!(
            existing_sender == sender_id.trim(),
            "message sender mismatch"
        );
        if let Some(conversation_id) = conversation_id {
            anyhow::ensure!(
                existing_conversation_id == conversation_id,
                "message conversation mismatch"
            );
        }

        connection.execute(
            "UPDATE messages
             SET body = '',
                 recalled = 1,
                 updated_at = ?1
             WHERE id = ?2",
            params![Utc::now().timestamp_millis(), message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_favorites WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_pins WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_todos WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_reactions WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_acknowledgements WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        drop(connection);
        self.get_message(message_id.trim())
    }

    pub fn delete_message(&self, message_id: &str) -> anyhow::Result<()> {
        anyhow::ensure!(!message_id.trim().is_empty(), "message id cannot be empty");
        let connection = self.connection()?;
        connection.execute(
            "DELETE FROM messages WHERE id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_favorites WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_pins WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_todos WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_reactions WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM incoming_seen WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM message_acknowledgements WHERE message_id = ?1",
            params![message_id.trim()],
        )?;
        Ok(())
    }

    pub fn upsert_transfer(
        &self,
        conversation_id: &str,
        manifest: &TransferManifest,
        status: &str,
        sent_bytes: u64,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            !conversation_id.trim().is_empty(),
            "conversation id cannot be empty"
        );
        anyhow::ensure!(!status.trim().is_empty(), "transfer status cannot be empty");

        let mut connection = self.connection()?;
        let incoming_status = status.trim();
        let existing_status = connection
            .query_row(
                "SELECT status FROM transfers WHERE id = ?1",
                params![manifest.transfer_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if existing_status
            .as_deref()
            .is_some_and(|existing| should_preserve_transfer_status(existing, incoming_status))
        {
            return Ok(());
        }
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT INTO transfers
                (id, conversation_id, manifest_json, status, error_message, sent_bytes, updated_at)
             VALUES (?1, ?2, ?3, ?4, '', ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                conversation_id = excluded.conversation_id,
                manifest_json = excluded.manifest_json,
                status = excluded.status,
                error_message = '',
                sent_bytes = excluded.sent_bytes,
                updated_at = excluded.updated_at",
            params![
                manifest.transfer_id,
                conversation_id,
                serde_json::to_string(manifest)?,
                incoming_status,
                sent_bytes as i64,
                Utc::now().timestamp_millis()
            ],
        )?;
        let source_paths = manifest
            .files
            .iter()
            .map(|file| file.source_path.trim().to_string())
            .collect::<Vec<_>>();
        save_transfer_sources_in_transaction(&transaction, &manifest.transfer_id, &source_paths)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_transfer_sources(
        &self,
        transfer_id: &str,
        source_paths: &[String],
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        save_transfer_sources_in_transaction(&transaction, transfer_id.trim(), source_paths)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn hydrate_attachment_sources(
        &self,
        attachments: &mut [MessageAttachment],
    ) -> anyhow::Result<()> {
        let connection = self.connection()?;
        hydrate_attachment_sources(&connection, attachments)
    }

    pub fn save_transfer_authorizations(
        &self,
        transfer_id: &str,
        authorizations: &HashMap<String, Vec<u8>>,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "DELETE FROM local_transfer_authorizations WHERE transfer_id = ?1",
            params![transfer_id.trim()],
        )?;
        for (peer_id, public_key) in authorizations {
            if peer_id.trim().is_empty() || public_key.is_empty() {
                continue;
            }
            transaction.execute(
                "INSERT INTO local_transfer_authorizations (transfer_id, peer_id, public_key_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    transfer_id.trim(),
                    peer_id.trim(),
                    serde_json::to_string(public_key)?,
                    Utc::now().timestamp_millis()
                ],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn list_resumable_local_transfer_offers(
        &self,
        limit: u32,
    ) -> anyhow::Result<Vec<(TransferManifest, HashMap<String, Vec<u8>>)>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT manifest_json FROM transfers
             WHERE status NOT IN ('downloaded', 'delivered', 'failed', 'cancelled', 'canceled')
             ORDER BY updated_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], |row| row.get::<_, String>(0))?;
        let manifest_jsons = rows.collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        let mut offers = Vec::new();
        for manifest_json in manifest_jsons {
            let mut manifest: TransferManifest = serde_json::from_str(&manifest_json)?;
            hydrate_manifest_sources(&connection, &mut manifest)?;
            let authorizations = load_transfer_authorizations(&connection, &manifest.transfer_id)?;
            if authorizations.is_empty() {
                continue;
            }
            offers.push((manifest, authorizations));
        }
        Ok(offers)
    }

    pub fn local_transfer_offer(
        &self,
        transfer_id: &str,
    ) -> anyhow::Result<Option<(String, TransferManifest, HashMap<String, Vec<u8>>)>> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT conversation_id, manifest_json
                 FROM transfers
                 WHERE id = ?1",
                params![transfer_id.trim()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((conversation_id, manifest_json)) = row else {
            return Ok(None);
        };
        let mut manifest: TransferManifest = serde_json::from_str(&manifest_json)?;
        hydrate_manifest_sources(&connection, &mut manifest)?;
        let authorizations = load_transfer_authorizations(&connection, &manifest.transfer_id)?;
        Ok(Some((conversation_id, manifest, authorizations)))
    }

    pub fn update_transfer_progress(
        &self,
        transfer_id: &str,
        status: &str,
        sent_bytes: u64,
    ) -> anyhow::Result<()> {
        self.update_transfer_progress_with_error(transfer_id, status, sent_bytes, "")
    }

    pub fn begin_transfer_download(&self, transfer_id: &str) -> anyhow::Result<bool> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let connection = self.connection()?;
        let changed = connection.execute(
            "UPDATE transfers
             SET status = 'downloading',
                 updated_at = ?1
             WHERE id = ?2
               AND status IN ('manifest_received', 'failed')",
            params![Utc::now().timestamp_millis(), transfer_id.trim()],
        )?;
        Ok(changed > 0)
    }

    pub fn update_transfer_progress_with_error(
        &self,
        transfer_id: &str,
        status: &str,
        sent_bytes: u64,
        error_message: &str,
    ) -> anyhow::Result<()> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        anyhow::ensure!(!status.trim().is_empty(), "transfer status cannot be empty");

        let connection = self.connection()?;
        connection.execute(
            "UPDATE transfers
             SET status = ?1, sent_bytes = ?2, error_message = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                status.trim(),
                sent_bytes as i64,
                error_message.trim(),
                Utc::now().timestamp_millis(),
                transfer_id.trim()
            ],
        )?;
        Ok(())
    }

    pub fn transfer_status(&self, transfer_id: &str) -> anyhow::Result<Option<String>> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT status FROM transfers WHERE id = ?1",
                params![transfer_id.trim()],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_transfers(&self, limit: u32) -> anyhow::Result<Vec<TransferTask>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, manifest_json, status, sent_bytes, error_message,
                    EXISTS(SELECT 1 FROM local_transfer_sources s WHERE s.transfer_id = transfers.id),
                    EXISTS(SELECT 1 FROM local_transfer_authorizations a WHERE a.transfer_id = transfers.id)
             FROM transfers
             ORDER BY updated_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], |row| {
            let id: String = row.get(0)?;
            let conversation_id: String = row.get(1)?;
            let manifest_json: String = row.get(2)?;
            let status: String = row.get(3)?;
            let sent_bytes: i64 = row.get(4)?;
            let error_message: String = row.get(5)?;
            let has_sources = row.get::<_, i64>(6)? != 0;
            let has_authorizations = row.get::<_, i64>(7)? != 0;
            let mut manifest: TransferManifest =
                serde_json::from_str(&manifest_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
            hydrate_manifest_sources(&connection, &mut manifest).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        error.to_string(),
                    )),
                )
            })?;
            let status_normalized = status.to_lowercase();
            let resumable = has_sources
                && has_authorizations
                && transfer_manifest_sources_available(&manifest)
                && matches!(
                    status_normalized.as_str(),
                    "failed" | "cancelled" | "canceled"
                );
            Ok(TransferTask::from_manifest(
                id,
                conversation_id,
                status,
                sent_bytes.max(0) as u64,
                manifest,
                resumable,
                error_message,
            ))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete_transfer(&self, transfer_id: &str) -> anyhow::Result<bool> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let connection = self.connection()?;
        let transfer_deleted = connection.execute(
            "DELETE FROM transfers WHERE id = ?1",
            params![transfer_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM local_transfer_sources WHERE transfer_id = ?1",
            params![transfer_id.trim()],
        )?;
        connection.execute(
            "DELETE FROM local_transfer_authorizations WHERE transfer_id = ?1",
            params![transfer_id.trim()],
        )?;
        Ok(transfer_deleted > 0)
    }

    pub fn cancel_transfer(&self, transfer_id: &str) -> anyhow::Result<bool> {
        anyhow::ensure!(
            !transfer_id.trim().is_empty(),
            "transfer id cannot be empty"
        );
        let connection = self.connection()?;
        let changed = connection.execute(
            "UPDATE transfers
             SET status = 'canceled',
                 updated_at = ?1
             WHERE id = ?2
               AND status NOT IN ('downloaded', 'delivered', 'failed', 'cancelled', 'canceled')",
            params![Utc::now().timestamp_millis(), transfer_id.trim()],
        )?;
        Ok(changed > 0)
    }

    pub fn clear_completed_transfers(&self) -> anyhow::Result<TransferCleanupResult> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id FROM transfers
             WHERE status IN ('downloaded', 'delivered', 'failed', 'cancelled', 'canceled')
             ORDER BY updated_at DESC",
        )?;
        let transfer_ids = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        connection.execute(
            "DELETE FROM local_transfer_authorizations
             WHERE transfer_id IN (
                SELECT id FROM transfers
                WHERE status IN ('downloaded', 'delivered', 'failed', 'cancelled', 'canceled')
             )",
            [],
        )?;
        connection
            .execute(
                "DELETE FROM transfers
                 WHERE status IN ('downloaded', 'delivered', 'failed', 'cancelled', 'canceled')",
                [],
            )
            .map(|removed_count| TransferCleanupResult {
                removed_count,
                transfer_ids,
            })
            .map_err(Into::into)
    }

    fn insert_message(&self, message: &ChatBody, status: MessageStatus) -> anyhow::Result<()> {
        self.insert_message_inner(message, status, "INSERT OR REPLACE")?;
        Ok(())
    }

    fn insert_message_inner(
        &self,
        message: &ChatBody,
        status: MessageStatus,
        insert_mode: &str,
    ) -> anyhow::Result<usize> {
        let connection = self.connection()?;
        let sql = format!(
            "{insert_mode} INTO messages
             (id, conversation_id, sender_id, recipients_json, signature_json, quote_json, attachments_json, body, created_at, status, recalled, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11)"
        );
        let changed = connection.execute(
            &sql,
            params![
                message.message_id,
                message.conversation_id,
                message.sender_id,
                serde_json::to_string(&message.recipients)?,
                serde_json::to_string(&message.signature)?,
                serde_json::to_string(&message.quote)?,
                serde_json::to_string(&message.attachments)?,
                message.body,
                message.created_at,
                status.as_str(),
                Utc::now().timestamp_millis()
            ],
        )?;
        Ok(changed)
    }

    fn migrate(&self) -> anyhow::Result<()> {
        let connection = self.connection()?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                recipients_json TEXT NOT NULL DEFAULT '[]',
                signature_json TEXT NOT NULL DEFAULT '[]',
                quote_json TEXT NOT NULL DEFAULT 'null',
                attachments_json TEXT NOT NULL DEFAULT '[]',
                body TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                recalled INTEGER NOT NULL DEFAULT 0,
                send_attempts INTEGER NOT NULL DEFAULT 0,
                last_attempt_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
                ON messages(conversation_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_body
                ON messages(body);
            CREATE TABLE IF NOT EXISTS trusted_peers (
                peer_id TEXT PRIMARY KEY,
                fingerprint TEXT NOT NULL,
                trusted_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incoming_seen (
                message_id TEXT PRIMARY KEY,
                seen_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message_acknowledgements (
                message_id TEXT NOT NULL,
                peer_id TEXT NOT NULL,
                acknowledged_at INTEGER NOT NULL,
                PRIMARY KEY (message_id, peer_id)
            );
            CREATE TABLE IF NOT EXISTS transfers (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                manifest_json TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT NOT NULL DEFAULT '',
                sent_bytes INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS local_transfer_sources (
                transfer_id TEXT NOT NULL,
                file_index INTEGER NOT NULL,
                source_path TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (transfer_id, file_index)
            );
            CREATE TABLE IF NOT EXISTS local_transfer_authorizations (
                transfer_id TEXT NOT NULL,
                peer_id TEXT NOT NULL,
                public_key_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (transfer_id, peer_id)
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS group_conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                announcement TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS group_members (
                conversation_id TEXT NOT NULL,
                peer_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (conversation_id, peer_id)
            );
            CREATE TABLE IF NOT EXISTS conversation_preferences (
                conversation_id TEXT PRIMARY KEY,
                pinned INTEGER NOT NULL DEFAULT 0,
                muted INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                manual_unread INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_reads (
                conversation_id TEXT PRIMARY KEY,
                last_read_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS contact_metadata (
                peer_id TEXT PRIMARY KEY,
                remark TEXT NOT NULL DEFAULT '',
                group_name TEXT NOT NULL DEFAULT '',
                favorite INTEGER NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_drafts (
                conversation_id TEXT PRIMARY KEY,
                draft_text TEXT NOT NULL DEFAULT '',
                quote_json TEXT NOT NULL DEFAULT 'null',
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message_favorites (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                favorited_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message_pins (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                pinned_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message_todos (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                todo_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS message_reactions (
                message_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                reaction TEXT NOT NULL,
                reacted_at INTEGER NOT NULL,
                PRIMARY KEY (message_id, sender_id, reaction)
            );
            ",
        )?;
        ensure_column(
            &connection,
            "messages",
            "recipients_json",
            "TEXT NOT NULL DEFAULT '[]'",
        )?;
        ensure_column(
            &connection,
            "messages",
            "signature_json",
            "TEXT NOT NULL DEFAULT '[]'",
        )?;
        ensure_column(
            &connection,
            "messages",
            "quote_json",
            "TEXT NOT NULL DEFAULT 'null'",
        )?;
        ensure_column(
            &connection,
            "messages",
            "attachments_json",
            "TEXT NOT NULL DEFAULT '[]'",
        )?;
        ensure_column(
            &connection,
            "transfers",
            "error_message",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "messages",
            "send_attempts",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "messages",
            "last_attempt_at",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "messages",
            "recalled",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "transfers",
            "sent_bytes",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "contact_metadata",
            "blocked",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "conversation_preferences",
            "manual_unread",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        ensure_column(
            &connection,
            "group_conversations",
            "announcement",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub group_announcement: String,
    pub last_message_at: i64,
    pub last_message_preview: String,
    pub unread_count: u32,
    pub pinned: bool,
    pub muted: bool,
    pub archived: bool,
    pub draft_preview: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConversationDraft {
    pub conversation_id: String,
    pub text: String,
    pub quote: Option<MessageQuote>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy)]
struct ConversationPreference {
    pinned: bool,
    muted: bool,
    archived: bool,
    manual_unread: bool,
}

fn load_conversation_preferences(
    connection: &Connection,
) -> anyhow::Result<HashMap<String, ConversationPreference>> {
    let mut statement = connection.prepare(
        "SELECT conversation_id, pinned, muted, archived, manual_unread
         FROM conversation_preferences",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            ConversationPreference {
                pinned: row.get::<_, i64>(1)? != 0,
                muted: row.get::<_, i64>(2)? != 0,
                archived: row.get::<_, i64>(3)? != 0,
                manual_unread: row.get::<_, i64>(4)? != 0,
            },
        ))
    })?;
    rows.collect::<Result<HashMap<_, _>, _>>()
        .map_err(Into::into)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferTask {
    pub id: String,
    pub conversation_id: String,
    pub name: String,
    pub status: String,
    pub error_message: String,
    pub total_bytes: u64,
    pub sent_bytes: u64,
    pub files: Vec<String>,
    pub resumable: bool,
}

impl TransferTask {
    pub(crate) fn from_manifest(
        id: String,
        conversation_id: String,
        status: String,
        sent_bytes: u64,
        manifest: TransferManifest,
        resumable: bool,
        error_message: String,
    ) -> Self {
        let files: Vec<String> = manifest
            .files
            .iter()
            .map(|file| display_file_name(&file.path))
            .collect();
        let name = match files.as_slice() {
            [single] => single.clone(),
            _ => format!("{} 个文件", files.len()),
        };
        Self {
            id,
            conversation_id,
            name,
            status,
            error_message,
            total_bytes: manifest.total_bytes,
            sent_bytes: sent_bytes.min(manifest.total_bytes),
            files,
            resumable,
        }
    }
}

fn display_file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn ensure_column(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> anyhow::Result<()> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    let exists = columns
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|existing| existing == column);
    if !exists {
        connection.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}

fn hydrate_attachment_sources(
    connection: &Connection,
    attachments: &mut [MessageAttachment],
) -> anyhow::Result<()> {
    for attachment in attachments {
        if attachment.kind != "transfer" {
            continue;
        }
        hydrate_manifest_sources(connection, &mut attachment.manifest)?;
    }
    Ok(())
}

fn hydrate_manifest_sources(
    connection: &Connection,
    manifest: &mut TransferManifest,
) -> anyhow::Result<()> {
    let mut statement = connection.prepare(
        "SELECT file_index, source_path
         FROM local_transfer_sources
         WHERE transfer_id = ?1
         ORDER BY file_index ASC",
    )?;
    let rows = statement.query_map(params![manifest.transfer_id], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (file_index, source_path) = row?;
        if file_index < 0 {
            continue;
        }
        if let Some(file) = manifest.files.get_mut(file_index as usize) {
            file.source_path = source_path;
        }
    }
    Ok(())
}

fn save_transfer_sources_in_transaction(
    transaction: &rusqlite::Transaction<'_>,
    transfer_id: &str,
    source_paths: &[String],
) -> anyhow::Result<()> {
    transaction.execute(
        "DELETE FROM local_transfer_sources WHERE transfer_id = ?1",
        params![transfer_id],
    )?;
    for (file_index, source_path) in source_paths.iter().enumerate() {
        let source_path = source_path.trim();
        if source_path.is_empty() {
            continue;
        }
        transaction.execute(
            "INSERT INTO local_transfer_sources (transfer_id, file_index, source_path, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                transfer_id,
                file_index as i64,
                source_path,
                Utc::now().timestamp_millis()
            ],
        )?;
    }
    Ok(())
}

fn transfer_manifest_sources_available(manifest: &TransferManifest) -> bool {
    manifest
        .files
        .iter()
        .all(|file| Path::new(file.local_source_path()).is_file())
}

fn load_transfer_authorizations(
    connection: &Connection,
    transfer_id: &str,
) -> anyhow::Result<HashMap<String, Vec<u8>>> {
    let mut statement = connection.prepare(
        "SELECT a.peer_id, a.public_key_json
         FROM local_transfer_authorizations a
         LEFT JOIN contact_metadata m ON m.peer_id = a.peer_id
         WHERE a.transfer_id = ?1 AND COALESCE(m.blocked, 0) = 0",
    )?;
    let rows = statement.query_map(params![transfer_id], |row| {
        let peer_id: String = row.get(0)?;
        let public_key_json: String = row.get(1)?;
        let public_key: Vec<u8> = serde_json::from_str(&public_key_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
        Ok((peer_id, public_key))
    })?;
    rows.collect::<Result<HashMap<_, _>, _>>()
        .map_err(Into::into)
}

fn like_contains_needle(query: &str) -> String {
    let mut needle = String::with_capacity(query.len() + 2);
    needle.push('%');
    for character in query.chars() {
        if matches!(character, '%' | '_' | '\\') {
            needle.push('\\');
        }
        needle.push(character);
    }
    needle.push('%');
    needle
}

fn row_to_chat_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChatMessage> {
    let status: String = row.get(5)?;
    let recalled: i64 = row.get(6)?;
    let quote_json: String = row.get(7)?;
    let attachments_json: String = row.get(8)?;
    let send_attempts: u32 = row.get(9)?;
    let last_attempt_at: i64 = row.get(10)?;
    let favorited: i64 = row.get(11)?;
    let reactions: String = row.get(12)?;
    Ok(ChatMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        sender_id: row.get(2)?,
        body: row.get(3)?,
        attachments: serde_json::from_str::<Vec<MessageAttachment>>(&attachments_json)
            .unwrap_or_default(),
        created_at: row.get(4)?,
        status: MessageStatus::from_str(&status).unwrap_or(MessageStatus::Failed),
        recalled: recalled != 0,
        quote: serde_json::from_str::<Option<MessageQuote>>(&quote_json).unwrap_or_default(),
        favorited: favorited != 0,
        reactions: parse_reactions(&reactions),
        send_attempts,
        last_attempt_at,
    })
}

fn parse_reactions(value: &str) -> Vec<MessageReaction> {
    if value.is_empty() {
        return Vec::new();
    }
    value
        .split('\u{1e}')
        .filter_map(|entry| {
            let (sender_id, reaction) = entry.split_once('\u{1f}')?;
            Some(MessageReaction {
                sender_id: sender_id.to_string(),
                reaction: reaction.to_string(),
            })
        })
        .collect()
}

fn direct_conversation_summary_title(
    conversation_id: &str,
    latest_sender: &str,
    latest_recipients_json: &str,
    latest_status: &str,
    latest_is_incoming: bool,
) -> String {
    if !conversation_id.starts_with("direct:") {
        return conversation_id.to_string();
    }
    let latest_sender = latest_sender.trim();
    if latest_is_incoming || MessageStatus::from_str(latest_status) == Some(MessageStatus::Received)
    {
        if !latest_sender.is_empty() {
            return latest_sender.to_string();
        }
    }

    let recipients = serde_json::from_str::<Vec<String>>(latest_recipients_json)
        .unwrap_or_default()
        .into_iter()
        .map(|recipient| recipient.trim().to_string())
        .filter(|recipient| !recipient.is_empty())
        .collect::<Vec<_>>();
    if let Some(recipient) = recipients
        .iter()
        .find(|recipient| recipient.as_str() != latest_sender)
    {
        return recipient.clone();
    }

    let peers = conversation_id
        .trim()
        .strip_prefix("direct:")
        .unwrap_or_default()
        .split(':')
        .map(str::trim)
        .filter(|peer_id| !peer_id.is_empty())
        .collect::<Vec<_>>();
    if peers.len() == 1 && peers[0] != latest_sender {
        return latest_sender.to_string();
    }
    peers
        .into_iter()
        .find(|peer_id| *peer_id != latest_sender)
        .unwrap_or(latest_sender)
        .to_string()
}

fn message_preview(body: &str, attachments_json: &str, recalled: bool) -> String {
    if recalled {
        return "消息已撤回".to_string();
    }
    let trimmed = body.trim();
    if !trimmed.is_empty() {
        return trimmed.chars().take(120).collect();
    }
    let attachments =
        serde_json::from_str::<Vec<MessageAttachment>>(attachments_json).unwrap_or_default();
    let Some(attachment) = attachments.first() else {
        return String::new();
    };
    if attachment.kind == "transfer" {
        let files = &attachment.manifest.files;
        if files.len() == 1 {
            let name = display_file_name(&files[0].path);
            return format!("[文件] {name}");
        }
        return format!("[文件] {} 个文件", files.len());
    }
    "[附件]".to_string()
}

fn row_to_chat_body(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChatBody> {
    Ok(ChatBody {
        message_id: row.get(0)?,
        conversation_id: row.get(1)?,
        sender_id: row.get(2)?,
        body: row.get(3)?,
        created_at: row.get(4)?,
        recipients: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_default(),
        signature: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
        quote: serde_json::from_str::<Option<MessageQuote>>(&row.get::<_, String>(7)?)
            .unwrap_or_default(),
        attachments: serde_json::from_str::<Vec<MessageAttachment>>(&row.get::<_, String>(8)?)
            .unwrap_or_default(),
    })
}

fn row_to_conversation_draft(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationDraft> {
    let quote_json: String = row.get(2)?;
    Ok(ConversationDraft {
        conversation_id: row.get(0)?,
        text: row.get(1)?,
        quote: serde_json::from_str::<Option<MessageQuote>>(&quote_json).unwrap_or_default(),
        updated_at: row.get(3)?,
    })
}

fn draft_preview(draft: &ConversationDraft) -> String {
    let text = draft.text.trim();
    if !text.is_empty() {
        return text.chars().take(80).collect();
    }
    if draft.quote.is_some() {
        return "引用回复".to_string();
    }
    String::new()
}

fn configure_key(connection: &Connection, key: &str) -> anyhow::Result<()> {
    let key = key.trim();
    anyhow::ensure!(!key.is_empty(), "database key cannot be empty");
    let escaped = key.replace('\'', "''");
    connection
        .pragma_update(None, "key", escaped)
        .context("configure sqlite encryption key")?;
    Ok(())
}

fn should_preserve_transfer_status(existing: &str, incoming: &str) -> bool {
    let existing = existing.trim().to_ascii_lowercase();
    let incoming = incoming.trim().to_ascii_lowercase();
    let existing_is_terminal = matches!(
        existing.as_str(),
        "canceled" | "cancelled" | "downloaded" | "delivered"
    );
    let incoming_is_terminal = matches!(
        incoming.as_str(),
        "canceled" | "cancelled" | "downloaded" | "delivered"
    );

    (existing_is_terminal && !incoming_is_terminal)
        || (existing == "downloading"
            && matches!(incoming.as_str(), "manifest_received" | "indexed"))
}

fn default_store_path() -> anyhow::Result<PathBuf> {
    Ok(default_data_dir().join("iim.sqlite"))
}

pub fn default_data_dir() -> PathBuf {
    configured_data_dir().unwrap_or_else(default_config_dir)
}

pub fn default_config_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("IIM")
}

fn storage_config_path() -> PathBuf {
    default_config_dir().join("storage.json")
}

fn configured_data_dir() -> Option<PathBuf> {
    let bytes = std::fs::read(storage_config_path()).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let data_dir = value.get("data_dir")?.as_str()?.trim();
    if data_dir.is_empty() {
        return None;
    }
    Some(PathBuf::from(data_dir))
}

pub fn write_data_dir_config(data_dir: &Path) -> anyhow::Result<()> {
    let config_dir = default_config_dir();
    std::fs::create_dir_all(&config_dir)?;
    let path = storage_config_path();
    let temp = path.with_extension("json.tmp");
    let payload = serde_json::json!({
        "data_dir": data_dir.to_string_lossy(),
        "updated_at": Utc::now().timestamp()
    });
    std::fs::write(&temp, serde_json::to_vec_pretty(&payload)?)?;
    std::fs::rename(temp, path)?;
    Ok(())
}

pub fn data_dir_config_path() -> PathBuf {
    storage_config_path()
}

#[cfg(test)]
mod tests {
    use super::{AppPreferences, EncryptedStore};
    use crate::protocol::{
        ChatBody, FileEntry, MessageAttachment, MessageStatus, TransferManifest,
    };
    use rusqlite::params;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn encrypted_store_rejects_empty_database_key() {
        let error = match EncryptedStore::open_memory_with_key("   ") {
            Ok(_) => panic!("empty database key should be rejected"),
            Err(error) => error,
        };

        assert!(error.to_string().contains("database key cannot be empty"));
    }

    fn test_chat_body(message_id: &str, recipients: Vec<&str>) -> ChatBody {
        ChatBody {
            message_id: message_id.to_string(),
            conversation_id: "group:reliability".to_string(),
            sender_id: "local-peer".to_string(),
            recipients: recipients.into_iter().map(str::to_string).collect(),
            signature: vec![1, 2, 3],
            quote: None,
            attachments: Vec::new(),
            body: "hello".to_string(),
            created_at: 1_725_000_000_000,
        }
    }

    #[test]
    fn duplicate_recipients_do_not_block_outbox_delivery_ack() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let message = test_chat_body("msg-duplicate-ack", vec!["peer-a", " peer-a ", "peer-a"]);
        store.enqueue_outbox(&message).expect("enqueue");

        let completed = store
            .mark_peer_acknowledged("msg-duplicate-ack", "peer-a")
            .expect("ack");

        assert!(completed);
        assert_eq!(
            store.message_status("msg-duplicate-ack").expect("status"),
            Some(MessageStatus::Delivered)
        );
    }

    #[test]
    fn group_outbox_waits_for_every_distinct_recipient_ack() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let message = test_chat_body("msg-group-ack", vec!["peer-a", "peer-b"]);
        store.enqueue_outbox(&message).expect("enqueue");

        let first_ack_completed = store
            .mark_peer_acknowledged("msg-group-ack", "peer-a")
            .expect("first ack");

        assert!(!first_ack_completed);
        assert_eq!(
            store.message_status("msg-group-ack").expect("status"),
            Some(MessageStatus::Queued)
        );

        let second_ack_completed = store
            .mark_peer_acknowledged("msg-group-ack", "peer-b")
            .expect("second ack");

        assert!(second_ack_completed);
        assert_eq!(
            store.message_status("msg-group-ack").expect("status"),
            Some(MessageStatus::Delivered)
        );
    }

    #[test]
    fn message_delivery_receipts_include_pending_and_acknowledged_recipients() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let message = test_chat_body(
            "msg-delivery-receipts",
            vec!["peer-b", " peer-a ", "peer-b"],
        );
        store.enqueue_outbox(&message).expect("enqueue");
        store
            .mark_peer_acknowledged("msg-delivery-receipts", "peer-a")
            .expect("ack peer-a");

        let receipts = store
            .message_delivery_receipts("msg-delivery-receipts")
            .expect("receipts");

        assert_eq!(receipts.len(), 2);
        assert_eq!(receipts[0].peer_id, "peer-a");
        assert!(receipts[0].acknowledged_at.is_some());
        assert_eq!(receipts[1].peer_id, "peer-b");
        assert_eq!(receipts[1].acknowledged_at, None);
        assert!(store
            .message_delivery_receipts("missing-message")
            .expect("missing receipts")
            .is_empty());
    }

    #[test]
    fn retryable_outbox_status_excludes_delivered_messages() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let queued = test_chat_body("msg-retry-queued", vec!["peer-a"]);
        let delivered = test_chat_body("msg-retry-delivered", vec!["peer-a"]);
        store.enqueue_outbox(&queued).expect("queued");
        store.enqueue_outbox(&delivered).expect("delivered");
        store
            .mark_acknowledged("msg-retry-delivered")
            .expect("mark delivered");

        assert!(store
            .message_is_retryable_outbox("msg-retry-queued")
            .expect("queued retryable"));
        assert!(!store
            .message_is_retryable_outbox("msg-retry-delivered")
            .expect("delivered not retryable"));
    }

    #[test]
    fn outbox_message_list_includes_only_pending_or_failed_messages() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let queued = test_chat_body("msg-outbox-queued", vec!["peer-a"]);
        let sending = test_chat_body("msg-outbox-sending", vec!["peer-a"]);
        let failed = test_chat_body("msg-outbox-failed", vec!["peer-a"]);
        let delivered = test_chat_body("msg-outbox-delivered", vec!["peer-a"]);

        store.enqueue_outbox(&queued).expect("queued");
        store.enqueue_outbox(&sending).expect("sending");
        store.enqueue_outbox(&failed).expect("failed");
        store.enqueue_outbox(&delivered).expect("delivered");
        store
            .mark_sending("msg-outbox-sending")
            .expect("mark sending");
        store
            .update_message_status("msg-outbox-failed", MessageStatus::Failed)
            .expect("mark failed");
        store
            .mark_acknowledged("msg-outbox-delivered")
            .expect("mark delivered");

        let outbox = store.list_outbox_messages(10).expect("outbox listed");

        assert_eq!(
            outbox
                .iter()
                .map(|message| message.id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "msg-outbox-failed",
                "msg-outbox-queued",
                "msg-outbox-sending"
            ]
        );
        assert!(outbox.iter().all(|message| !message.recalled));
    }

    #[test]
    fn mark_sending_does_not_downgrade_delivered_messages() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let delivered = test_chat_body("msg-sending-delivered", vec!["peer-a"]);
        store.enqueue_outbox(&delivered).expect("enqueue");
        store
            .mark_acknowledged("msg-sending-delivered")
            .expect("mark delivered");

        store
            .mark_sending("msg-sending-delivered")
            .expect("mark sending");

        assert_eq!(
            store
                .message_status("msg-sending-delivered")
                .expect("status"),
            Some(MessageStatus::Delivered)
        );
    }

    #[test]
    fn chat_messages_expose_send_attempt_metadata() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let message = test_chat_body("msg-send-attempts", vec!["peer-a"]);
        store.enqueue_outbox(&message).expect("enqueue");

        store.mark_sending("msg-send-attempts").expect("first send");
        store
            .mark_sending("msg-send-attempts")
            .expect("second send");

        let message = store
            .get_message("msg-send-attempts")
            .expect("get message")
            .expect("message exists");
        assert_eq!(message.send_attempts, 2);
        assert!(message.last_attempt_at > 0);
    }

    #[test]
    fn mark_read_does_not_promote_failed_or_queued_messages() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let queued = test_chat_body("msg-read-queued", vec!["peer-a"]);
        let failed = test_chat_body("msg-read-failed", vec!["peer-a"]);
        store.enqueue_outbox(&queued).expect("queued");
        store.enqueue_outbox(&failed).expect("failed");
        store
            .update_message_status("msg-read-failed", MessageStatus::Failed)
            .expect("mark failed");

        store.mark_read("msg-read-queued").expect("read queued");
        store.mark_read("msg-read-failed").expect("read failed");

        assert_eq!(
            store
                .message_status("msg-read-queued")
                .expect("queued status"),
            Some(MessageStatus::Queued)
        );
        assert_eq!(
            store
                .message_status("msg-read-failed")
                .expect("failed status"),
            Some(MessageStatus::Failed)
        );
    }

    #[test]
    fn group_conversation_persists_announcement_in_summary() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let members = vec!["local-peer".to_string(), "peer-a".to_string()];
        store
            .upsert_group_conversation(
                "group:ops",
                "值班群",
                "今天 15:00 发布窗口，所有人提前同步回滚方案。",
                &members,
            )
            .expect("upsert group");

        let summary = store
            .conversation_summary("group:ops")
            .expect("query summary")
            .expect("group summary");

        assert_eq!(
            summary.group_announcement,
            "今天 15:00 发布窗口，所有人提前同步回滚方案。"
        );
    }

    #[test]
    fn late_ack_does_not_downgrade_read_messages() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let direct = test_chat_body("msg-late-direct-ack", vec!["peer-a"]);
        let group = test_chat_body("msg-late-group-ack", vec!["peer-a", "peer-b"]);
        store.enqueue_outbox(&direct).expect("direct");
        store.enqueue_outbox(&group).expect("group");
        store
            .update_message_status("msg-late-direct-ack", MessageStatus::Read)
            .expect("direct read");
        store
            .update_message_status("msg-late-group-ack", MessageStatus::Read)
            .expect("group read");

        store
            .mark_acknowledged("msg-late-direct-ack")
            .expect("direct ack");
        store
            .mark_peer_acknowledged("msg-late-group-ack", "peer-a")
            .expect("first group ack");
        store
            .mark_peer_acknowledged("msg-late-group-ack", "peer-b")
            .expect("second group ack");

        assert_eq!(
            store
                .message_status("msg-late-direct-ack")
                .expect("direct status"),
            Some(MessageStatus::Read)
        );
        assert_eq!(
            store
                .message_status("msg-late-group-ack")
                .expect("group status"),
            Some(MessageStatus::Read)
        );
    }

    #[test]
    fn empty_message_searches_return_no_rows_without_scanning_history() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        store
            .enqueue_outbox(&test_chat_body("msg-search-a", vec!["peer-a"]))
            .expect("first message");
        store
            .enqueue_outbox(&test_chat_body("msg-search-b", vec!["peer-a"]))
            .expect("second message");

        assert!(store
            .search_messages("   ")
            .expect("global empty search")
            .is_empty());
        assert!(store
            .search_conversation_messages("group:reliability", "", 100)
            .expect("conversation empty search")
            .is_empty());
    }

    #[test]
    fn poisoned_store_lock_returns_error_instead_of_panicking() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = store.connection.lock().expect("lock before poison");
            panic!("poison store lock");
        }));

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            store.message_status("missing-message")
        }));

        assert!(
            result.is_ok(),
            "store method should not panic after lock poisoning"
        );
        assert!(result.expect("no panic").is_err());
    }

    #[test]
    fn clearing_conversation_messages_removes_message_acknowledgements() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let message = test_chat_body("msg-clear-ack", vec!["peer-a"]);
        store.enqueue_outbox(&message).expect("enqueue");
        store
            .mark_peer_acknowledged("msg-clear-ack", "peer-a")
            .expect("ack");

        store
            .clear_conversation_messages("group:reliability")
            .expect("clear messages");

        let connection = store.connection.lock().expect("store lock");
        let acknowledgement_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM message_acknowledgements WHERE message_id = ?1",
                params!["msg-clear-ack"],
                |row| row.get(0),
            )
            .expect("ack count");

        assert_eq!(acknowledgement_count, 0);
    }

    #[test]
    fn deleting_message_removes_message_acknowledgements() {
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        let message = test_chat_body("msg-delete-ack", vec!["peer-a"]);
        store.enqueue_outbox(&message).expect("enqueue");
        store
            .mark_peer_acknowledged("msg-delete-ack", "peer-a")
            .expect("ack");

        store.delete_message("msg-delete-ack").expect("delete");

        let connection = store.connection.lock().expect("store lock");
        let acknowledgement_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM message_acknowledgements WHERE message_id = ?1",
                params!["msg-delete-ack"],
                |row| row.get(0),
            )
            .expect("ack count");

        assert_eq!(acknowledgement_count, 0);
    }

    #[test]
    fn transfer_is_not_resumable_after_local_source_file_is_removed() {
        let temp = tempdir().expect("tempdir");
        let source = temp.path().join("report.pdf");
        std::fs::write(&source, b"report").expect("source file");
        let manifest = TransferManifest::from_entries(
            "transfer-missing-source".to_string(),
            vec![FileEntry::new("report.pdf".to_string(), 6, "0".repeat(64))
                .with_source_path(source.to_string_lossy().to_string())],
            262_144,
        )
        .expect("manifest");
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        store
            .upsert_transfer("direct:peer-a", &manifest, "failed", 0)
            .expect("upsert transfer");
        store
            .save_transfer_authorizations(
                &manifest.transfer_id,
                &HashMap::from([("peer-a".to_string(), vec![1, 2, 3])]),
            )
            .expect("save authorizations");

        assert!(
            store
                .list_transfers(10)
                .expect("transfers")
                .into_iter()
                .find(|task| task.id == manifest.transfer_id)
                .expect("transfer task")
                .resumable
        );

        std::fs::remove_file(&source).expect("remove source");

        assert!(
            !store
                .list_transfers(10)
                .expect("transfers")
                .into_iter()
                .find(|task| task.id == manifest.transfer_id)
                .expect("transfer task")
                .resumable
        );
    }

    #[test]
    fn received_transfer_sources_are_hydrated_for_later_forwarding() {
        let temp = tempdir().expect("tempdir");
        let received = temp.path().join("report.pdf");
        std::fs::write(&received, b"report").expect("received file");
        let manifest = TransferManifest::from_entries(
            "transfer-received-forward".to_string(),
            vec![FileEntry::new("report.pdf".to_string(), 6, "0".repeat(64))],
            262_144,
        )
        .expect("manifest");
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        store
            .upsert_transfer("direct:peer-a", &manifest, "downloaded", 6)
            .expect("upsert transfer");

        store
            .save_transfer_sources(
                &manifest.transfer_id,
                &[received.to_string_lossy().to_string()],
            )
            .expect("save received sources");

        let (_, hydrated, _) = store
            .local_transfer_offer(&manifest.transfer_id)
            .expect("offer")
            .expect("saved transfer");

        assert_eq!(
            hydrated.files[0].local_source_path(),
            received.to_string_lossy()
        );
    }

    #[test]
    fn transfer_attachment_sources_are_hydrated_for_forwarding_checks() {
        let temp = tempdir().expect("tempdir");
        let received = temp.path().join("handoff.zip");
        std::fs::write(&received, b"handoff").expect("received file");
        let manifest = TransferManifest::from_entries(
            "transfer-attachment-hydrate".to_string(),
            vec![FileEntry::new("handoff.zip".to_string(), 7, "0".repeat(64))],
            262_144,
        )
        .expect("manifest");
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        store
            .upsert_transfer("direct:peer-a", &manifest, "downloaded", 7)
            .expect("upsert transfer");
        store
            .save_transfer_sources(
                &manifest.transfer_id,
                &[received.to_string_lossy().to_string()],
            )
            .expect("save received sources");

        let mut attachments = vec![MessageAttachment::transfer(manifest)];
        store
            .hydrate_attachment_sources(&mut attachments)
            .expect("hydrate attachments");

        assert_eq!(
            attachments[0].manifest.files[0].local_source_path(),
            received.to_string_lossy()
        );
    }

    #[test]
    fn clearing_completed_transfers_keeps_sources_for_message_forwarding() {
        let temp = tempdir().expect("tempdir");
        let source = temp.path().join("archive.zip");
        std::fs::write(&source, b"archive").expect("source file");
        let transfer_id = "transfer-clear-keeps-source";
        let saved_manifest = TransferManifest::from_entries(
            transfer_id.to_string(),
            vec![FileEntry::new("archive.zip".to_string(), 7, "0".repeat(64))
                .with_source_path(source.to_string_lossy().to_string())],
            262_144,
        )
        .expect("saved manifest");
        let message_manifest = TransferManifest::from_entries(
            transfer_id.to_string(),
            vec![FileEntry::new("archive.zip".to_string(), 7, "0".repeat(64))],
            262_144,
        )
        .expect("message manifest");
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        store
            .upsert_transfer("direct:peer-a", &saved_manifest, "delivered", 7)
            .expect("upsert transfer");

        let cleanup = store
            .clear_completed_transfers()
            .expect("clear completed transfers");
        let mut attachments = vec![MessageAttachment::transfer(message_manifest)];
        store
            .hydrate_attachment_sources(&mut attachments)
            .expect("hydrate attachments");

        assert_eq!(cleanup.removed_count, 1);
        assert_eq!(
            attachments[0].manifest.files[0].local_source_path(),
            source.to_string_lossy()
        );
    }

    #[test]
    fn deleting_conversation_removes_transfer_sources_authorizations_and_reads() {
        let temp = tempdir().expect("tempdir");
        let source = temp.path().join("bundle.zip");
        std::fs::write(&source, b"bundle").expect("source file");
        let manifest = TransferManifest::from_entries(
            "transfer-delete-conversation".to_string(),
            vec![FileEntry::new("bundle.zip".to_string(), 6, "0".repeat(64))
                .with_source_path(source.to_string_lossy().to_string())],
            262_144,
        )
        .expect("manifest");
        let store = EncryptedStore::open_memory_with_key("test-key").expect("store");
        store
            .upsert_transfer("direct:peer-a", &manifest, "failed", 0)
            .expect("upsert transfer");
        store
            .save_transfer_authorizations(
                &manifest.transfer_id,
                &HashMap::from([("peer-a".to_string(), vec![1, 2, 3])]),
            )
            .expect("save authorizations");
        store
            .mark_conversation_read("direct:peer-a")
            .expect("mark read");

        store
            .delete_conversation("direct:peer-a")
            .expect("delete conversation");

        let connection = store.connection.lock().expect("store lock");
        let source_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_transfer_sources WHERE transfer_id = ?1",
                params![manifest.transfer_id],
                |row| row.get(0),
            )
            .expect("source count");
        let authorization_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_transfer_authorizations WHERE transfer_id = ?1",
                params!["transfer-delete-conversation"],
                |row| row.get(0),
            )
            .expect("authorization count");
        let read_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM conversation_reads WHERE conversation_id = ?1",
                params!["direct:peer-a"],
                |row| row.get(0),
            )
            .expect("read count");

        assert_eq!(source_count, 0);
        assert_eq!(authorization_count, 0);
        assert_eq!(read_count, 0);
    }

    #[test]
    fn app_preferences_deserializes_legacy_values() {
        let preferences: AppPreferences = serde_json::from_str(
            r#"{"dark_mode":true,"send_shortcut":"ctrl_enter","show_notification_preview":true,"close_to_tray":false}"#,
        )
        .expect("legacy preferences should deserialize");

        assert!(preferences.dark_mode);
        assert_eq!(preferences.send_shortcut, "ctrl_enter");
        assert!(preferences.show_notification_preview);
        assert!(!preferences.privacy_mode);
        assert!(!preferences.close_to_tray);
    }

    #[test]
    fn privacy_mode_forces_notification_preview_off() {
        let preferences = AppPreferences {
            dark_mode: false,
            send_shortcut: "enter".to_string(),
            show_notification_preview: true,
            privacy_mode: true,
            close_to_tray: true,
        }
        .normalized();

        assert!(preferences.privacy_mode);
        assert!(!preferences.show_notification_preview);
    }
}
