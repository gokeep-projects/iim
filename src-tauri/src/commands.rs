use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::desktop;
use crate::discovery::{
    broadcast_beacon_with_settings, broadcast_chat_with_settings,
    broadcast_group_invite_with_settings, broadcast_message_reaction_with_settings,
    broadcast_message_revoke_with_settings, broadcast_nudge_with_settings,
    broadcast_read_receipt_with_settings, broadcast_transfer_with_settings,
    broadcast_typing_with_settings, group_invite_signing_payload, message_reaction_signing_payload,
    message_revoke_signing_payload, normalize_network_settings, nudge_signing_payload,
    read_receipt_signing_payload, transfer_announcement_signing_payload, typing_signing_payload,
    NetworkSettings, PeerProfile,
};
#[cfg(feature = "quic")]
use crate::discovery::{
    spawn_quic_chat_delivery, spawn_quic_group_invite_delivery,
    spawn_quic_message_reaction_delivery, spawn_quic_message_revoke_delivery,
    spawn_quic_nudge_delivery, spawn_quic_read_receipt_delivery,
    spawn_quic_transfer_announcement_delivery, spawn_quic_typing_delivery,
};
use crate::file_transfer::manifest_sources_available;
use crate::identity::to_hex;
use crate::protocol::{
    is_valid_transfer_id, ChatBody, ChatMessage, FileEntry, MessageAttachment, MessageQuote,
    MessageStatus, TransferManifest,
};
use crate::screen_capture;
use crate::staging::{self, StagedClipboardFile};
use crate::store::{
    data_dir_config_path, default_data_dir, write_data_dir_config, AppPreferences, ContactMetadata,
    ConversationDraft, ConversationSummary, MessageDeliveryReceipt, TransferTask, TrustedPeer,
};
use crate::store_key::store_key_path;
use crate::transport::TransportConfig;
use crate::AppState;

const READ_RECEIPT_BATCH_SIZE: usize = 100;

#[tauri::command]
pub fn get_self_profile(state: State<'_, AppState>) -> Result<PeerProfile, String> {
    Ok(state.self_profile())
}

#[tauri::command]
pub fn update_self_profile(
    profile: PeerProfile,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<PeerProfile, String> {
    let updated = state
        .update_self_profile(profile)
        .map_err(|error| error.to_string())?;
    let settings = state.settings();
    if let Err(error) = broadcast_beacon_with_settings(&updated, &settings) {
        let _ = app.emit(
            "network:warning",
            format!("Profile beacon broadcast failed: {error}"),
        );
    }
    Ok(updated)
}

#[tauri::command]
pub fn list_peers(state: State<'_, AppState>) -> Result<Vec<PeerProfile>, String> {
    let self_id = state.identity().peer_id();
    Ok(state
        .peers()
        .into_iter()
        .filter(|peer| peer.peer_id != self_id)
        .collect())
}

#[derive(Debug, Deserialize)]
pub struct ContactMetadataRequest {
    pub peer_id: String,
    pub remark: String,
    pub group_name: String,
    pub favorite: bool,
    pub blocked: bool,
}

#[tauri::command]
pub fn list_contact_metadata(state: State<'_, AppState>) -> Result<Vec<ContactMetadata>, String> {
    state
        .store()
        .list_contact_metadata()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_contact_metadata(
    metadata: ContactMetadataRequest,
    state: State<'_, AppState>,
) -> Result<ContactMetadata, String> {
    apply_contact_metadata_update(metadata, state.inner())
}

fn apply_contact_metadata_update(
    metadata: ContactMetadataRequest,
    state: &AppState,
) -> Result<ContactMetadata, String> {
    let peer_id = metadata.peer_id.trim().to_string();
    state
        .store()
        .update_contact_metadata(
            &peer_id,
            &metadata.remark,
            &metadata.group_name,
            metadata.favorite,
            metadata.blocked,
        )
        .map_err(|error| error.to_string())?;
    if metadata.blocked {
        state
            .transfer_registry()
            .remove_authorization_for_peer(&peer_id);
    }
    Ok(ContactMetadata {
        peer_id,
        remark: metadata.remark.trim().to_string(),
        group_name: metadata.group_name.trim().to_string(),
        favorite: metadata.favorite,
        blocked: metadata.blocked,
    })
}

#[tauri::command]
pub fn list_conversations(state: State<'_, AppState>) -> Result<Vec<ConversationSummary>, String> {
    state
        .store()
        .list_conversations()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn send_text(
    app: tauri::AppHandle,
    conversation_id: String,
    text: String,
    quote: Option<MessageQuote>,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("message text cannot be empty".to_string());
    }
    let conversation_id = normalized_conversation_id(&conversation_id);
    let recipients = conversation_recipients(&conversation_id, state.inner())
        .map_err(|error| error.to_string())?;
    let body = ChatBody {
        message_id: state.identity().next_message_id(),
        conversation_id,
        sender_id: state.identity().peer_id().to_string(),
        recipients,
        signature: Vec::new(),
        quote,
        attachments: Vec::new(),
        body: trimmed.to_string(),
        created_at: Utc::now().timestamp_millis(),
    };
    dispatch_chat_body(app, state.inner(), body)
}

fn dispatch_chat_body(
    app: tauri::AppHandle,
    state: &AppState,
    mut body: ChatBody,
) -> Result<ChatMessage, String> {
    body.signature = state.identity().sign(&body.signing_payload());
    state
        .store()
        .enqueue_outbox(&body)
        .map_err(|error| error.to_string())?;
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_chat_delivery(app.clone(), body.clone());
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    let udp_sent = broadcast_chat_with_settings(&body, &state.settings()).is_ok();
    let status = if quic_scheduled || udp_sent {
        let _ = state.store().mark_sending(&body.message_id);
        MessageStatus::Sending
    } else {
        MessageStatus::Queued
    };
    let message = ChatMessage::from((body, status));
    let _ = app.emit("message:status_changed", &message);
    Ok(message)
}

#[tauri::command]
pub fn send_typing(
    #[cfg_attr(not(feature = "quic"), allow(unused_variables))] app: tauri::AppHandle,
    conversation_id: String,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conversation_id = normalized_conversation_id(&conversation_id);
    let recipients = conversation_recipients(&conversation_id, state.inner())
        .map_err(|error| error.to_string())?;
    let updated_at = Utc::now().timestamp_millis();
    let signature = state.identity().sign(&typing_signing_payload(
        &conversation_id,
        state.identity().peer_id(),
        &recipients,
        active,
        updated_at,
    ));
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_typing_delivery(
        app,
        crate::protocol::TypingFrame {
            conversation_id: conversation_id.clone(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: recipients.clone(),
            active,
            updated_at,
            signature: signature.clone(),
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    let udp_result = broadcast_typing_with_settings(
        &conversation_id,
        state.identity().peer_id(),
        &recipients,
        active,
        updated_at,
        &signature,
        &state.settings(),
    );
    if quic_scheduled || udp_result.is_ok() {
        Ok(())
    } else {
        udp_result.map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn send_nudge(
    app: tauri::AppHandle,
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conversation_id = normalized_conversation_id(&conversation_id);
    let recipients = conversation_recipients(&conversation_id, state.inner())
        .map_err(|error| error.to_string())?;
    let nudged_at = Utc::now().timestamp_millis();
    let signature = state.identity().sign(&nudge_signing_payload(
        &conversation_id,
        state.identity().peer_id(),
        &recipients,
        nudged_at,
    ));
    let udp_sent = broadcast_nudge_with_settings(
        &conversation_id,
        state.identity().peer_id(),
        &recipients,
        nudged_at,
        &signature,
        &state.settings(),
    )
    .is_ok();
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_nudge_delivery(
        app.clone(),
        crate::protocol::NudgeFrame {
            conversation_id: conversation_id.clone(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: recipients.clone(),
            nudged_at,
            signature,
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    let delivery = RealtimeDeliveryResult {
        udp_sent,
        quic_scheduled,
    };
    emit_realtime_delivery_warning(&app, "抖一抖提醒", &conversation_id, delivery);
    if delivery.udp_sent || delivery.quic_scheduled {
        Ok(())
    } else {
        Err("抖一抖提醒未能通过 UDP 或 QUIC 发送；请检查防火墙、网络发现或种子节点设置".to_string())
    }
}

#[tauri::command]
pub fn revoke_message(
    app: tauri::AppHandle,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    let mut body = state
        .store()
        .get_chat_body(message_id.trim())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())?;
    if body.sender_id != state.identity().peer_id() {
        return Err("only local messages can be revoked".to_string());
    }
    if body.recipients.is_empty() {
        body.recipients = conversation_recipients(&body.conversation_id, state.inner())
            .map_err(|error| error.to_string())?;
    }

    let revoked = state
        .store()
        .revoke_message_in_conversation(
            &body.message_id,
            &body.conversation_id,
            state.identity().peer_id(),
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())?;
    let revoked_at = Utc::now().timestamp_millis();
    let signature = state.identity().sign(&message_revoke_signing_payload(
        &body.conversation_id,
        &body.message_id,
        state.identity().peer_id(),
        &body.recipients,
        revoked_at,
    ));
    let udp_sent = broadcast_message_revoke_with_settings(
        &body.conversation_id,
        &body.message_id,
        state.identity().peer_id(),
        &body.recipients,
        revoked_at,
        &signature,
        &state.settings(),
    )
    .is_ok();
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_message_revoke_delivery(
        app.clone(),
        crate::protocol::MessageRevokeFrame {
            conversation_id: body.conversation_id.clone(),
            message_id: body.message_id.clone(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: body.recipients.clone(),
            revoked_at,
            signature,
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    emit_realtime_delivery_warning(
        &app,
        "消息撤回",
        &body.message_id,
        RealtimeDeliveryResult {
            udp_sent,
            quic_scheduled,
        },
    );
    let _ = app.emit("message:status_changed", &revoked);
    Ok(revoked)
}

#[tauri::command]
pub fn send_files(
    app: tauri::AppHandle,
    conversation_id: String,
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    if paths.is_empty() {
        return Err("at least one file path is required".to_string());
    }
    let conversation_id = normalized_conversation_id(&conversation_id);
    let recipients = conversation_recipients(&conversation_id, state.inner())
        .map_err(|error| error.to_string())?;
    let files = collect_file_entries(&paths)?;
    let manifest = TransferManifest::from_entries(Uuid::new_v4().to_string(), files, 262_144)
        .map_err(|error| error.to_string())?;
    let authorized_peers: HashMap<String, Vec<u8>> = recipients
        .iter()
        .filter_map(|peer_id| {
            state.peer(peer_id).and_then(|peer| {
                (!peer.public_key.is_empty()).then_some((peer_id.clone(), peer.public_key))
            })
        })
        .collect();
    if authorized_peers.len() != recipients.len() {
        return Err(
            "some recipients are missing public keys; refresh discovery before sending files"
                .to_string(),
        );
    }
    state
        .store()
        .upsert_transfer(&conversation_id, &manifest, "indexed", 0)
        .map_err(|error| error.to_string())?;
    state
        .store()
        .save_transfer_authorizations(&manifest.transfer_id, &authorized_peers)
        .map_err(|error| error.to_string())?;
    state
        .transfer_registry()
        .register_authorized(manifest.clone(), authorized_peers);
    let transfer_signature = state
        .identity()
        .sign(&transfer_announcement_signing_payload(
            &conversation_id,
            state.identity().peer_id(),
            &recipients,
            &manifest,
        ));
    let udp_sent = broadcast_transfer_with_settings(
        &conversation_id,
        state.identity().peer_id(),
        &recipients,
        &transfer_signature,
        &manifest,
        &state.settings(),
    )
    .is_ok();
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_transfer_announcement_delivery(
        app.clone(),
        crate::protocol::TransferAnnouncementFrame {
            conversation_id: conversation_id.clone(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: recipients.clone(),
            signature: transfer_signature.clone(),
            manifest: manifest.clone(),
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    emit_realtime_delivery_warning(
        &app,
        "文件传输公告",
        &manifest.transfer_id,
        RealtimeDeliveryResult {
            udp_sent,
            quic_scheduled,
        },
    );
    let _ = app.emit(
        "transfer:progress",
        serde_json::json!({
            "conversation_id": conversation_id.clone(),
            "transfer_id": manifest.transfer_id,
            "status": "indexed",
            "sent_bytes": 0,
            "total_bytes": manifest.total_bytes,
            "file": manifest.files.first().map(|file| file.path.clone()).unwrap_or_default(),
            "file_count": manifest.files.len()
        }),
    );
    let file_names: Vec<String> = manifest
        .files
        .iter()
        .map(|file| {
            Path::new(&file.path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(&file.path)
                .to_string()
        })
        .collect();
    let summary = if file_names.len() == 1 {
        format!("发送了文件：{}", file_names[0])
    } else {
        format!(
            "发送了 {} 个文件：{}",
            file_names.len(),
            file_names
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("、")
        )
    };
    let body = ChatBody {
        message_id: state.identity().next_message_id(),
        conversation_id,
        sender_id: state.identity().peer_id().to_string(),
        recipients,
        signature: Vec::new(),
        quote: None,
        attachments: vec![MessageAttachment::transfer(manifest.clone())],
        body: summary,
        created_at: Utc::now().timestamp_millis(),
    };
    dispatch_chat_body(app, state.inner(), body)
}

#[tauri::command]
pub fn forward_message(
    app: tauri::AppHandle,
    message_id: String,
    target_conversation_id: String,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    let source = state
        .store()
        .get_message(message_id.trim())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())?;
    if source.recalled {
        return Err("recalled messages cannot be forwarded".to_string());
    }
    if source.body.trim().is_empty() && source.attachments.is_empty() {
        return Err("empty messages cannot be forwarded".to_string());
    }

    let target_conversation_id = normalized_conversation_id(&target_conversation_id);
    let recipients = conversation_recipients(&target_conversation_id, state.inner())
        .map_err(|error| error.to_string())?;
    let attachments = prepare_forwarded_attachments(
        &source.attachments,
        &target_conversation_id,
        &recipients,
        app.clone(),
        state.inner(),
    )?;
    let body = ChatBody {
        message_id: state.identity().next_message_id(),
        conversation_id: target_conversation_id,
        sender_id: state.identity().peer_id().to_string(),
        recipients,
        signature: Vec::new(),
        quote: None,
        attachments,
        body: source.body,
        created_at: Utc::now().timestamp_millis(),
    };
    dispatch_chat_body(app, state.inner(), body)
}

fn prepare_forwarded_attachments(
    attachments: &[MessageAttachment],
    conversation_id: &str,
    recipients: &[String],
    #[cfg_attr(not(feature = "quic"), allow(unused_variables))] app: tauri::AppHandle,
    state: &AppState,
) -> Result<Vec<MessageAttachment>, String> {
    if attachments.is_empty() {
        return Ok(Vec::new());
    }
    let requires_transfer_authorization = attachments_require_transfer_authorization(attachments);
    let authorized_peers = if requires_transfer_authorization {
        authorized_peer_keys(recipients, state, "forwarding files")?
    } else {
        HashMap::new()
    };
    let mut hydrated_attachments = attachments.to_vec();
    if requires_transfer_authorization {
        state
            .store()
            .hydrate_attachment_sources(&mut hydrated_attachments)
            .map_err(|error| error.to_string())?;
    }
    let mut forwarded = Vec::with_capacity(attachments.len());
    for attachment in &hydrated_attachments {
        if attachment.kind != "transfer" {
            forwarded.push(attachment.clone());
            continue;
        }
        if !attachment
            .manifest
            .files
            .iter()
            .all(|file| Path::new(file.local_source_path()).is_file())
        {
            return Err("forwarded attachment source is not available on this device".to_string());
        }
        let manifest = TransferManifest::from_entries(
            Uuid::new_v4().to_string(),
            attachment.manifest.files.clone(),
            attachment.manifest.chunk_size,
        )
        .map_err(|error| error.to_string())?;
        state
            .transfer_registry()
            .register_authorized(manifest.clone(), authorized_peers.clone());
        state
            .store()
            .upsert_transfer(conversation_id, &manifest, "indexed", 0)
            .map_err(|error| error.to_string())?;
        state
            .store()
            .save_transfer_authorizations(&manifest.transfer_id, &authorized_peers)
            .map_err(|error| error.to_string())?;
        let signature = state
            .identity()
            .sign(&transfer_announcement_signing_payload(
                conversation_id,
                state.identity().peer_id(),
                recipients,
                &manifest,
            ));
        let udp_sent = broadcast_transfer_with_settings(
            conversation_id,
            state.identity().peer_id(),
            recipients,
            &signature,
            &manifest,
            &state.settings(),
        )
        .is_ok();
        #[cfg(feature = "quic")]
        let quic_scheduled = spawn_quic_transfer_announcement_delivery(
            app.clone(),
            crate::protocol::TransferAnnouncementFrame {
                conversation_id: conversation_id.to_string(),
                sender_id: state.identity().peer_id().to_string(),
                recipients: recipients.to_vec(),
                signature: signature.clone(),
                manifest: manifest.clone(),
            },
        );
        #[cfg(not(feature = "quic"))]
        let quic_scheduled = false;
        emit_realtime_delivery_warning(
            &app,
            "文件传输公告",
            &manifest.transfer_id,
            RealtimeDeliveryResult {
                udp_sent,
                quic_scheduled,
            },
        );
        forwarded.push(MessageAttachment::transfer(manifest));
    }
    Ok(forwarded)
}

fn attachments_require_transfer_authorization(attachments: &[MessageAttachment]) -> bool {
    attachments
        .iter()
        .any(|attachment| attachment.kind == "transfer")
}

fn transfer_status_allows_resume(status: &str) -> bool {
    matches!(
        status.trim().to_ascii_lowercase().as_str(),
        "failed" | "canceled" | "cancelled"
    )
}

fn prepare_retry_transfer_offers(
    body: &mut ChatBody,
    state: &AppState,
) -> Result<Vec<TransferManifest>, String> {
    if !body
        .attachments
        .iter()
        .any(|attachment| attachment.kind == "transfer")
    {
        return Ok(Vec::new());
    }
    state
        .store()
        .hydrate_attachment_sources(&mut body.attachments)
        .map_err(|error| error.to_string())?;
    let authorized_peers = authorized_peer_keys(&body.recipients, state, "retrying file messages")?;
    let mut manifests = Vec::new();
    for attachment in &body.attachments {
        if attachment.kind != "transfer" {
            continue;
        }
        if !manifest_sources_available(&attachment.manifest) {
            return Err("retried attachment source is not available on this device".to_string());
        }
        state
            .transfer_registry()
            .register_authorized(attachment.manifest.clone(), authorized_peers.clone());
        state
            .store()
            .upsert_transfer(&body.conversation_id, &attachment.manifest, "indexed", 0)
            .map_err(|error| error.to_string())?;
        state
            .store()
            .save_transfer_authorizations(&attachment.manifest.transfer_id, &authorized_peers)
            .map_err(|error| error.to_string())?;
        manifests.push(attachment.manifest.clone());
    }
    Ok(manifests)
}

fn authorized_peer_keys(
    recipients: &[String],
    state: &AppState,
    action: &str,
) -> Result<HashMap<String, Vec<u8>>, String> {
    let authorized_peers: HashMap<String, Vec<u8>> = recipients
        .iter()
        .filter_map(|peer_id| {
            state.peer(peer_id).and_then(|peer| {
                (!peer.public_key.is_empty()).then_some((peer_id.clone(), peer.public_key))
            })
        })
        .collect();
    if authorized_peers.len() != recipients.len() {
        return Err(format!(
            "some recipients are missing public keys; refresh discovery before {action}"
        ));
    }
    Ok(authorized_peers)
}

pub fn conversation_recipients(
    conversation_id: &str,
    state: &AppState,
) -> anyhow::Result<Vec<String>> {
    let conversation_id = normalized_conversation_id(conversation_id);
    let self_id = state.identity().peer_id();
    let mut recipients = if conversation_id.starts_with("group:") {
        state.store().list_group_members(&conversation_id)?
    } else if let Some(rest) = conversation_id.strip_prefix("direct:") {
        rest.split(':')
            .map(str::trim)
            .filter(|peer_id| !peer_id.is_empty())
            .map(ToString::to_string)
            .collect()
    } else {
        Vec::new()
    };

    recipients.retain(|peer_id| peer_id != self_id);
    recipients.sort();
    recipients.dedup();
    recipients = state.store().filter_unblocked_peer_ids(recipients)?;
    anyhow::ensure!(
        !recipients.is_empty(),
        "conversation has no unblocked remote recipients"
    );
    Ok(recipients)
}

fn normalized_conversation_id(conversation_id: &str) -> String {
    let trimmed = conversation_id.trim();
    if let Some(rest) = trimmed.strip_prefix("direct:") {
        let peer_ids = rest
            .split(':')
            .map(str::trim)
            .filter(|peer_id| !peer_id.is_empty())
            .collect::<Vec<_>>();
        if peer_ids.is_empty() {
            "direct:".to_string()
        } else {
            format!("direct:{}", peer_ids.join(":"))
        }
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub fn list_messages(
    conversation_id: String,
    limit: Option<u32>,
    before_created_at: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessage>, String> {
    state
        .store()
        .list_messages_before(&conversation_id, before_created_at, limit.unwrap_or(200))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_conversation_history(
    conversation_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conversation_id = conversation_id.trim();
    if conversation_id.is_empty() {
        return Err("conversation id cannot be empty".to_string());
    }
    let path = PathBuf::from(path.trim());
    if path.as_os_str().is_empty() {
        return Err("export path cannot be empty".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
    }
    let summary = state
        .store()
        .conversation_summary(conversation_id)
        .map_err(|error| error.to_string())?;
    let messages = state
        .store()
        .list_messages(conversation_id, u32::MAX)
        .map_err(|error| error.to_string())?;
    let markdown = render_conversation_export(summary.as_ref(), conversation_id, &messages);
    std::fs::write(&path, markdown).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

pub fn render_conversation_export(
    summary: Option<&ConversationSummary>,
    conversation_id: &str,
    messages: &[ChatMessage],
) -> String {
    let title = summary
        .map(|summary| summary.title.as_str())
        .unwrap_or(conversation_id);
    let mut output = String::new();
    output.push_str(&format!("# {}\n\n", markdown_inline(title)));
    output.push_str(&format!(
        "- 会话 ID：`{}`\n",
        markdown_inline(conversation_id)
    ));
    output.push_str(&format!(
        "- 导出时间：{}\n",
        format_export_time(Utc::now().timestamp_millis())
    ));
    output.push_str(&format!("- 消息数量：{}\n\n", messages.len()));

    for message in messages {
        output.push_str(&format!(
            "## {} · {} · {}\n\n",
            format_export_time(message.created_at),
            markdown_inline(&message.sender_id),
            export_message_status_label(&message.status)
        ));
        output.push_str(&format!("- 消息 ID：`{}`\n", markdown_inline(&message.id)));
        output.push_str(&format!("- 发送尝试：{} 次\n", message.send_attempts));
        output.push_str(&format!(
            "- 最后尝试：{}\n\n",
            export_attempt_time(message.last_attempt_at)
        ));
        if message.recalled {
            output.push_str("_此消息已撤回。_\n\n");
            continue;
        }
        if let Some(quote) = &message.quote {
            output.push_str(&format!(
                "> 引用 {}（{}）：{}\n\n",
                markdown_inline(&quote.sender_id),
                markdown_inline(&quote.message_id),
                markdown_inline(&quote.body_preview)
            ));
        }
        if !message.body.trim().is_empty() {
            output.push_str(&markdown_block(&message.body));
            output.push_str("\n\n");
        }
        if !message.attachments.is_empty() {
            output.push_str("附件：\n");
            for attachment in &message.attachments {
                output.push_str(&format!(
                    "- {} `{}`，{} 个文件，{} bytes，分片 {} bytes，总 SHA-256 `{}`\n",
                    markdown_inline(&attachment.kind),
                    markdown_inline(&attachment.manifest.transfer_id),
                    attachment.manifest.files.len(),
                    attachment.manifest.total_bytes,
                    attachment.manifest.chunk_size,
                    markdown_inline(&attachment.manifest.sha256)
                ));
                for file in &attachment.manifest.files {
                    output.push_str(&format!(
                        "  - {} · {} bytes · `{}`\n",
                        markdown_inline(&file.path),
                        file.size,
                        markdown_inline(&file.sha256)
                    ));
                }
            }
            output.push('\n');
        }
        if !message.reactions.is_empty() {
            let reactions = message
                .reactions
                .iter()
                .map(|reaction| format!("{} {}", reaction.reaction, reaction.sender_id))
                .collect::<Vec<_>>()
                .join("，");
            output.push_str(&format!("回应：{}\n\n", markdown_inline(&reactions)));
        }
        if message.favorited {
            output.push_str("_已收藏_\n\n");
        }
    }
    output
}

fn format_export_time(value: i64) -> String {
    chrono::DateTime::<Utc>::from_timestamp_millis(value)
        .map(|time| time.to_rfc3339())
        .unwrap_or_else(|| value.to_string())
}

fn export_attempt_time(value: i64) -> String {
    if value <= 0 {
        return "尚未尝试".to_string();
    }
    format_export_time(value)
}

fn export_message_status_label(status: &MessageStatus) -> &'static str {
    match status {
        MessageStatus::Queued => "排队中",
        MessageStatus::Sending => "发送中",
        MessageStatus::Delivered => "已送达",
        MessageStatus::Read => "已读",
        MessageStatus::Failed => "发送失败",
        MessageStatus::Received => "已接收",
    }
}

fn markdown_inline(value: &str) -> String {
    value.replace('\n', " ").replace('`', "\\`")
}

fn markdown_block(value: &str) -> String {
    value
        .lines()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
}

#[tauri::command]
pub fn delete_message(message_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .store()
        .delete_message(message_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_conversation_messages(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    state
        .store()
        .clear_conversation_messages(conversation_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn retry_message(
    app: tauri::AppHandle,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    let mut body = state
        .store()
        .get_chat_body(message_id.trim())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())?;
    if body.sender_id != state.identity().peer_id() {
        return Err("only local outbox messages can be retried".to_string());
    }
    if !state
        .store()
        .message_is_retryable_outbox(&body.message_id)
        .map_err(|error| error.to_string())?
    {
        return Err("only queued, sending, or failed outbox messages can be retried".to_string());
    }
    if body.recipients.is_empty() {
        body.recipients = conversation_recipients(&body.conversation_id, state.inner())
            .map_err(|error| error.to_string())?;
    }
    let retry_ready = state
        .store()
        .prune_blocked_recipients_for_retry(&mut body, |payload| state.identity().sign(payload))
        .map_err(|error| error.to_string())?;
    if !retry_ready {
        return Err("conversation has no unblocked remote recipients".to_string());
    }
    if body.signature.is_empty() {
        body.signature = state.identity().sign(&body.signing_payload());
    }
    let retry_transfer_manifests = prepare_retry_transfer_offers(&mut body, state.inner())?;
    for manifest in &retry_transfer_manifests {
        let transfer_signature = state
            .identity()
            .sign(&transfer_announcement_signing_payload(
                &body.conversation_id,
                state.identity().peer_id(),
                &body.recipients,
                manifest,
            ));
        let udp_sent = broadcast_transfer_with_settings(
            &body.conversation_id,
            state.identity().peer_id(),
            &body.recipients,
            &transfer_signature,
            manifest,
            &state.settings(),
        )
        .is_ok();
        #[cfg(feature = "quic")]
        let quic_scheduled = spawn_quic_transfer_announcement_delivery(
            app.clone(),
            crate::protocol::TransferAnnouncementFrame {
                conversation_id: body.conversation_id.clone(),
                sender_id: state.identity().peer_id().to_string(),
                recipients: body.recipients.clone(),
                signature: transfer_signature.clone(),
                manifest: manifest.clone(),
            },
        );
        #[cfg(not(feature = "quic"))]
        let quic_scheduled = false;
        emit_realtime_delivery_warning(
            &app,
            "文件传输公告",
            &manifest.transfer_id,
            RealtimeDeliveryResult {
                udp_sent,
                quic_scheduled,
            },
        );
        let _ = app.emit(
            "transfer:progress",
            serde_json::json!({
                "conversation_id": body.conversation_id.clone(),
                "transfer_id": manifest.transfer_id.clone(),
                "status": "indexed",
                "sent_bytes": 0,
                "total_bytes": manifest.total_bytes,
                "file": manifest.files.first().map(|file| file.path.clone()).unwrap_or_default(),
                "file_count": manifest.files.len()
            }),
        );
    }
    state
        .store()
        .reset_message_for_retry(&body)
        .map_err(|error| error.to_string())?;
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_chat_delivery(app.clone(), body.clone());
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    let udp_sent = broadcast_chat_with_settings(&body, &state.settings()).is_ok();
    let status = if quic_scheduled || udp_sent {
        let _ = state.store().mark_sending(&body.message_id);
        MessageStatus::Sending
    } else {
        MessageStatus::Queued
    };
    let message = ChatMessage::from((body, status));
    let _ = app.emit("message:status_changed", &message);
    Ok(message)
}

#[derive(Debug, Deserialize)]
pub struct CreateGroupRequest {
    pub name: String,
    pub member_peer_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupRequest {
    pub conversation_id: String,
    pub name: String,
    #[serde(default)]
    pub announcement: String,
    pub member_peer_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConversationPreferenceRequest {
    pub conversation_id: String,
    pub pinned: bool,
    pub muted: bool,
    pub archived: bool,
}

#[tauri::command]
pub fn create_group(
    app: tauri::AppHandle,
    name: String,
    member_peer_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("group name cannot be empty".to_string());
    }
    let self_id = state.identity().peer_id().to_string();
    let remote_members = unblocked_remote_group_members(member_peer_ids, &self_id, state.inner())
        .map_err(|error| error.to_string())?;
    let mut all_members = remote_members.clone();
    all_members.push(self_id.clone());
    all_members.sort();
    all_members.dedup();

    let conversation_id = state
        .store()
        .create_group_conversation(name.trim(), &self_id, &all_members)
        .map_err(|error| error.to_string())?;
    let recipients = remote_members;
    let broadcast_result = broadcast_group_state(
        app.clone(),
        &conversation_id,
        name.trim(),
        "",
        &recipients,
        &all_members,
        state.inner(),
    );
    emit_group_broadcast_warning(&app, &conversation_id, name.trim(), broadcast_result);
    if let Ok(Some(summary)) = state.store().conversation_summary(&conversation_id) {
        let _ = app.emit("conversation:upserted", summary);
    }
    Ok(conversation_id)
}

#[tauri::command]
pub fn update_group(
    app: tauri::AppHandle,
    request: UpdateGroupRequest,
    state: State<'_, AppState>,
) -> Result<ConversationSummary, String> {
    let conversation_id = request.conversation_id.trim();
    let name = request.name.trim();
    let announcement = request.announcement.trim();
    if !conversation_id.starts_with("group:") {
        return Err("only group conversations can be updated".to_string());
    }
    if name.is_empty() {
        return Err("group name cannot be empty".to_string());
    }

    let self_id = state.identity().peer_id().to_string();
    let owner_peer_id = state
        .store()
        .group_owner_peer_id(conversation_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "group conversation not found".to_string())?;
    if !owner_peer_id.is_empty() && owner_peer_id != self_id {
        return Err("only the group creator can update group members".to_string());
    }
    let remote_members =
        unblocked_remote_group_members(request.member_peer_ids, &self_id, state.inner())
            .map_err(|error| error.to_string())?;
    let mut all_members = remote_members.clone();
    all_members.push(self_id.clone());
    all_members.sort();
    all_members.dedup();

    state
        .store()
        .upsert_group_conversation(conversation_id, name, announcement, &self_id, &all_members)
        .map_err(|error| error.to_string())?;
    let recipients = remote_members;
    let broadcast_result = broadcast_group_state(
        app.clone(),
        conversation_id,
        name,
        announcement,
        &recipients,
        &all_members,
        state.inner(),
    );
    emit_group_broadcast_warning(&app, conversation_id, name, broadcast_result);
    let summary = state
        .store()
        .conversation_summary(conversation_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "group conversation not found".to_string())?;
    let _ = app.emit("conversation:upserted", &summary);
    Ok(summary)
}

fn unblocked_remote_group_members(
    member_peer_ids: Vec<String>,
    self_id: &str,
    state: &AppState,
) -> anyhow::Result<Vec<String>> {
    let mut members: Vec<String> = member_peer_ids
        .into_iter()
        .map(|peer_id| peer_id.trim().to_string())
        .filter(|peer_id| !peer_id.is_empty() && peer_id != self_id)
        .collect();
    members.sort();
    members.dedup();
    let members = state.store().filter_unblocked_peer_ids(members)?;
    anyhow::ensure!(
        !members.is_empty(),
        "group must contain at least one unblocked remote peer"
    );
    Ok(members)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RealtimeDeliveryResult {
    udp_sent: bool,
    quic_scheduled: bool,
}

fn broadcast_group_state(
    #[cfg_attr(not(feature = "quic"), allow(unused_variables))] app: tauri::AppHandle,
    conversation_id: &str,
    name: &str,
    announcement: &str,
    recipients: &[String],
    all_members: &[String],
    state: &AppState,
) -> RealtimeDeliveryResult {
    let invite_signature = state.identity().sign(&group_invite_signing_payload(
        conversation_id,
        name,
        announcement,
        state.identity().peer_id(),
        recipients,
        all_members,
    ));
    let udp_sent = broadcast_group_invite_with_settings(
        conversation_id,
        name,
        announcement,
        state.identity().peer_id(),
        recipients,
        all_members,
        &invite_signature,
        &state.settings(),
    )
    .is_ok();
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_group_invite_delivery(
        app,
        crate::protocol::GroupInviteFrame {
            conversation_id: conversation_id.to_string(),
            name: name.to_string(),
            announcement: announcement.to_string(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: recipients.to_vec(),
            member_peer_ids: all_members.to_vec(),
            signature: invite_signature,
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;

    RealtimeDeliveryResult {
        udp_sent,
        quic_scheduled,
    }
}

fn emit_group_broadcast_warning(
    app: &tauri::AppHandle,
    conversation_id: &str,
    name: &str,
    result: RealtimeDeliveryResult,
) {
    if let Some(warning) = group_broadcast_warning(conversation_id, name, result) {
        let _ = app.emit("network:warning", warning);
    }
}

fn group_broadcast_warning(
    conversation_id: &str,
    name: &str,
    result: RealtimeDeliveryResult,
) -> Option<String> {
    if result.udp_sent || result.quic_scheduled {
        return None;
    }
    Some(format!(
        "群聊 {} ({}) 已保存到本机，但未能通过 UDP 或 QUIC 广播给成员；请检查防火墙、网络发现或种子节点设置",
        name, conversation_id
    ))
}

fn emit_realtime_delivery_warning(
    app: &tauri::AppHandle,
    action_label: &str,
    target_id: &str,
    result: RealtimeDeliveryResult,
) {
    if let Some(warning) = realtime_delivery_warning(action_label, target_id, result) {
        let _ = app.emit("network:warning", warning);
    }
}

fn realtime_delivery_warning(
    action_label: &str,
    target_id: &str,
    result: RealtimeDeliveryResult,
) -> Option<String> {
    if result.udp_sent || result.quic_scheduled {
        return None;
    }
    Some(format!(
        "{} {} 已保存到本机，但未能通过 UDP 或 QUIC 同步给对端；请检查防火墙、网络发现或种子节点设置",
        action_label, target_id
    ))
}

#[tauri::command]
pub fn list_group_members(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    state
        .store()
        .list_group_members(conversation_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_conversation_preferences(
    preferences: ConversationPreferenceRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .store()
        .update_conversation_preferences(
            &preferences.conversation_id,
            preferences.pinned,
            preferences.muted,
            preferences.archived,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_conversation(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .store()
        .delete_conversation(conversation_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn mark_conversation_read(
    #[cfg_attr(not(feature = "quic"), allow(unused_variables))] app: tauri::AppHandle,
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conversation_id = conversation_id.trim().to_string();
    let unread_received = state
        .store()
        .received_messages_for_read_receipt(&conversation_id, state.identity().peer_id(), u32::MAX)
        .map_err(|error| error.to_string())?;
    state
        .store()
        .mark_conversation_read(&conversation_id)
        .map_err(|error| error.to_string())?;
    send_read_receipt_batches(
        &app,
        state.inner(),
        read_receipt_batches(unread_received, READ_RECEIPT_BATCH_SIZE),
    );
    Ok(())
}

fn read_receipt_batches(
    messages: Vec<ChatMessage>,
    max_ids_per_frame: usize,
) -> Vec<(String, String, Vec<String>)> {
    let max_ids_per_frame = max_ids_per_frame.max(1);
    let mut grouped: Vec<(String, String, Vec<String>)> = Vec::new();
    for message in messages {
        if let Some((_, _, message_ids)) =
            grouped.iter_mut().find(|(conversation_id, sender_id, _)| {
                conversation_id == &message.conversation_id && sender_id == &message.sender_id
            })
        {
            message_ids.push(message.id);
        } else {
            grouped.push((message.conversation_id, message.sender_id, vec![message.id]));
        }
    }

    let mut batches = Vec::new();
    for (conversation_id, sender_id, message_ids) in grouped {
        for chunk in message_ids.chunks(max_ids_per_frame) {
            batches.push((conversation_id.clone(), sender_id.clone(), chunk.to_vec()));
        }
    }
    batches
}

fn send_read_receipt_batches(
    app: &tauri::AppHandle,
    state: &AppState,
    batches: Vec<(String, String, Vec<String>)>,
) {
    let settings = state.settings();
    let read_at = Utc::now().timestamp_millis();
    for (conversation_id, sender_id, message_ids) in batches {
        let recipients = vec![sender_id.clone()];
        let signature = state.identity().sign(&read_receipt_signing_payload(
            &conversation_id,
            state.identity().peer_id(),
            &recipients,
            &message_ids,
            read_at,
        ));
        let udp_sent = broadcast_read_receipt_with_settings(
            &conversation_id,
            state.identity().peer_id(),
            &recipients,
            &message_ids,
            read_at,
            &signature,
            &settings,
        )
        .is_ok();
        #[cfg(feature = "quic")]
        let quic_scheduled = spawn_quic_read_receipt_delivery(
            app.clone(),
            crate::protocol::ReadReceiptFrame {
                conversation_id: conversation_id.clone(),
                sender_id: state.identity().peer_id().to_string(),
                recipients: recipients.clone(),
                message_ids: message_ids.clone(),
                read_at,
                signature,
            },
        );
        #[cfg(not(feature = "quic"))]
        let quic_scheduled = false;
        let receipt_target = format!("{}（{} 条）", conversation_id, message_ids.len());
        emit_realtime_delivery_warning(
            &app,
            "已读回执",
            &receipt_target,
            RealtimeDeliveryResult {
                udp_sent,
                quic_scheduled,
            },
        );
    }
}

#[tauri::command]
pub fn mark_conversation_unread(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .store()
        .mark_conversation_unread(conversation_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn mark_all_conversations_read(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let unread_received = state
        .store()
        .all_received_messages_for_read_receipts(state.identity().peer_id())
        .map_err(|error| error.to_string())?;
    let changed = state
        .store()
        .mark_all_conversations_read()
        .map_err(|error| error.to_string())?;
    send_read_receipt_batches(
        &app,
        state.inner(),
        read_receipt_batches(unread_received, READ_RECEIPT_BATCH_SIZE),
    );
    Ok(changed)
}

#[tauri::command]
pub fn get_conversation_draft(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Option<ConversationDraft>, String> {
    state
        .store()
        .load_conversation_draft(conversation_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_conversation_draft(
    conversation_id: String,
    text: String,
    quote: Option<MessageQuote>,
    state: State<'_, AppState>,
) -> Result<Option<ConversationSummary>, String> {
    state
        .store()
        .save_conversation_draft(conversation_id.trim(), &text, &quote)
        .map_err(|error| error.to_string())?;
    state
        .store()
        .conversation_summary(conversation_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_messages(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessage>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    state
        .store()
        .search_messages(query.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_conversation_messages(
    conversation_id: String,
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessage>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    state
        .store()
        .search_conversation_messages(conversation_id.trim(), query.trim(), 100)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_conversation_messages_between(
    conversation_id: String,
    start_at: i64,
    end_at: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessage>, String> {
    if conversation_id.trim().is_empty() {
        return Err("conversation id cannot be empty".to_string());
    }
    if start_at < 0 || end_at <= start_at {
        return Err("invalid message time range".to_string());
    }
    state
        .store()
        .list_conversation_messages_between(conversation_id.trim(), start_at, end_at, 300)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_message_favorite(
    message_id: String,
    favorite: bool,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    state
        .store()
        .set_message_favorite(message_id.trim(), favorite)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())
}

#[tauri::command]
pub fn set_message_pin(
    message_id: String,
    pinned: bool,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    state
        .store()
        .set_message_pin(message_id.trim(), pinned)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())
}

#[tauri::command]
pub fn list_pinned_messages(
    conversation_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessage>, String> {
    state
        .store()
        .list_pinned_messages(conversation_id.trim(), 20)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_message_todo(
    message_id: String,
    todo: bool,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    state
        .store()
        .set_message_todo(message_id.trim(), todo)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())
}

#[tauri::command]
pub fn list_todo_messages(state: State<'_, AppState>) -> Result<Vec<ChatMessage>, String> {
    state
        .store()
        .list_todo_messages(200)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_outbox_messages(state: State<'_, AppState>) -> Result<Vec<ChatMessage>, String> {
    state
        .store()
        .list_outbox_messages(200)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_message_delivery_receipts(
    message_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<MessageDeliveryReceipt>, String> {
    state
        .store()
        .message_delivery_receipts(message_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_message_reaction(
    app: tauri::AppHandle,
    message_id: String,
    reaction: String,
    active: bool,
    state: State<'_, AppState>,
) -> Result<ChatMessage, String> {
    let message_id = message_id.trim();
    let reaction = reaction.trim();
    if reaction.is_empty() {
        return Err("reaction cannot be empty".to_string());
    }
    if reaction.chars().count() > 8 {
        return Err("reaction is too long".to_string());
    }

    let existing = state
        .store()
        .get_message(message_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())?;
    if existing.recalled {
        return Err("recalled messages cannot be reacted to".to_string());
    }

    let recipients = conversation_recipients(&existing.conversation_id, state.inner())
        .map_err(|error| error.to_string())?;
    let reacted_at = Utc::now().timestamp_millis();
    let sender_id = state.identity().peer_id();
    let updated = state
        .store()
        .set_message_reaction(
            &existing.id,
            &existing.conversation_id,
            sender_id,
            reaction,
            active,
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "message not found".to_string())?;
    let signature = state.identity().sign(&message_reaction_signing_payload(
        &existing.conversation_id,
        &existing.id,
        sender_id,
        &recipients,
        reaction,
        active,
        reacted_at,
    ));
    let udp_sent = broadcast_message_reaction_with_settings(
        &existing.conversation_id,
        &existing.id,
        sender_id,
        &recipients,
        reaction,
        active,
        reacted_at,
        &signature,
        &state.settings(),
    )
    .is_ok();
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_message_reaction_delivery(
        app.clone(),
        crate::protocol::MessageReactionFrame {
            conversation_id: existing.conversation_id.clone(),
            message_id: existing.id.clone(),
            sender_id: sender_id.to_string(),
            recipients: recipients.clone(),
            reaction: reaction.to_string(),
            active,
            reacted_at,
            signature,
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    emit_realtime_delivery_warning(
        &app,
        "消息回应",
        &existing.id,
        RealtimeDeliveryResult {
            udp_sent,
            quic_scheduled,
        },
    );
    let _ = app.emit("message:status_changed", &updated);
    Ok(updated)
}

#[tauri::command]
pub fn list_favorite_messages(state: State<'_, AppState>) -> Result<Vec<ChatMessage>, String> {
    state
        .store()
        .list_favorite_messages(200)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn trust_peer(
    peer_id: String,
    fingerprint: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .store()
        .trust_peer(peer_id.trim(), fingerprint.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_trusted_peers(state: State<'_, AppState>) -> Result<Vec<TrustedPeer>, String> {
    state
        .store()
        .list_trusted_peers()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_trusted_peer(peer_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    state
        .store()
        .remove_trusted_peer(peer_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_network_settings(state: State<'_, AppState>) -> Result<NetworkSettings, String> {
    Ok(state.settings())
}

#[tauri::command]
pub fn get_transport_config() -> Result<TransportConfig, String> {
    Ok(TransportConfig::default())
}

#[tauri::command]
pub fn list_transfers(state: State<'_, AppState>) -> Result<Vec<TransferTask>, String> {
    state
        .store()
        .list_transfers(100)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_transfer(transfer_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let transfer_id = transfer_id.trim();
    let record_deleted = state
        .store()
        .delete_transfer(transfer_id)
        .map_err(|error| error.to_string())?;
    let offer_removed = state.transfer_registry().remove(transfer_id);
    Ok(record_deleted || offer_removed)
}

#[tauri::command]
pub fn cancel_transfer(transfer_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let transfer_id = transfer_id.trim();
    let status_changed = state
        .store()
        .cancel_transfer(transfer_id)
        .map_err(|error| error.to_string())?;
    let offer_removed = state.transfer_registry().remove(transfer_id);
    Ok(status_changed || offer_removed)
}

#[tauri::command]
pub fn resume_transfer(
    transfer_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<TransferTask, String> {
    let transfer_id = transfer_id.trim();
    let status = state
        .store()
        .transfer_status(transfer_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "transfer record was not found".to_string())?;
    if !transfer_status_allows_resume(&status) {
        return Err("only failed or canceled transfers can be resumed".to_string());
    }
    let (conversation_id, manifest, authorizations) = state
        .store()
        .local_transfer_offer(transfer_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "transfer record was not found".to_string())?;
    if authorizations.is_empty() {
        return Err("transfer has no authorized recipients to resume".to_string());
    }
    if !manifest_sources_available(&manifest) {
        return Err("transfer source files are no longer available".to_string());
    }
    let mut recipients = authorizations.keys().cloned().collect::<Vec<_>>();
    recipients.sort();
    state
        .transfer_registry()
        .register_authorized(manifest.clone(), authorizations);
    state
        .store()
        .update_transfer_progress(&manifest.transfer_id, "indexed", 0)
        .map_err(|error| error.to_string())?;
    let transfer_signature = state
        .identity()
        .sign(&transfer_announcement_signing_payload(
            &conversation_id,
            state.identity().peer_id(),
            &recipients,
            &manifest,
        ));
    let udp_sent = broadcast_transfer_with_settings(
        &conversation_id,
        state.identity().peer_id(),
        &recipients,
        &transfer_signature,
        &manifest,
        &state.settings(),
    )
    .is_ok();
    #[cfg(feature = "quic")]
    let quic_scheduled = spawn_quic_transfer_announcement_delivery(
        app.clone(),
        crate::protocol::TransferAnnouncementFrame {
            conversation_id: conversation_id.clone(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: recipients.clone(),
            signature: transfer_signature.clone(),
            manifest: manifest.clone(),
        },
    );
    #[cfg(not(feature = "quic"))]
    let quic_scheduled = false;
    emit_realtime_delivery_warning(
        &app,
        "文件传输公告",
        &manifest.transfer_id,
        RealtimeDeliveryResult {
            udp_sent,
            quic_scheduled,
        },
    );
    let _ = app.emit(
        "transfer:progress",
        serde_json::json!({
            "conversation_id": conversation_id.clone(),
            "transfer_id": manifest.transfer_id,
            "status": "indexed",
            "sent_bytes": 0,
            "total_bytes": manifest.total_bytes,
            "file": manifest.files.first().map(|file| file.path.clone()).unwrap_or_default(),
            "file_count": manifest.files.len()
        }),
    );
    Ok(TransferTask::from_manifest(
        manifest.transfer_id.clone(),
        conversation_id,
        "indexed".to_string(),
        0,
        manifest,
        false,
        String::new(),
    ))
}

#[tauri::command]
pub fn clear_completed_transfers(state: State<'_, AppState>) -> Result<usize, String> {
    let cleanup = state
        .store()
        .clear_completed_transfers()
        .map_err(|error| error.to_string())?;
    for transfer_id in &cleanup.transfer_ids {
        state.transfer_registry().remove(transfer_id);
    }
    Ok(cleanup.removed_count)
}

#[tauri::command]
pub fn open_transfer_location(transfer_id: String) -> Result<(), String> {
    let path = received_transfer_location_path(&default_data_dir(), &transfer_id)?;
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn received_transfer_location_path(data_dir: &Path, transfer_id: &str) -> Result<PathBuf, String> {
    if !is_valid_transfer_id(transfer_id) {
        return Err("transfer id contains invalid path characters".to_string());
    }
    Ok(data_dir.join("received_files").join(transfer_id))
}

#[tauri::command]
pub fn update_network_settings(
    settings: NetworkSettings,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<NetworkSettings, String> {
    let settings = normalize_network_settings(settings);
    state
        .update_settings(settings.clone())
        .map_err(|error| error.to_string())?;
    if let Err(error) = broadcast_beacon_with_settings(&state.self_profile(), &settings) {
        let _ = app.emit(
            "network:warning",
            format!("Network settings beacon broadcast failed: {error}"),
        );
    }
    Ok(settings)
}

#[tauri::command]
pub fn get_app_preferences(state: State<'_, AppState>) -> Result<AppPreferences, String> {
    state
        .store()
        .load_app_preferences()
        .map(|preferences| preferences.unwrap_or_default())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_app_preferences(
    preferences: AppPreferences,
    state: State<'_, AppState>,
) -> Result<AppPreferences, String> {
    let preferences = preferences.normalized();
    state
        .store()
        .save_app_preferences(&preferences)
        .map_err(|error| error.to_string())?;
    Ok(preferences)
}

#[tauri::command]
pub fn minimize_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    desktop::hide_main_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    desktop::show_main_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_screen_capture() -> Result<(), String> {
    screen_capture::start_system_screen_capture().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn stage_clipboard_files(files: Vec<StagedClipboardFile>) -> Result<Vec<String>, String> {
    if files.is_empty() {
        return Err("at least one clipboard file is required".to_string());
    }

    staging::write_staged_clipboard_files(&files)
        .map(|paths| {
            paths
                .into_iter()
                .map(|path| path.to_string_lossy().to_string())
                .collect()
        })
        .map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageOverview {
    pub data_dir: String,
    pub database_path: String,
    pub database_key_path: String,
    pub database_key_protection: String,
    pub received_files_dir: String,
    pub staged_files_dir: String,
    pub database_bytes: u64,
    pub received_bytes: u64,
    pub staged_bytes: u64,
    pub transfer_task_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageMigrationProgress {
    pub phase: String,
    pub completed: u64,
    pub total: u64,
    pub current_path: String,
}

#[tauri::command]
pub fn get_storage_overview(state: State<'_, AppState>) -> Result<StorageOverview, String> {
    let data_dir = default_data_dir();
    let database_path = data_dir.join("iim.sqlite");
    let database_key_path = store_key_path(&data_dir);
    let received_files_dir = data_dir.join("received_files");
    let staged_files_dir = data_dir.join("staged");
    let transfer_task_count = state
        .store()
        .list_transfers(1000)
        .map(|tasks| tasks.len())
        .map_err(|error| error.to_string())?;

    Ok(StorageOverview {
        data_dir: data_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        database_key_path: database_key_path.to_string_lossy().to_string(),
        database_key_protection: database_key_protection().to_string(),
        received_files_dir: received_files_dir.to_string_lossy().to_string(),
        staged_files_dir: staged_files_dir.to_string_lossy().to_string(),
        database_bytes: file_size(&database_path),
        received_bytes: directory_size(&received_files_dir),
        staged_bytes: directory_size(&staged_files_dir),
        transfer_task_count,
    })
}

#[tauri::command]
pub fn migrate_storage_directory(
    app: tauri::AppHandle,
    new_data_dir: String,
) -> Result<StorageOverview, String> {
    let current_dir = default_data_dir();
    let target_dir = PathBuf::from(new_data_dir.trim());
    if target_dir.as_os_str().is_empty() {
        return Err("请选择新的数据目录".to_string());
    }
    if !target_dir.is_absolute() {
        return Err("数据目录必须使用绝对路径".to_string());
    }
    let current_canonical = canonical_or_self(&current_dir);
    let target_canonical = canonical_or_self(&target_dir);
    if current_canonical == target_canonical {
        return Err("新目录不能与当前数据目录相同".to_string());
    }
    if target_canonical.starts_with(&current_canonical) {
        return Err("新目录不能放在当前数据目录内部".to_string());
    }

    std::fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
    let files = collect_files(&current_dir).map_err(|error| error.to_string())?;
    let total = files.len() as u64;
    emit_storage_migration_progress(&app, "preparing", 0, total, &target_dir);
    for (index, source) in files.iter().enumerate() {
        let relative = source
            .strip_prefix(&current_dir)
            .map_err(|error| error.to_string())?;
        let destination = target_dir.join(relative);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::copy(source, &destination).map_err(|error| {
            format!(
                "copy {} to {}: {error}",
                source.to_string_lossy(),
                destination.to_string_lossy()
            )
        })?;
        emit_storage_migration_progress(&app, "copying", (index + 1) as u64, total, &destination);
    }
    write_data_dir_config(&target_dir).map_err(|error| error.to_string())?;
    emit_storage_migration_progress(&app, "switching", total, total, &data_dir_config_path());
    Ok(storage_overview_for_dir(&target_dir, 0))
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    std::process::Command::new(exe)
        .spawn()
        .map_err(|error| error.to_string())?;
    app.exit(0);
    Ok(())
}

fn storage_overview_for_dir(data_dir: &Path, transfer_task_count: usize) -> StorageOverview {
    let database_path = data_dir.join("iim.sqlite");
    let database_key_path = store_key_path(data_dir);
    let received_files_dir = data_dir.join("received_files");
    let staged_files_dir = data_dir.join("staged");
    StorageOverview {
        data_dir: data_dir.to_string_lossy().to_string(),
        database_path: database_path.to_string_lossy().to_string(),
        database_key_path: database_key_path.to_string_lossy().to_string(),
        database_key_protection: database_key_protection().to_string(),
        received_files_dir: received_files_dir.to_string_lossy().to_string(),
        staged_files_dir: staged_files_dir.to_string_lossy().to_string(),
        database_bytes: file_size(&database_path),
        received_bytes: directory_size(&received_files_dir),
        staged_bytes: directory_size(&staged_files_dir),
        transfer_task_count,
    }
}

fn database_key_protection() -> &'static str {
    if cfg!(windows) {
        "Windows DPAPI"
    } else {
        "local key file"
    }
}

fn recreate_clean_directory(path: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            remove_link(path).map_err(|error| error.to_string())?;
        }
        Ok(metadata) if metadata.is_dir() => {
            std::fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        }
        Ok(_) => {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    std::fs::create_dir_all(path).map_err(|error| error.to_string())
}

fn remove_link(path: &Path) -> std::io::Result<()> {
    std::fs::remove_file(path).or_else(|_| std::fs::remove_dir(path))
}

#[tauri::command]
pub fn clear_staged_files() -> Result<(), String> {
    let staged_files_dir = default_data_dir().join("staged");
    recreate_clean_directory(&staged_files_dir)
}

#[tauri::command]
pub fn open_storage_location(kind: String) -> Result<(), String> {
    let path =
        storage_location_path(kind.trim()).ok_or_else(|| "unknown storage location".to_string())?;
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn storage_location_path(kind: &str) -> Option<PathBuf> {
    let data_dir = default_data_dir();
    match kind {
        "data" => Some(data_dir),
        "received" => Some(data_dir.join("received_files")),
        "staged" => Some(data_dir.join("staged")),
        _ => None,
    }
}

fn canonical_or_self(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn collect_files(root: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    if !root.exists() {
        return Ok(files);
    }
    collect_files_inner(root, &mut files)?;
    Ok(files)
}

fn collect_files_inner(path: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_files_inner(&path, files)?;
        } else if file_type.is_file() {
            files.push(path);
        }
    }
    Ok(())
}

fn emit_storage_migration_progress(
    app: &tauri::AppHandle,
    phase: &str,
    completed: u64,
    total: u64,
    current_path: &Path,
) {
    let _ = app.emit(
        "storage:migration_progress",
        StorageMigrationProgress {
            phase: phase.to_string(),
            completed,
            total,
            current_path: current_path.to_string_lossy().to_string(),
        },
    );
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };

    entries
        .filter_map(Result::ok)
        .map(|entry| match std::fs::symlink_metadata(entry.path()) {
            Ok(metadata) if metadata.is_file() => metadata.len(),
            Ok(metadata) if metadata.is_dir() => directory_size(&entry.path()),
            _ => 0,
        })
        .sum()
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn sha256_file(path: &str) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = std::io::Read::read(&mut file, &mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(to_hex(&hasher.finalize()))
}

pub fn collect_file_entries(paths: &[String]) -> Result<Vec<FileEntry>, String> {
    let mut files = Vec::new();
    for raw_path in paths {
        let path = PathBuf::from(raw_path);
        let base = path.parent().unwrap_or_else(|| Path::new(""));
        collect_path(&path, base, &mut files).map_err(|error| format!("{raw_path}: {error}"))?;
    }
    files.sort_by(|a, b| {
        a.relative_path
            .cmp(&b.relative_path)
            .then_with(|| a.local_source_path().cmp(b.local_source_path()))
    });
    disambiguate_duplicate_file_entries(&mut files);
    files.sort_by(|a, b| {
        a.relative_path
            .cmp(&b.relative_path)
            .then_with(|| a.local_source_path().cmp(b.local_source_path()))
    });
    if files.is_empty() {
        return Err("selected paths do not contain any files".to_string());
    }
    Ok(files)
}

fn disambiguate_duplicate_file_entries(files: &mut [FileEntry]) {
    let mut used_paths = HashSet::new();
    for file in files {
        let original = file.relative_path.trim();
        let mut candidate = if original.is_empty() {
            manifest_relative_path(Path::new(&file.path), Path::new(""))
        } else {
            original.replace('\\', "/")
        };
        if candidate.trim().is_empty() {
            candidate = "received-file".to_string();
        }
        let mut suffix = 2;
        while !used_paths.insert(manifest_path_key(&candidate)) {
            candidate = suffixed_manifest_path(original, suffix);
            suffix += 1;
        }
        file.path = candidate.clone();
        file.relative_path = candidate;
    }
}

fn manifest_path_key(value: &str) -> String {
    value.replace('\\', "/").to_lowercase()
}

fn suffixed_manifest_path(path: &str, suffix: usize) -> String {
    let normalized = path.replace('\\', "/");
    if let Some((root, rest)) = normalized.split_once('/') {
        return format!("{root} ({suffix})/{rest}");
    }
    let (stem, extension) = split_file_stem_extension(&normalized);
    format!("{stem} ({suffix}){extension}")
}

fn split_file_stem_extension(file_name: &str) -> (&str, &str) {
    if let Some(index) = file_name.rfind('.') {
        if index > 0 {
            return (&file_name[..index], &file_name[index..]);
        }
    }
    (file_name, "")
}

fn collect_path(
    path: &Path,
    relative_base: &Path,
    files: &mut Vec<FileEntry>,
) -> std::io::Result<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Ok(());
    }
    if metadata.is_file() {
        let relative_path = manifest_relative_path(path, relative_base);
        let source_path = path.to_string_lossy().to_string();
        let digest = sha256_file(&source_path)?;
        files.push(
            FileEntry::new(relative_path.clone(), metadata.len(), digest)
                .with_relative_path(relative_path)
                .with_source_path(source_path),
        );
        return Ok(());
    }

    if metadata.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            collect_path(&entry.path(), relative_base, files)?;
        }
    }
    Ok(())
}

fn manifest_relative_path(path: &Path, relative_base: &Path) -> String {
    let relative = path.strip_prefix(relative_base).unwrap_or(path);
    let parts: Vec<String> = relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => value.to_str().map(ToString::to_string),
            _ => None,
        })
        .collect();
    if parts.is_empty() {
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("received-file")
            .to_string()
    } else {
        parts.join("/")
    }
}

#[cfg(test)]
mod directory_size_tests {
    use super::{
        directory_size, file_size, received_transfer_location_path, recreate_clean_directory,
    };
    use std::path::Path;

    #[cfg(unix)]
    fn create_file_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_file_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_file(target, link)
    }

    #[cfg(unix)]
    fn create_dir_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_dir_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(target, link)
    }

    #[test]
    fn directory_size_does_not_follow_symlinked_files() {
        let temp = tempfile::tempdir().expect("temp dir");
        let root = temp.path().join("root");
        let outside = temp.path().join("outside.bin");
        let inside = root.join("inside.bin");
        let link = root.join("linked-outside.bin");
        std::fs::create_dir(&root).expect("root dir");
        std::fs::write(&inside, [1u8; 7]).expect("inside file");
        std::fs::write(&outside, [2u8; 23]).expect("outside file");
        if create_file_symlink(&outside, &link).is_err() {
            return;
        }

        assert_eq!(directory_size(&root), 7);
    }

    #[test]
    fn file_size_reports_existing_file_and_zero_for_missing_file() {
        let temp = tempfile::tempdir().expect("temp dir");
        let database = temp.path().join("iim.sqlite");
        let missing = temp.path().join("missing.sqlite");
        std::fs::write(&database, [9u8; 13]).expect("database file");

        assert_eq!(file_size(&database), 13);
        assert_eq!(file_size(&missing), 0);
    }

    #[test]
    fn recreate_clean_directory_removes_symlink_without_touching_target() {
        let temp = tempfile::tempdir().expect("temp dir");
        let target = temp.path().join("target");
        let link = temp.path().join("staged");
        let target_file = target.join("keep.bin");
        std::fs::create_dir(&target).expect("target dir");
        std::fs::write(&target_file, [3u8; 11]).expect("target file");
        if create_dir_symlink(&target, &link).is_err() {
            return;
        }

        recreate_clean_directory(&link).expect("directory recreated");

        assert!(link.is_dir());
        assert_eq!(
            std::fs::read(&target_file).expect("target remains"),
            vec![3u8; 11]
        );
        assert_eq!(directory_size(&link), 0);
    }

    #[test]
    fn received_transfer_location_rejects_path_like_transfer_ids() {
        let temp = tempfile::tempdir().expect("temp dir");
        let safe_path = received_transfer_location_path(temp.path(), "transfer-2026_07.04")
            .expect("safe transfer id");
        assert!(safe_path.starts_with(temp.path().join("received_files")));
        assert!(safe_path.ends_with("transfer-2026_07.04"));

        for transfer_id in [
            "../outside",
            "..\\outside",
            "C:outside",
            "child/file",
            ".",
            "..",
            " ",
        ] {
            assert!(
                received_transfer_location_path(temp.path(), transfer_id).is_err(),
                "{transfer_id} should be rejected"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_contact_metadata_update, attachments_require_transfer_authorization,
        group_broadcast_warning, normalized_conversation_id, prepare_retry_transfer_offers,
        read_receipt_batches, realtime_delivery_warning, transfer_status_allows_resume,
        ContactMetadataRequest, RealtimeDeliveryResult,
    };
    use crate::{
        discovery::{PeerProfile, PeerStatus},
        identity::{to_hex, DeviceIdentity},
        protocol::{ChatBody, ChatMessage, FileEntry, MessageAttachment, TransferManifest},
        AppState,
    };
    use sha2::{Digest, Sha256};
    use std::{
        collections::HashMap,
        ffi::OsString,
        sync::{Mutex, MutexGuard, OnceLock},
    };

    static APPDATA_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    struct AppDataGuard {
        previous: Option<OsString>,
        _lock: MutexGuard<'static, ()>,
    }

    impl AppDataGuard {
        fn set(path: &std::path::Path) -> Self {
            let lock = APPDATA_TEST_LOCK
                .get_or_init(|| Mutex::new(()))
                .lock()
                .expect("appdata test lock");
            let previous = std::env::var_os("APPDATA");
            std::env::set_var("APPDATA", path);
            Self {
                previous,
                _lock: lock,
            }
        }
    }

    impl Drop for AppDataGuard {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.take() {
                std::env::set_var("APPDATA", previous);
            } else {
                std::env::remove_var("APPDATA");
            }
        }
    }

    #[test]
    fn normalized_conversation_id_trims_wrapping_whitespace() {
        assert_eq!(
            normalized_conversation_id("  direct:peer-a  "),
            "direct:peer-a"
        );
        assert_eq!(
            normalized_conversation_id("\n group:team-alpha \t"),
            "group:team-alpha"
        );
    }

    #[test]
    fn normalized_conversation_id_trims_direct_peer_segments() {
        assert_eq!(
            normalized_conversation_id(" direct: peer-a : peer-b :  "),
            "direct:peer-a:peer-b"
        );
    }

    #[test]
    fn forwarded_attachment_authorization_is_required_only_for_transfer_attachments() {
        let non_transfer = MessageAttachment {
            kind: "link-preview".to_string(),
            manifest: TransferManifest::from_entries(
                "link-preview-placeholder".to_string(),
                vec![FileEntry::new("preview.txt".to_string(), 1, "a".repeat(64))],
                262_144,
            )
            .expect("placeholder manifest"),
        };
        let transfer = MessageAttachment::transfer(
            TransferManifest::from_entries(
                "forwarded-transfer".to_string(),
                vec![FileEntry::new("file.txt".to_string(), 1, "b".repeat(64))],
                262_144,
            )
            .expect("transfer manifest"),
        );

        assert!(!attachments_require_transfer_authorization(&[]));
        assert!(!attachments_require_transfer_authorization(&[non_transfer]));
        assert!(attachments_require_transfer_authorization(&[transfer]));
    }

    #[test]
    fn transfer_resume_is_allowed_only_for_failed_or_canceled_statuses() {
        for status in ["failed", "canceled", "cancelled", " Failed "] {
            assert!(
                transfer_status_allows_resume(status),
                "{status} should be resumable"
            );
        }

        for status in [
            "indexed",
            "downloading",
            "downloaded",
            "delivered",
            "queued",
        ] {
            assert!(
                !transfer_status_allows_resume(status),
                "{status} should not be resumable"
            );
        }
    }

    #[test]
    fn retry_transfer_offers_registers_files_and_restores_authorizations() {
        let temp = tempfile::tempdir().expect("tempdir");
        let _appdata = AppDataGuard::set(temp.path());
        let state = AppState::bootstrap().expect("state");
        let remote = DeviceIdentity::generate("Remote User".to_string(), "remote-pc".to_string());
        let remote_profile = PeerProfile::from_identity(&remote, PeerStatus::Online);
        let remote_id = remote_profile.peer_id.clone();
        let remote_public_key = remote_profile.public_key.clone();
        state.upsert_peer(remote_profile);

        let source = temp.path().join("retry.txt");
        std::fs::write(&source, b"retry file payload").expect("source");
        let manifest = TransferManifest::from_entries(
            "transfer-retry-offer".to_string(),
            vec![FileEntry::new(
                "retry.txt".to_string(),
                18,
                to_hex(&Sha256::digest(b"retry file payload")),
            )
            .with_source_path(source.to_string_lossy().to_string())],
            262_144,
        )
        .expect("manifest");
        let conversation_id = format!("direct:{}:{}", state.identity().peer_id(), remote_id);
        state
            .store()
            .upsert_transfer(&conversation_id, &manifest, "failed", 0)
            .expect("failed transfer saved");
        let mut body = ChatBody {
            message_id: "retry-transfer-message".to_string(),
            conversation_id: conversation_id.clone(),
            sender_id: state.identity().peer_id().to_string(),
            recipients: vec![remote_id.clone()],
            signature: Vec::new(),
            quote: None,
            attachments: vec![MessageAttachment::transfer(manifest.clone())],
            body: "retry files".to_string(),
            created_at: 1_725_000_000_000,
        };

        prepare_retry_transfer_offers(&mut body, &state).expect("retry transfer prepared");

        assert_eq!(state.transfer_registry().offer_count(), 1);
        assert_eq!(
            state
                .store()
                .transfer_status(&manifest.transfer_id)
                .expect("status"),
            Some("indexed".to_string())
        );
        let (_conversation_id, hydrated_manifest, authorizations) = state
            .store()
            .local_transfer_offer(&manifest.transfer_id)
            .expect("local transfer offer")
            .expect("offer exists");
        assert_eq!(
            hydrated_manifest.files[0].local_source_path(),
            source.to_string_lossy()
        );
        assert_eq!(authorizations.get(&remote_id), Some(&remote_public_key));
    }

    #[test]
    fn contact_metadata_block_removes_runtime_and_persisted_transfer_authorizations() {
        let temp = tempfile::tempdir().expect("tempdir");
        let _appdata = AppDataGuard::set(temp.path());
        let state = AppState::bootstrap().expect("state");
        let manifest = TransferManifest::from_entries(
            "transfer-block-command-auth".to_string(),
            vec![FileEntry::new("secret.txt".to_string(), 6, "a".repeat(64))
                .with_source_path(temp.path().join("secret.txt").to_string_lossy().to_string())],
            262_144,
        )
        .expect("manifest");
        let peer_id = "peer-blocked".to_string();
        let authorizations = HashMap::from([(peer_id.clone(), vec![1, 2, 3, 4])]);
        std::fs::write(temp.path().join("secret.txt"), b"secret").expect("source");
        state
            .store()
            .upsert_transfer("direct:peer-blocked", &manifest, "indexed", 0)
            .expect("transfer saved");
        state
            .store()
            .save_transfer_authorizations(&manifest.transfer_id, &authorizations)
            .expect("authorization saved");
        let baseline_offer_count = state.transfer_registry().offer_count();
        state
            .transfer_registry()
            .register_authorized(manifest.clone(), authorizations);
        assert_eq!(
            state.transfer_registry().offer_count(),
            baseline_offer_count + 1
        );

        let metadata = apply_contact_metadata_update(
            ContactMetadataRequest {
                peer_id: peer_id.clone(),
                remark: "Blocked user".to_string(),
                group_name: "Ops".to_string(),
                favorite: true,
                blocked: true,
            },
            &state,
        )
        .expect("metadata updated");

        assert!(metadata.blocked);
        assert_eq!(
            state.transfer_registry().offer_count(),
            baseline_offer_count
        );
        let (_conversation_id, _manifest, persisted_authorizations) = state
            .store()
            .local_transfer_offer("transfer-block-command-auth")
            .expect("offer loaded")
            .expect("transfer still exists");
        assert!(!persisted_authorizations.contains_key(&peer_id));
    }

    #[test]
    fn read_receipt_batches_include_every_message_without_oversized_frames() {
        let messages = (0..205)
            .map(|index| ChatMessage {
                id: format!("msg-{index:03}"),
                conversation_id: "direct:peer-a:local".to_string(),
                sender_id: "peer-a".to_string(),
                body: format!("message {index}"),
                attachments: Vec::new(),
                created_at: 1_700_000_000 + index,
                status: crate::protocol::MessageStatus::Received,
                recalled: false,
                quote: None,
                favorited: false,
                reactions: Vec::new(),
                send_attempts: 0,
                last_attempt_at: 0,
            })
            .collect::<Vec<_>>();

        let batches = read_receipt_batches(messages, 100);

        assert_eq!(batches.len(), 3);
        assert_eq!(batches[0].0, "direct:peer-a:local");
        assert_eq!(batches[0].1, "peer-a");
        assert_eq!(batches[0].2.len(), 100);
        assert_eq!(batches[1].2.len(), 100);
        assert_eq!(batches[2].2.len(), 5);
        assert_eq!(
            batches
                .iter()
                .flat_map(|(_, _, message_ids)| message_ids)
                .count(),
            205
        );
    }

    #[test]
    fn read_receipt_batches_keep_conversations_separate_for_same_sender() {
        let messages = ["direct:peer-a:local", "group:ops"]
            .into_iter()
            .enumerate()
            .map(|(index, conversation_id)| ChatMessage {
                id: format!("msg-{index}"),
                conversation_id: conversation_id.to_string(),
                sender_id: "peer-a".to_string(),
                body: format!("message {index}"),
                attachments: Vec::new(),
                created_at: 1_700_000_000 + index as i64,
                status: crate::protocol::MessageStatus::Received,
                recalled: false,
                quote: None,
                favorited: false,
                reactions: Vec::new(),
                send_attempts: 0,
                last_attempt_at: 0,
            })
            .collect::<Vec<_>>();

        let batches = read_receipt_batches(messages, 100);

        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].0, "direct:peer-a:local");
        assert_eq!(batches[0].1, "peer-a");
        assert_eq!(batches[0].2, vec!["msg-0".to_string()]);
        assert_eq!(batches[1].0, "group:ops");
        assert_eq!(batches[1].1, "peer-a");
        assert_eq!(batches[1].2, vec!["msg-1".to_string()]);
    }

    #[test]
    fn group_broadcast_warning_is_emitted_only_when_no_delivery_path_exists() {
        let failed = RealtimeDeliveryResult {
            udp_sent: false,
            quic_scheduled: false,
        };
        assert_eq!(
            group_broadcast_warning("group:ops", "Ops", failed).as_deref(),
            Some("群聊 Ops (group:ops) 已保存到本机，但未能通过 UDP 或 QUIC 广播给成员；请检查防火墙、网络发现或种子节点设置")
        );

        let udp_ok = RealtimeDeliveryResult {
            udp_sent: true,
            quic_scheduled: false,
        };
        assert!(group_broadcast_warning("group:ops", "Ops", udp_ok).is_none());

        let quic_ok = RealtimeDeliveryResult {
            udp_sent: false,
            quic_scheduled: true,
        };
        assert!(group_broadcast_warning("group:ops", "Ops", quic_ok).is_none());
    }

    #[test]
    fn realtime_delivery_warning_is_emitted_only_when_no_delivery_path_exists() {
        let failed = RealtimeDeliveryResult {
            udp_sent: false,
            quic_scheduled: false,
        };
        assert_eq!(
            realtime_delivery_warning("消息撤回", "msg-1", failed).as_deref(),
            Some("消息撤回 msg-1 已保存到本机，但未能通过 UDP 或 QUIC 同步给对端；请检查防火墙、网络发现或种子节点设置")
        );

        assert_eq!(
            realtime_delivery_warning("文件传输公告", "transfer-1", failed).as_deref(),
            Some("文件传输公告 transfer-1 已保存到本机，但未能通过 UDP 或 QUIC 同步给对端；请检查防火墙、网络发现或种子节点设置")
        );
        assert_eq!(
            realtime_delivery_warning("已读回执", "direct:peer-a（2 条）", failed).as_deref(),
            Some("已读回执 direct:peer-a（2 条） 已保存到本机，但未能通过 UDP 或 QUIC 同步给对端；请检查防火墙、网络发现或种子节点设置")
        );

        let delivered = RealtimeDeliveryResult {
            udp_sent: true,
            quic_scheduled: false,
        };
        assert!(realtime_delivery_warning("消息回应", "msg-1", delivered).is_none());
    }
}
