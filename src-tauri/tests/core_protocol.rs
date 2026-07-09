#[cfg(feature = "quic")]
use std::time::Duration;
use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::Path,
};

#[cfg(feature = "quic")]
use iim::transport::TransportConfig;
use iim::{
    commands::{render_conversation_export, storage_location_path},
    desktop::{tray_menu_action, window_close_action, TrayAction, WindowCloseAction},
    discovery::{
        ack_targets_message, beacon_reply_target, broadcast_beacon_with_settings,
        conversation_id_targets_sender_and_peer, discovery_targets, group_invite_signing_payload,
        message_reaction_signing_payload, message_revoke_signing_payload,
        normalize_network_settings, normalize_peer_endpoints, peer_is_stale,
        read_receipt_signing_payload, transfer_announcement_signing_payload,
        typing_signing_payload, validate_group_invite_members, validate_peer_profile_identity,
        verify_chat_signature_with_public_key, verify_known_peer_signature_with_public_key,
        DiscoveryPacket, NetworkSettings, PeerProfile, PeerStatus,
    },
    identity::{verify_signature, DeviceIdentity, TrustBook, TrustError},
    protocol::{
        AckFrame, ChatBody, ChatMessage, FileEntry, MessageAttachment, MessageQuote,
        MessageReaction, MessageStatus, ProtocolFrame, TransferManifest, DISCOVERY_PORT,
        PROTOCOL_VERSION, QUIC_PORT,
    },
    screen_capture::{screen_capture_launch_target, ScreenCaptureLaunchTarget},
    staging::{sanitize_staged_file_name, staged_clipboard_file_path},
    store::{AppPreferences, AppShortcuts, EncryptedStore},
    store_key::{key_material_to_sqlcipher_hex, load_or_create_store_key, store_key_path},
    transport::{OutboxDeliveryPolicy, QuicTransport},
};

#[test]
fn tray_menu_ids_map_to_window_actions() {
    assert_eq!(tray_menu_action("show"), Some(TrayAction::ShowMainWindow));
    assert_eq!(tray_menu_action("hide"), Some(TrayAction::HideToTray));
    assert_eq!(tray_menu_action("quit"), Some(TrayAction::Quit));
    assert_eq!(tray_menu_action("unknown"), None);
}

#[test]
fn close_button_behavior_follows_app_preferences() {
    assert_eq!(
        window_close_action(&AppPreferences::default()),
        WindowCloseAction::HideToTray
    );
    assert_eq!(
        window_close_action(&AppPreferences {
            close_to_tray: false,
            ..AppPreferences::default()
        }),
        WindowCloseAction::CloseWindow
    );
}

#[test]
fn windows_screen_capture_uses_system_snipping_uri() {
    assert_eq!(
        screen_capture_launch_target("windows"),
        Some(ScreenCaptureLaunchTarget {
            program: "cmd",
            args: vec!["/C", "start", "", "ms-screenclip:"],
        })
    );
    assert_eq!(screen_capture_launch_target("linux"), None);
}

#[test]
fn transport_defaults_match_lan_reliability_budget() {
    let transport = QuicTransport::default();
    let config = transport.config();

    assert_eq!(config.listen_port, QUIC_PORT);
    assert_eq!(config.heartbeat_secs, 15);
    assert_eq!(config.max_idle_timeout_secs, 60);
    assert_eq!(config.outbox.retry_after_millis(), 10_000);
    assert_eq!(config.outbox.max_attempts(), 12);
    assert_eq!(config.outbox.batch_limit(), 50);
}

#[test]
fn outbox_delivery_policy_normalizes_zero_values() {
    let policy = OutboxDeliveryPolicy::new(-1, 0, 0);

    assert_eq!(policy.retry_after_millis(), 0);
    assert_eq!(policy.max_attempts(), 1);
    assert_eq!(policy.batch_limit(), 1);
}

#[test]
fn outbox_retry_selection_uses_transport_policy() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let policy = OutboxDeliveryPolicy::new(0, 2, 10);
    let message = ChatBody {
        message_id: "transport-retry-1".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "retry over transport policy".to_string(),
        created_at: 1_700_000_160,
    };

    store.enqueue_outbox(&message).expect("message queued");
    assert_eq!(
        store
            .list_retryable_outbox(
                policy.batch_limit(),
                policy.retry_after_millis(),
                policy.max_attempts()
            )
            .expect("retryable listed")
            .len(),
        1
    );

    store.mark_sending(&message.message_id).expect("attempt 1");
    store.mark_sending(&message.message_id).expect("attempt 2");
    assert!(store
        .list_retryable_outbox(
            policy.batch_limit(),
            policy.retry_after_millis(),
            policy.max_attempts()
        )
        .expect("retryable after exhausted attempts")
        .is_empty());
    assert_eq!(
        store
            .fail_exhausted_outbox(policy.max_attempts())
            .expect("exhausted messages failed")[0]
            .status,
        MessageStatus::Failed
    );
}

#[cfg(feature = "quic")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn quic_transport_exchanges_protocol_frames_over_loopback() {
    let config = TransportConfig {
        listen_port: 0,
        ..TransportConfig::default()
    };
    let server = QuicTransport::bind(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0),
        config.clone(),
    )
    .expect("server transport binds");
    let client = QuicTransport::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0), config)
        .expect("client transport binds");
    let frame = ProtocolFrame::Chat(ChatBody {
        message_id: "quic-msg-1".to_string(),
        conversation_id: "direct:client:server".to_string(),
        sender_id: "client".to_string(),
        recipients: vec!["server".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "hello over quic".to_string(),
        created_at: 1_700_000_170,
    });

    let exchange = async {
        tokio::try_join!(
            server.accept_frame(64 * 1024),
            client.send_frame(server.local_addr()?, "localhost", &frame)
        )
    };
    let (received, _) = tokio::time::timeout(Duration::from_secs(5), exchange)
        .await
        .expect("quic exchange does not time out")
        .expect("quic frame exchange succeeds");

    assert_eq!(received.frame, frame);
    assert!(received.endpoint.address.contains("127.0.0.1"));
}

#[test]
fn clipboard_staging_sanitizes_names_inside_app_dir() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = staged_clipboard_file_path(dir.path(), "transfer-1", r"..\..\secret:shot.png")
        .expect("staged path");

    assert!(path.starts_with(dir.path()));
    assert!(path.parent().expect("parent").ends_with("transfer-1"));
    assert_eq!(path.file_name().unwrap(), "secret_shot.png");
    assert_eq!(sanitize_staged_file_name("..//"), "clipboard.bin");
    assert_eq!(sanitize_staged_file_name("CON.txt"), "_CON.txt");
    assert_eq!(
        sanitize_staged_file_name("?clipboard<shot>.png"),
        "_clipboard_shot_.png"
    );
}

#[test]
fn storage_location_mapping_rejects_unknown_kinds() {
    assert!(storage_location_path("data")
        .expect("data path")
        .ends_with("IIM"));
    assert!(storage_location_path("received")
        .expect("received path")
        .ends_with("received_files"));
    assert!(storage_location_path("staged")
        .expect("staged path")
        .ends_with("staged"));
    assert!(storage_location_path("../outside").is_none());
}

#[test]
fn conversation_export_renders_messages_attachments_and_reactions() {
    let manifest = TransferManifest::from_entries(
        "export-transfer".to_string(),
        vec![FileEntry::new("report.pdf".to_string(), 42, "a".repeat(64))],
        262_144,
    )
    .expect("manifest builds");
    let manifest_sha = manifest.sha256.clone();
    let message = ChatMessage {
        id: "export-message".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        body: "export body".to_string(),
        attachments: vec![MessageAttachment::transfer(manifest)],
        created_at: 1_700_000_000_000,
        status: MessageStatus::Delivered,
        recalled: false,
        quote: Some(MessageQuote {
            message_id: "quoted".to_string(),
            sender_id: "b".to_string(),
            body_preview: "quoted body".to_string(),
        }),
        favorited: true,
        reactions: vec![MessageReaction {
            sender_id: "b".to_string(),
            reaction: "ok".to_string(),
        }],
        send_attempts: 3,
        last_attempt_at: 1_700_000_010_000,
    };

    let rendered = render_conversation_export(None, "direct:a:b", &[message]);
    assert!(rendered.contains("# direct:a:b"));
    assert!(rendered.contains("已送达"));
    assert!(rendered.contains("消息 ID：`export-message`"));
    assert!(rendered.contains("发送尝试：3 次"));
    assert!(rendered.contains("最后尝试：2023-11-14T22:13:30+00:00"));
    assert!(rendered.contains("export body"));
    assert!(rendered.contains("quoted"));
    assert!(rendered.contains("report.pdf"));
    assert!(rendered.contains("export-transfer"));
    assert!(rendered.contains("分片 262144 bytes"));
    assert!(rendered.contains(&manifest_sha));
    assert!(rendered.contains("ok b"));
    assert!(rendered.contains("已收藏"));
}

#[test]
fn protected_store_key_is_random_hex_and_persistent() {
    let dir = tempfile::tempdir().expect("tempdir");
    let first = load_or_create_store_key(dir.path()).expect("first key");
    let second = load_or_create_store_key(dir.path()).expect("second key");

    assert_eq!(first, second);
    assert_eq!(first.len(), 64);
    assert!(first.chars().all(|value| value.is_ascii_hexdigit()));
    assert_ne!(first, "iim-local-key");
    assert!(store_key_path(dir.path()).exists());
    assert_eq!(
        store_key_path(dir.path()).file_name().unwrap(),
        "db.key.dpapi"
    );
}

#[test]
fn sqlcipher_key_material_requires_32_bytes() {
    let key = key_material_to_sqlcipher_hex(&[7u8; 32]).expect("valid key");
    assert_eq!(key.len(), 64);
    assert!(key_material_to_sqlcipher_hex(&[7u8; 31]).is_err());
}

#[test]
fn network_settings_expand_seed_and_scan_targets() {
    let settings = NetworkSettings {
        auto_discovery: true,
        multicast: false,
        seed_peers: vec!["192.168.1.20:24251".to_string(), "192.168.1.21".to_string()],
        scan_ranges: vec!["192.168.1.4/30".to_string()],
        discovery_interval_secs: 3,
        peer_ttl_secs: 15,
    };

    let targets = discovery_targets(&settings);
    let rendered: Vec<String> = targets.iter().map(|target| target.to_string()).collect();

    assert!(rendered.contains(&format!("192.168.1.20:{DISCOVERY_PORT}")));
    assert!(rendered.contains(&format!("192.168.1.21:{DISCOVERY_PORT}")));
    assert!(rendered.contains(&format!("192.168.1.5:{DISCOVERY_PORT}")));
    assert!(rendered.contains(&format!("192.168.1.6:{DISCOVERY_PORT}")));
    assert!(!rendered.contains(&format!("255.255.255.255:{DISCOVERY_PORT}")));
}

#[test]
fn network_settings_multicast_includes_broadcast_and_group_target() {
    let settings = NetworkSettings {
        auto_discovery: true,
        multicast: true,
        seed_peers: Vec::new(),
        scan_ranges: Vec::new(),
        discovery_interval_secs: 3,
        peer_ttl_secs: 15,
    };

    let targets = discovery_targets(&settings);
    let rendered: Vec<String> = targets.iter().map(|target| target.to_string()).collect();

    assert!(rendered.contains(&format!("255.255.255.255:{DISCOVERY_PORT}")));
    assert!(rendered.contains(&format!("239.242.50.1:{DISCOVERY_PORT}")));
}

#[test]
fn network_settings_normalization_deduplicates_and_rejects_invalid_ranges() {
    let settings = normalize_network_settings(NetworkSettings {
        auto_discovery: true,
        multicast: true,
        seed_peers: vec![
            " 192.168.1.20:24251 ".to_string(),
            "192.168.1.20".to_string(),
            "not-an-ip".to_string(),
        ],
        scan_ranges: vec![
            "192.168.2.0/24".to_string(),
            "192.168.2.0/24".to_string(),
            "10.0.0.0/16".to_string(),
            "bad-range".to_string(),
            "192.168.3.44".to_string(),
        ],
        discovery_interval_secs: 3,
        peer_ttl_secs: 15,
    });

    assert_eq!(settings.seed_peers, vec!["192.168.1.20"]);
    assert_eq!(
        settings.scan_ranges,
        vec!["192.168.2.0/24".to_string(), "192.168.3.44".to_string()]
    );
}

#[test]
fn network_settings_accepts_only_private_unicast_configured_targets() {
    let settings = normalize_network_settings(NetworkSettings {
        auto_discovery: true,
        multicast: true,
        seed_peers: vec![
            "10.12.0.5:24251".to_string(),
            "172.16.5.10".to_string(),
            "192.168.1.20".to_string(),
            "8.8.8.8".to_string(),
            "127.0.0.1".to_string(),
            "0.0.0.0".to_string(),
            "224.0.0.1".to_string(),
            "255.255.255.255".to_string(),
        ],
        scan_ranges: vec![
            "10.8.9.44/24".to_string(),
            "172.20.1.5/30".to_string(),
            "192.168.3.44".to_string(),
            "8.8.8.0/30".to_string(),
            "127.0.0.0/30".to_string(),
            "224.0.0.0/30".to_string(),
        ],
        discovery_interval_secs: 3,
        peer_ttl_secs: 15,
    });

    assert_eq!(
        settings.seed_peers,
        vec!["10.12.0.5", "172.16.5.10", "192.168.1.20"]
    );
    assert_eq!(
        settings.scan_ranges,
        vec![
            "10.8.9.0/24".to_string(),
            "172.20.1.4/30".to_string(),
            "192.168.3.44".to_string(),
        ]
    );
}

#[test]
fn discovery_replies_to_first_unicast_beacon_without_reply_storms() {
    let source = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)), DISCOVERY_PORT);

    assert_eq!(
        beacon_reply_target(source, false).map(|target| target.to_string()),
        Some(format!("192.168.1.20:{DISCOVERY_PORT}"))
    );
    assert!(beacon_reply_target(source, true).is_none());
    assert!(beacon_reply_target("[fe80::1]:24250".parse().expect("ipv6 source"), false).is_none());
}

#[test]
fn peer_presence_stale_boundary_is_strictly_after_ttl() {
    assert!(!peer_is_stale(1_000, 1_000, 15_000));
    assert!(!peer_is_stale(16_000, 1_000, 15_000));
    assert!(peer_is_stale(16_001, 1_000, 15_000));
}

#[test]
fn discovery_normalizes_unspecified_peer_endpoints_from_source_ip() {
    let mut profile = PeerProfile {
        peer_id: "peer-a".to_string(),
        display_name: "Alice".to_string(),
        hostname: "alice-pc".to_string(),
        avatar_hash: None,
        status: PeerStatus::Online,
        endpoints: vec!["0.0.0.0:24251".to_string()],
        fingerprint: "a".repeat(64),
        public_key: Vec::new(),
    };

    let normalized = normalize_peer_endpoints(
        profile.clone(),
        "192.168.1.25:24250".parse().expect("source addr"),
    );
    assert_eq!(normalized.endpoints, vec!["192.168.1.25:24251"]);

    profile.endpoints = vec!["10.0.0.8:24251".to_string()];
    let preserved =
        normalize_peer_endpoints(profile, "192.168.1.25:24250".parse().expect("source addr"));
    assert_eq!(preserved.endpoints, vec!["10.0.0.8:24251"]);
}

#[test]
fn peer_profile_identity_requires_public_key_peer_id_and_fingerprint_to_match() {
    let identity = DeviceIdentity::generate("Alice".to_string(), "alice-pc".to_string());
    let profile = PeerProfile::from_identity(&identity, PeerStatus::Online);

    validate_peer_profile_identity(&profile).expect("valid identity profile");

    let mut forged_peer_id = profile.clone();
    forged_peer_id.peer_id = "forged-peer-id".to_string();
    assert!(validate_peer_profile_identity(&forged_peer_id)
        .expect_err("forged peer id rejected")
        .contains("peer id"));

    let mut forged_fingerprint = profile.clone();
    forged_fingerprint.fingerprint = "b".repeat(64);
    assert!(validate_peer_profile_identity(&forged_fingerprint)
        .expect_err("forged fingerprint rejected")
        .contains("fingerprint"));

    let mut missing_key = profile.clone();
    missing_key.public_key.clear();
    assert!(validate_peer_profile_identity(&missing_key)
        .expect_err("missing public key rejected")
        .contains("public key"));

    let mut invalid_key = profile;
    invalid_key.public_key = vec![1, 2, 3];
    assert!(validate_peer_profile_identity(&invalid_key)
        .expect_err("invalid public key rejected")
        .contains("public key"));
}

#[test]
fn discovery_packet_round_trips_beacon_and_chat() {
    let identity = DeviceIdentity::generate("广播测试".to_string(), "test-host".to_string());
    let profile = PeerProfile::from_identity(&identity, PeerStatus::Online);
    let chat = ChatBody {
        message_id: identity.next_message_id(),
        conversation_id: "direct:broadcast".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: vec!["receiver-peer".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: vec![MessageAttachment::transfer(
            TransferManifest::from_entries(
                "chat-attachment".to_string(),
                vec![FileEntry::new("report.pdf".to_string(), 42, "d".repeat(64))],
                262_144,
            )
            .expect("attachment manifest builds"),
        )],

        body: "同网段广播消息".to_string(),
        created_at: 1_700_000_300,
    };

    let beacon = DiscoveryPacket::Beacon { profile };
    let decoded_beacon =
        DiscoveryPacket::decode(&beacon.encode().expect("beacon encodes")).expect("beacon decodes");
    assert_eq!(decoded_beacon.kind(), "beacon");

    let chat_packet = DiscoveryPacket::Chat { message: chat };
    let decoded_chat = DiscoveryPacket::decode(&chat_packet.encode().expect("chat encodes"))
        .expect("chat decodes");
    assert_eq!(decoded_chat.kind(), "chat");

    let ack_packet = DiscoveryPacket::Ack {
        ack: AckFrame {
            message_id: "ack-me".to_string(),
            conversation_id: "direct:broadcast".to_string(),
            sender_id: "receiver-peer".to_string(),
            signature: Vec::new(),
            received_at: 1_700_000_301,
        },
    };
    let decoded_ack =
        DiscoveryPacket::decode(&ack_packet.encode().expect("ack encodes")).expect("ack decodes");
    assert_eq!(decoded_ack.kind(), "ack");

    let typing_recipients = vec!["receiver-peer".to_string()];
    let typing_signature = identity.sign(&typing_signing_payload(
        "direct:broadcast",
        identity.peer_id(),
        &typing_recipients,
        true,
        1_700_000_302,
    ));
    assert!(verify_signature(
        &identity.public_identity().public_key,
        &typing_signing_payload(
            "direct:broadcast",
            identity.peer_id(),
            &typing_recipients,
            true,
            1_700_000_302
        ),
        &typing_signature
    ));
    let typing_packet = DiscoveryPacket::Typing {
        conversation_id: "direct:broadcast".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: typing_recipients,
        active: true,
        updated_at: 1_700_000_302,
        signature: typing_signature,
    };
    let decoded_typing = DiscoveryPacket::decode(&typing_packet.encode().expect("typing encodes"))
        .expect("typing decodes");
    assert_eq!(decoded_typing.kind(), "typing");

    let receipt_recipients = vec![identity.peer_id().to_string()];
    let receipt_ids = vec!["message-read-1".to_string()];
    let receipt_signature = identity.sign(&read_receipt_signing_payload(
        "direct:broadcast",
        "receiver-peer",
        &receipt_recipients,
        &receipt_ids,
        1_700_000_303,
    ));
    let read_receipt = DiscoveryPacket::ReadReceipt {
        conversation_id: "direct:broadcast".to_string(),
        sender_id: "receiver-peer".to_string(),
        recipients: receipt_recipients,
        message_ids: receipt_ids,
        read_at: 1_700_000_303,
        signature: receipt_signature,
    };
    let decoded_receipt =
        DiscoveryPacket::decode(&read_receipt.encode().expect("read receipt encodes"))
            .expect("read receipt decodes");
    assert_eq!(decoded_receipt.kind(), "read_receipt");

    let revoke_recipients = vec!["receiver-peer".to_string()];
    let revoke_signature = identity.sign(&message_revoke_signing_payload(
        "direct:broadcast",
        "message-revoke-1",
        identity.peer_id(),
        &revoke_recipients,
        1_700_000_304,
    ));
    assert!(verify_signature(
        &identity.public_identity().public_key,
        &message_revoke_signing_payload(
            "direct:broadcast",
            "message-revoke-1",
            identity.peer_id(),
            &revoke_recipients,
            1_700_000_304
        ),
        &revoke_signature
    ));
    let revoke_packet = DiscoveryPacket::MessageRevoke {
        conversation_id: "direct:broadcast".to_string(),
        message_id: "message-revoke-1".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: revoke_recipients,
        revoked_at: 1_700_000_304,
        signature: revoke_signature,
    };
    let decoded_revoke =
        DiscoveryPacket::decode(&revoke_packet.encode().expect("message revoke encodes"))
            .expect("message revoke decodes");
    assert_eq!(decoded_revoke.kind(), "message_revoke");

    let reaction_recipients = vec!["receiver-peer".to_string()];
    let reaction_signature = identity.sign(&message_reaction_signing_payload(
        "direct:broadcast",
        "message-react-1",
        identity.peer_id(),
        &reaction_recipients,
        "ok",
        true,
        1_700_000_305,
    ));
    assert!(verify_signature(
        &identity.public_identity().public_key,
        &message_reaction_signing_payload(
            "direct:broadcast",
            "message-react-1",
            identity.peer_id(),
            &reaction_recipients,
            "ok",
            true,
            1_700_000_305
        ),
        &reaction_signature
    ));
    let reaction_packet = DiscoveryPacket::MessageReaction {
        conversation_id: "direct:broadcast".to_string(),
        message_id: "message-react-1".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: reaction_recipients,
        reaction: "ok".to_string(),
        active: true,
        reacted_at: 1_700_000_305,
        signature: reaction_signature,
    };
    let decoded_reaction =
        DiscoveryPacket::decode(&reaction_packet.encode().expect("message reaction encodes"))
            .expect("message reaction decodes");
    assert_eq!(decoded_reaction.kind(), "message_reaction");

    assert!(validate_group_invite_members(
        "receiver-peer",
        identity.peer_id(),
        &["receiver-peer".to_string()],
        &[identity.peer_id().to_string(), "receiver-peer".to_string()]
    )
    .is_ok());
    assert!(validate_group_invite_members(
        "receiver-peer",
        identity.peer_id(),
        &["receiver-peer".to_string()],
        &[identity.peer_id().to_string()]
    )
    .expect_err("invite without local member is rejected")
    .contains("local peer"));
    assert!(validate_group_invite_members(
        "receiver-peer",
        identity.peer_id(),
        &["receiver-peer".to_string()],
        &["receiver-peer".to_string()]
    )
    .expect_err("invite without sender member is rejected")
    .contains("sender"));

    let invite_recipients = vec!["receiver-peer".to_string()];
    let invite_members = vec![identity.peer_id().to_string(), "receiver-peer".to_string()];
    let invite_announcement = "Release window at 15:00";
    let invite_signature = identity.sign(&group_invite_signing_payload(
        "group:ops",
        "Ops Room",
        invite_announcement,
        identity.peer_id(),
        &invite_recipients,
        &invite_members,
    ));
    assert!(verify_signature(
        &identity.public_identity().public_key,
        &group_invite_signing_payload(
            "group:ops",
            "Ops Room",
            invite_announcement,
            identity.peer_id(),
            &invite_recipients,
            &invite_members
        ),
        &invite_signature
    ));
    let group_invite = DiscoveryPacket::GroupInvite {
        conversation_id: "group:ops".to_string(),
        name: "Ops Room".to_string(),
        announcement: invite_announcement.to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: invite_recipients,
        member_peer_ids: invite_members,
        signature: invite_signature,
    };
    let decoded_invite = DiscoveryPacket::decode(
        &group_invite
            .encode()
            .expect("group invite manifest encodes"),
    )
    .expect("group invite decodes");
    assert_eq!(decoded_invite.kind(), "group_invite");

    let manifest = TransferManifest::from_entries(
        "transfer-broadcast".to_string(),
        vec![FileEntry::new("demo.txt".to_string(), 12, "c".repeat(64))],
        262_144,
    )
    .expect("manifest builds");
    let transfer_recipients = vec!["receiver".to_string()];
    let transfer_signature = identity.sign(&transfer_announcement_signing_payload(
        "direct:broadcast",
        identity.peer_id(),
        &transfer_recipients,
        &manifest,
    ));
    assert!(verify_signature(
        &identity.public_identity().public_key,
        &transfer_announcement_signing_payload(
            "direct:broadcast",
            identity.peer_id(),
            &transfer_recipients,
            &manifest
        ),
        &transfer_signature
    ));
    let transfer_packet = DiscoveryPacket::Transfer {
        conversation_id: "direct:broadcast".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: transfer_recipients,
        signature: transfer_signature,
        manifest,
    };
    let decoded_transfer =
        DiscoveryPacket::decode(&transfer_packet.encode().expect("transfer manifest encodes"))
            .expect("transfer manifest decodes");
    assert_eq!(decoded_transfer.kind(), "transfer");
}

#[test]
fn beacon_broadcast_uses_network_settings_targets() {
    let identity = DeviceIdentity::generate("Beacon".to_string(), "beacon-pc".to_string());
    let profile = PeerProfile::from_identity(&identity, PeerStatus::Away);
    let settings = NetworkSettings {
        auto_discovery: true,
        multicast: false,
        seed_peers: Vec::new(),
        scan_ranges: Vec::new(),
        ..NetworkSettings::default()
    };

    let error = broadcast_beacon_with_settings(&profile, &settings)
        .expect_err("beacon broadcast without targets should fail clearly");

    assert!(error
        .to_string()
        .contains("no discovery targets configured"));
}

#[test]
fn identity_persists_to_disk_with_same_peer_id() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("identity.json");

    let first = DeviceIdentity::load_or_create(&path, "研发一号".to_string(), "rd-pc".to_string())
        .expect("first identity");
    let second = DeviceIdentity::load_or_create(&path, "研发一号".to_string(), "rd-pc".to_string())
        .expect("second identity");

    assert!(Path::new(&path).exists());
    assert_eq!(first.peer_id(), second.peer_id());
    assert_eq!(first.fingerprint(), second.fingerprint());
    if cfg!(windows) {
        let bytes = std::fs::read(&path).expect("identity bytes");
        assert!(serde_json::from_slice::<serde_json::Value>(&bytes).is_err());
    }
}

#[test]
fn identity_migrates_plain_json_file_to_protected_storage() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("identity.json");
    let legacy = serde_json::json!({
        "display_name": "Legacy User",
        "hostname": "legacy-pc",
        "signing_key": vec![11u8; 32],
    });
    std::fs::write(&path, serde_json::to_vec(&legacy).expect("legacy json")).expect("write legacy");

    let first = DeviceIdentity::load_or_create(&path, "ignored".to_string(), "ignored".to_string())
        .expect("legacy identity");
    let second =
        DeviceIdentity::load_or_create(&path, "ignored".to_string(), "ignored".to_string())
            .expect("migrated identity");

    assert_eq!(first.peer_id(), second.peer_id());
    assert_eq!(second.display_name(), "Legacy User");
    if cfg!(windows) {
        let bytes = std::fs::read(&path).expect("identity bytes");
        assert!(serde_json::from_slice::<serde_json::Value>(&bytes).is_err());
    }
}

#[test]
fn identity_profile_updates_persist_without_rotating_key() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("identity.json");

    let identity =
        DeviceIdentity::load_or_create(&path, "Alice".to_string(), "alice-old".to_string())
            .expect("identity");
    let original_peer_id = identity.peer_id().to_string();
    let original_fingerprint = identity.fingerprint().to_string();

    identity
        .persist_public_profile(&path, "Alice Ops", "alice-new")
        .expect("profile persisted");

    let reloaded =
        DeviceIdentity::load_or_create(&path, "ignored".to_string(), "ignored".to_string())
            .expect("reloaded identity");
    assert_eq!(reloaded.peer_id(), original_peer_id);
    assert_eq!(reloaded.fingerprint(), original_fingerprint);
    assert_eq!(reloaded.display_name(), "Alice Ops");
    assert_eq!(reloaded.hostname(), "alice-new");
}

#[test]
fn protocol_round_trips_chat_and_ack_frames() {
    let chat = ProtocolFrame::Chat(ChatBody {
        message_id: "peer-1-42-1700000000".to_string(),
        conversation_id: "direct:peer-1:peer-2".to_string(),
        sender_id: "peer-1".to_string(),
        recipients: vec!["peer-2".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: vec![MessageAttachment::transfer(
            TransferManifest::from_entries(
                "protocol-attachment".to_string(),
                vec![FileEntry::new("report.pdf".to_string(), 42, "d".repeat(64))],
                262_144,
            )
            .expect("attachment manifest builds"),
        )],

        body: "hello over lan".to_string(),
        created_at: 1_700_000_000,
    });

    let encoded = chat.encode().expect("chat frame encodes");
    let decoded = ProtocolFrame::decode(&encoded).expect("chat frame decodes");
    assert_eq!(decoded, chat);
    if let ProtocolFrame::Chat(decoded_chat) = decoded {
        assert!(decoded_chat.targets_peer("peer-2"));
        assert!(!decoded_chat.targets_peer("peer-3"));
        assert_eq!(decoded_chat.attachments.len(), 1);
        assert_eq!(
            decoded_chat.attachments[0].manifest.files[0].path,
            "report.pdf"
        );
    }

    let ack = ProtocolFrame::Ack(AckFrame {
        message_id: "peer-1-42-1700000000".to_string(),
        conversation_id: "direct:peer-1:peer-2".to_string(),
        sender_id: "peer-2".to_string(),
        signature: Vec::new(),
        received_at: 1_700_000_001,
    });
    let decoded_ack = ProtocolFrame::decode(&ack.encode().unwrap()).unwrap();
    assert_eq!(decoded_ack.version(), PROTOCOL_VERSION);
    assert_eq!(decoded_ack, ack);
}

#[test]
fn chat_body_signature_verifies_sender_identity() {
    let identity = DeviceIdentity::generate("Signer".to_string(), "signer-pc".to_string());
    let other = DeviceIdentity::generate("Other".to_string(), "other-pc".to_string());
    let mut chat = ChatBody {
        message_id: identity.next_message_id(),
        conversation_id: "direct:signer:receiver".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: vec!["receiver".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: vec![MessageAttachment::transfer(
            TransferManifest::from_entries(
                "stored-attachment".to_string(),
                vec![FileEntry::new(
                    "archive.zip".to_string(),
                    1024,
                    "e".repeat(64),
                )],
                262_144,
            )
            .expect("stored attachment manifest builds"),
        )],

        body: "signed hello".to_string(),
        created_at: 1_700_000_010,
    };
    chat.signature = identity.sign(&chat.signing_payload());

    assert!(verify_signature(
        &identity.public_identity().public_key,
        &chat.signing_payload(),
        &chat.signature
    ));
    assert!(!verify_signature(
        &other.public_identity().public_key,
        &chat.signing_payload(),
        &chat.signature
    ));

    let mut tampered = chat.clone();
    tampered.body = "tampered".to_string();
    assert!(!verify_signature(
        &identity.public_identity().public_key,
        &tampered.signing_payload(),
        &chat.signature
    ));
}

#[test]
fn chat_signature_verification_requires_known_sender_public_key() {
    let identity = DeviceIdentity::generate("Alice".to_string(), "alice-pc".to_string());
    let mut chat = ChatBody {
        message_id: "msg-known-key".to_string(),
        conversation_id: "direct:alice:bob".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: vec!["bob".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "signed message".to_string(),
        created_at: 1_700_000_011,
    };
    chat.signature = identity.sign(&chat.signing_payload());

    assert!(!verify_chat_signature_with_public_key(&chat, None));
    assert!(!verify_chat_signature_with_public_key(&chat, Some(&[])));
    assert!(verify_chat_signature_with_public_key(
        &chat,
        Some(&identity.public_identity().public_key)
    ));

    let mut unsigned = chat.clone();
    unsigned.signature.clear();
    assert!(!verify_chat_signature_with_public_key(
        &unsigned,
        Some(&identity.public_identity().public_key)
    ));

    let mut tampered = chat.clone();
    tampered.body = "tampered message".to_string();
    assert!(!verify_chat_signature_with_public_key(
        &tampered,
        Some(&identity.public_identity().public_key)
    ));
}

#[test]
fn signed_control_frame_verification_requires_known_public_key() {
    let identity = DeviceIdentity::generate("Alice".to_string(), "alice-pc".to_string());
    let payload = typing_signing_payload(
        "direct:alice:bob",
        identity.peer_id(),
        &["bob".to_string()],
        true,
        1_700_000_012,
    );
    let signature = identity.sign(&payload);

    assert!(!verify_known_peer_signature_with_public_key(
        &payload, &signature, None
    ));
    assert!(!verify_known_peer_signature_with_public_key(
        &payload,
        &signature,
        Some(&[])
    ));
    assert!(verify_known_peer_signature_with_public_key(
        &payload,
        &signature,
        Some(&identity.public_identity().public_key)
    ));
    assert!(!verify_known_peer_signature_with_public_key(
        &payload,
        &[],
        Some(&identity.public_identity().public_key)
    ));
    assert!(!verify_known_peer_signature_with_public_key(
        b"tampered",
        &signature,
        Some(&identity.public_identity().public_key)
    ));
}

#[test]
fn ack_frame_signature_verifies_ack_sender_identity() {
    let receiver = DeviceIdentity::generate("Receiver".to_string(), "receiver-pc".to_string());
    let other = DeviceIdentity::generate("Other".to_string(), "other-pc".to_string());
    let mut ack = AckFrame {
        message_id: "msg-1".to_string(),
        conversation_id: "direct:sender:receiver".to_string(),
        sender_id: receiver.peer_id().to_string(),
        signature: Vec::new(),
        received_at: 1_700_000_020,
    };
    ack.signature = receiver.sign(&ack.signing_payload());

    assert!(verify_signature(
        &receiver.public_identity().public_key,
        &ack.signing_payload(),
        &ack.signature
    ));
    assert!(!verify_signature(
        &other.public_identity().public_key,
        &ack.signing_payload(),
        &ack.signature
    ));

    let mut tampered = ack.clone();
    tampered.message_id = "msg-2".to_string();
    assert!(!verify_signature(
        &receiver.public_identity().public_key,
        &tampered.signing_payload(),
        &ack.signature
    ));
}

#[test]
fn ack_frame_must_target_original_message_conversation_and_recipient() {
    let message = ChatBody {
        message_id: "ack-target-1".to_string(),
        conversation_id: "group:ack-target".to_string(),
        sender_id: "local".to_string(),
        recipients: vec!["peer-a".to_string(), "peer-b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "bind the ack".to_string(),
        created_at: 1_700_000_023,
    };
    let ack = AckFrame {
        message_id: message.message_id.clone(),
        conversation_id: message.conversation_id.clone(),
        sender_id: "peer-a".to_string(),
        signature: vec![1, 2, 3],
        received_at: 1_700_000_024,
    };

    assert!(ack_targets_message(&ack, &message));

    let mut wrong_conversation = ack.clone();
    wrong_conversation.conversation_id = "group:other".to_string();
    assert!(!ack_targets_message(&wrong_conversation, &message));

    let mut wrong_message = ack.clone();
    wrong_message.message_id = "ack-target-2".to_string();
    assert!(!ack_targets_message(&wrong_message, &message));

    let mut non_recipient = ack;
    non_recipient.sender_id = "peer-c".to_string();
    assert!(!ack_targets_message(&non_recipient, &message));
}

#[test]
fn conversation_id_must_bind_direct_sender_and_local_peer() {
    assert!(conversation_id_targets_sender_and_peer(
        "direct:local:peer-a",
        "local",
        "peer-a"
    ));
    assert!(conversation_id_targets_sender_and_peer(
        "direct:peer-a:local",
        "local",
        "peer-a"
    ));
    assert!(conversation_id_targets_sender_and_peer(
        "direct:local",
        "local",
        "peer-a"
    ));
    assert!(!conversation_id_targets_sender_and_peer(
        "direct:peer-a",
        "local",
        "peer-a"
    ));
    assert!(!conversation_id_targets_sender_and_peer(
        "direct:local:peer-b",
        "local",
        "peer-a"
    ));
    assert!(!conversation_id_targets_sender_and_peer(
        "direct:local:peer-a:peer-b",
        "local",
        "peer-a"
    ));
    assert!(conversation_id_targets_sender_and_peer(
        "group:ops",
        "local",
        "peer-a"
    ));
    assert!(!conversation_id_targets_sender_and_peer(
        "unknown:ops",
        "local",
        "peer-a"
    ));
}

#[test]
fn tofu_trusts_first_fingerprint_and_rejects_key_rotation() {
    let first = DeviceIdentity::generate("Alice".to_string(), "alice-pc".to_string());
    let rotated = DeviceIdentity::generate("Alice".to_string(), "alice-pc".to_string());
    let mut trust = TrustBook::default();

    let first_result = trust.verify_or_trust(first.peer_id(), first.fingerprint());
    assert_eq!(first_result, Ok(()));

    let second_result = trust.verify_or_trust(first.peer_id(), first.fingerprint());
    assert_eq!(second_result, Ok(()));

    let rotated_result = trust.verify_or_trust(first.peer_id(), rotated.fingerprint());
    assert!(matches!(
        rotated_result,
        Err(TrustError::FingerprintChanged { .. })
    ));
}

#[test]
fn tofu_rejects_empty_peer_id_or_fingerprint() {
    let mut trust = TrustBook::default();

    assert!(matches!(
        trust.verify_or_trust("", "a".repeat(64)),
        Err(TrustError::InvalidIdentity)
    ));
    assert!(matches!(
        trust.verify_or_trust("peer-a", "   "),
        Err(TrustError::InvalidIdentity)
    ));
}

#[test]
fn encrypted_store_tofu_rejects_persisted_fingerprint_replacement() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");

    store
        .trust_peer("peer-a", &"a".repeat(64))
        .expect("first fingerprint trusted");
    store
        .trust_peer("peer-a", &"a".repeat(64))
        .expect("same fingerprint accepted");
    let changed = store.trust_peer("peer-a", &"b".repeat(64));

    assert!(changed.is_err());
    assert!(changed
        .unwrap_err()
        .to_string()
        .contains("peer fingerprint changed"));
}

#[test]
fn encrypted_store_lists_and_removes_trusted_peers_for_repair() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");

    store
        .trust_peer("peer-a", &"a".repeat(64))
        .expect("first peer trusted");
    store
        .trust_peer("peer-b", &"b".repeat(64))
        .expect("second peer trusted");

    let trusted = store.list_trusted_peers().expect("trusted peers listed");
    assert_eq!(trusted.len(), 2);
    assert!(trusted.iter().any(|peer| peer.peer_id == "peer-a"));
    assert!(trusted.iter().any(|peer| peer.peer_id == "peer-b"));

    assert!(store
        .remove_trusted_peer("peer-a")
        .expect("trusted peer removed"));
    assert!(!store
        .remove_trusted_peer("peer-a")
        .expect("already removed peer ignored"));

    let trusted = store
        .list_trusted_peers()
        .expect("trusted peers listed after removal");
    assert_eq!(trusted.len(), 1);
    assert_eq!(trusted[0].peer_id, "peer-b");

    store
        .trust_peer("peer-a", &"c".repeat(64))
        .expect("removed trust can be repaired with new fingerprint");
}

#[test]
fn encrypted_store_handles_outbox_ack_and_incoming_deduplication() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let identity = DeviceIdentity::generate("Sender".to_string(), "sender-pc".to_string());
    let message = ChatBody {
        message_id: identity.next_message_id(),
        conversation_id: "direct:sender:receiver".to_string(),
        sender_id: identity.peer_id().to_string(),
        recipients: vec!["receiver".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "queued until ack".to_string(),
        created_at: 1_700_000_100,
    };

    store.enqueue_outbox(&message).expect("message queued");
    let queued = store.message_status(&message.message_id).unwrap();
    assert_eq!(queued, Some(MessageStatus::Queued));
    assert_eq!(
        store.list_pending_outbox(10).unwrap()[0].message_id,
        message.message_id
    );
    assert_eq!(
        store.list_pending_outbox(10).unwrap()[0].recipients,
        vec!["receiver".to_string()]
    );
    assert_eq!(
        store
            .get_chat_body(&message.message_id)
            .unwrap()
            .expect("chat body exists")
            .recipients,
        vec!["receiver".to_string()]
    );

    store.mark_sending(&message.message_id).unwrap();
    let sending = store.message_status(&message.message_id).unwrap();
    assert_eq!(sending, Some(MessageStatus::Sending));
    assert_eq!(store.list_pending_outbox(10).unwrap().len(), 1);

    store.mark_acknowledged(&message.message_id).unwrap();
    let delivered = store.message_status(&message.message_id).unwrap();
    assert_eq!(delivered, Some(MessageStatus::Delivered));
    assert_eq!(
        store
            .get_message(&message.message_id)
            .unwrap()
            .expect("message still exists")
            .status,
        MessageStatus::Delivered
    );
    assert!(store.list_pending_outbox(10).unwrap().is_empty());

    store.mark_read(&message.message_id).unwrap();
    assert_eq!(
        store.message_status(&message.message_id).unwrap(),
        Some(MessageStatus::Read)
    );

    assert!(store.insert_incoming_once(&message).unwrap());
    assert!(!store.insert_incoming_once(&message).unwrap());
}

#[test]
fn encrypted_store_waits_for_all_recipient_acks_before_delivery() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "multi-ack-1".to_string(),
        conversation_id: "group:ops".to_string(),
        sender_id: "sender".to_string(),
        recipients: vec!["peer-a".to_string(), "peer-b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "wait for everyone".to_string(),
        created_at: 1_700_000_101,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store
        .mark_sending(&message.message_id)
        .expect("marked sending");

    assert!(!store
        .mark_peer_acknowledged(&message.message_id, "peer-a")
        .expect("first ack recorded"));
    assert!(!store
        .mark_peer_acknowledged(&message.message_id, "peer-a")
        .expect("duplicate first ack is ignored"));
    assert_eq!(
        store.message_status(&message.message_id).unwrap(),
        Some(MessageStatus::Sending)
    );

    assert!(store
        .mark_peer_acknowledged(&message.message_id, "peer-b")
        .expect("second ack records delivery"));
    assert_eq!(
        store.message_status(&message.message_id).unwrap(),
        Some(MessageStatus::Delivered)
    );
    assert!(!store
        .mark_peer_acknowledged(&message.message_id, "peer-b")
        .expect("duplicate delivered ack is ignored"));
    assert!(store.list_pending_outbox(10).unwrap().is_empty());
}

#[test]
fn encrypted_store_marks_exhausted_outbox_failed_and_retry_resets() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "retry-budget-1".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "retry budget".to_string(),
        created_at: 1_700_000_150,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store.mark_sending(&message.message_id).expect("attempt 1");
    store.mark_sending(&message.message_id).expect("attempt 2");
    store.mark_sending(&message.message_id).expect("attempt 3");

    let failed = store
        .fail_exhausted_outbox(3)
        .expect("exhausted outbox failed");
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].status, MessageStatus::Failed);
    assert_eq!(
        store.message_status(&message.message_id).unwrap(),
        Some(MessageStatus::Failed)
    );
    assert!(store
        .list_retryable_outbox(10, 0, 3)
        .expect("retryable listed")
        .is_empty());

    store
        .reset_message_for_retry(&message)
        .expect("message reset for retry");
    assert_eq!(
        store.message_status(&message.message_id).unwrap(),
        Some(MessageStatus::Queued)
    );
    assert_eq!(
        store
            .list_retryable_outbox(10, 0, 3)
            .expect("retryable after reset")
            .len(),
        1
    );
}

#[test]
fn encrypted_store_prunes_blocked_outbox_recipients_before_retry() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let mut message = ChatBody {
        message_id: "retry-prune-blocked-1".to_string(),
        conversation_id: "group:ops".to_string(),
        sender_id: "local".to_string(),
        recipients: vec!["peer-a".to_string(), "peer-b".to_string()],
        signature: vec![1],
        quote: None,
        attachments: Vec::new(),
        body: "retry without blocked peers".to_string(),
        created_at: 42,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store
        .update_contact_metadata("peer-a", "", "", false, true)
        .expect("peer-a blocked");

    let ready = store
        .prune_blocked_recipients_for_retry(&mut message, |payload| vec![payload.len() as u8, 9])
        .expect("recipients pruned");
    let saved = store
        .get_chat_body("retry-prune-blocked-1")
        .expect("message loaded")
        .expect("message exists");

    assert!(ready);
    assert_eq!(message.recipients, vec!["peer-b".to_string()]);
    assert_eq!(saved.recipients, vec!["peer-b".to_string()]);
    assert_eq!(saved.signature, message.signature);
    assert_ne!(saved.signature, vec![1]);

    store
        .update_contact_metadata("peer-b", "", "", false, true)
        .expect("peer-b blocked");
    let ready = store
        .prune_blocked_recipients_for_retry(&mut message, |payload| vec![payload.len() as u8, 10])
        .expect("all recipients blocked");

    assert!(!ready);
    assert_eq!(
        store
            .message_status("retry-prune-blocked-1")
            .expect("message status"),
        Some(MessageStatus::Failed)
    );
}

#[test]
fn encrypted_store_lists_messages_for_conversation() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "m-1".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: Some(MessageQuote {
            message_id: "quoted-1".to_string(),
            sender_id: "b".to_string(),
            body_preview: "previous message".to_string(),
        }),
        attachments: vec![MessageAttachment::transfer(
            TransferManifest::from_entries(
                "stored-attachment".to_string(),
                vec![FileEntry::new(
                    "archive.zip".to_string(),
                    1024,
                    "e".repeat(64),
                )],
                262_144,
            )
            .expect("stored attachment manifest builds"),
        )],
        body: "历史消息应能重新加载".to_string(),
        created_at: 1_700_000_200,
    };

    store.enqueue_outbox(&message).expect("message queued");
    assert_eq!(
        store
            .get_chat_body("m-1")
            .expect("chat body")
            .expect("chat body exists")
            .quote
            .expect("quote stored")
            .message_id,
        "quoted-1"
    );
    let messages = store
        .list_messages("direct:a:b", 50)
        .expect("messages listed");

    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].body, "历史消息应能重新加载");
    assert_eq!(messages[0].status, MessageStatus::Queued);
    assert_eq!(
        messages[0]
            .quote
            .as_ref()
            .expect("quote listed")
            .body_preview,
        "previous message"
    );
    assert_eq!(messages[0].attachments.len(), 1);
    assert_eq!(
        messages[0].attachments[0].manifest.files[0].path,
        "archive.zip"
    );
}

#[test]
fn encrypted_store_searches_within_one_conversation() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let first = ChatBody {
        message_id: "search-in-a".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "alpha scoped result".to_string(),
        created_at: 1_700_000_210,
    };
    let second = ChatBody {
        message_id: "search-in-c".to_string(),
        conversation_id: "direct:c:d".to_string(),
        sender_id: "c".to_string(),
        recipients: vec!["d".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "alpha outside result".to_string(),
        created_at: 1_700_000_211,
    };

    store.enqueue_outbox(&first).expect("first queued");
    store.enqueue_outbox(&second).expect("second queued");
    let results = store
        .search_conversation_messages("direct:a:b", "alpha", 10)
        .expect("conversation search succeeds");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "search-in-a");
}

#[test]
fn encrypted_store_global_search_matches_attachment_filenames() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "search-transfer".to_string(),
        vec![FileEntry::new("report.pdf".to_string(), 42, "a".repeat(64))],
        262_144,
    )
    .expect("manifest builds");
    let message = ChatBody {
        message_id: "global-attachment-search".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: vec![MessageAttachment::transfer(manifest)],
        body: String::new(),
        created_at: 1_700_000_212,
    };

    store.enqueue_outbox(&message).expect("message queued");
    let results = store
        .search_messages("report.pdf")
        .expect("global search succeeds");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "global-attachment-search");
}

#[test]
fn encrypted_store_search_treats_like_metacharacters_literally() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let literal = ChatBody {
        message_id: "literal-underscore".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "ticket_123".to_string(),
        created_at: 1_700_000_213,
    };
    let wildcard_match = ChatBody {
        message_id: "wildcard-lookalike".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "ticketX123".to_string(),
        created_at: 1_700_000_214,
    };

    store.enqueue_outbox(&literal).expect("literal queued");
    store
        .enqueue_outbox(&wildcard_match)
        .expect("lookalike queued");

    let global_results = store
        .search_messages("ticket_123")
        .expect("global search succeeds");
    let conversation_results = store
        .search_conversation_messages("direct:a:b", "ticket_123", 10)
        .expect("conversation search succeeds");

    assert_eq!(global_results.len(), 1);
    assert_eq!(global_results[0].id, "literal-underscore");
    assert_eq!(conversation_results.len(), 1);
    assert_eq!(conversation_results[0].id, "literal-underscore");
}

#[test]
fn encrypted_store_lists_conversation_messages_by_time_range() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let in_range = ChatBody {
        message_id: "date-in-range".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "same day".to_string(),
        created_at: 1_700_100_000,
    };
    let other_conversation = ChatBody {
        message_id: "date-other-conversation".to_string(),
        conversation_id: "direct:c:d".to_string(),
        sender_id: "c".to_string(),
        recipients: vec!["d".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "same day outside conversation".to_string(),
        created_at: 1_700_100_001,
    };
    let out_of_range = ChatBody {
        message_id: "date-out-of-range".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "next day".to_string(),
        created_at: 1_700_200_000,
    };

    store.enqueue_outbox(&in_range).expect("in range queued");
    store
        .enqueue_outbox(&other_conversation)
        .expect("other conversation queued");
    store
        .enqueue_outbox(&out_of_range)
        .expect("out of range queued");

    let results = store
        .list_conversation_messages_between("direct:a:b", 1_700_000_000, 1_700_150_000, 10)
        .expect("messages listed by date");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "date-in-range");
}

#[test]
fn encrypted_store_deletes_single_message() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "delete-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "temporary".to_string(),
        created_at: 1_700_000_250,
    };

    store.enqueue_outbox(&message).expect("message queued");
    assert_eq!(
        store
            .list_messages("direct:a:b", 10)
            .expect("messages listed")
            .len(),
        1
    );
    store.delete_message("delete-me").expect("message deleted");
    assert!(store
        .list_messages("direct:a:b", 10)
        .expect("messages listed")
        .is_empty());
}

#[test]
fn encrypted_store_recalls_message_without_allowing_sender_spoofing() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "recall-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "temporary secret".to_string(),
        created_at: 1_700_000_275,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store
        .set_message_favorite("recall-me", true)
        .expect("message favorited");
    store
        .set_message_reaction("recall-me", "direct:a:b", "b", "ok", true)
        .expect("reaction saved");
    store
        .mark_peer_acknowledged("recall-me", "b")
        .expect("ack saved");
    assert!(store
        .revoke_message("recall-me", "b")
        .expect_err("wrong sender rejected")
        .to_string()
        .contains("message sender mismatch"));
    assert!(store
        .revoke_message_in_conversation("recall-me", "direct:a:c", "a")
        .expect_err("wrong conversation rejected")
        .to_string()
        .contains("message conversation mismatch"));
    assert!(
        !store
            .get_message("recall-me")
            .expect("message loaded")
            .expect("message still exists")
            .recalled
    );

    let recalled = store
        .revoke_message_in_conversation("recall-me", "direct:a:b", "a")
        .expect("message recalled")
        .expect("recalled message returned");
    assert!(recalled.recalled);
    assert!(recalled.body.is_empty());
    assert!(!recalled.favorited);
    assert!(recalled.reactions.is_empty());
    assert!(store
        .get_chat_body("recall-me")
        .expect("chat body lookup")
        .expect("chat body still exists")
        .body
        .is_empty());
    assert!(store
        .list_favorite_messages(10)
        .expect("favorites listed after recall")
        .is_empty());
}

#[test]
fn encrypted_store_favorites_and_unfavorites_messages() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "favorite-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "worth saving".to_string(),
        created_at: 1_700_000_290,
    };

    store.enqueue_outbox(&message).expect("message queued");
    let favorited = store
        .set_message_favorite("favorite-me", true)
        .expect("favorite updated")
        .expect("message exists");
    assert!(favorited.favorited);
    let favorites = store.list_favorite_messages(10).expect("favorites listed");
    assert_eq!(favorites.len(), 1);
    assert_eq!(favorites[0].id, "favorite-me");
    let unfavorited = store
        .set_message_favorite("favorite-me", false)
        .expect("favorite cleared")
        .expect("message exists");
    assert!(!unfavorited.favorited);
    assert!(store
        .list_favorite_messages(10)
        .expect("favorites listed after clear")
        .is_empty());
}

#[test]
fn encrypted_store_pins_and_unpins_conversation_messages() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "pin-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "important rollout window".to_string(),
        created_at: 1_700_000_292,
    };

    store.enqueue_outbox(&message).expect("message queued");
    let pinned = store
        .set_message_pin("pin-me", true)
        .expect("pin updated")
        .expect("message exists");
    assert_eq!(pinned.id, "pin-me");
    let pins = store
        .list_pinned_messages("direct:a:b", 10)
        .expect("pins listed");
    assert_eq!(pins.len(), 1);
    assert_eq!(pins[0].body, "important rollout window");

    store
        .set_message_pin("pin-me", false)
        .expect("pin cleared")
        .expect("message exists");
    assert!(store
        .list_pinned_messages("direct:a:b", 10)
        .expect("pins listed after clear")
        .is_empty());
}

#[test]
fn encrypted_store_clears_pins_when_messages_are_cleared() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "pin-clear-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "temporary incident note".to_string(),
        created_at: 1_700_000_293,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store
        .set_message_pin("pin-clear-me", true)
        .expect("pin saved")
        .expect("message exists");
    assert_eq!(
        store
            .clear_conversation_messages("direct:a:b")
            .expect("messages cleared"),
        1
    );
    assert!(store
        .list_pinned_messages("direct:a:b", 10)
        .expect("pins listed after conversation clear")
        .is_empty());
}

#[test]
fn encrypted_store_tracks_and_completes_message_todos() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "todo-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "follow up tomorrow".to_string(),
        created_at: 1_700_000_294,
    };

    store.enqueue_outbox(&message).expect("message queued");
    let todo = store
        .set_message_todo("todo-me", true)
        .expect("todo updated")
        .expect("message exists");
    assert_eq!(todo.id, "todo-me");
    let todos = store.list_todo_messages(10).expect("todos listed");
    assert_eq!(todos.len(), 1);
    assert_eq!(todos[0].body, "follow up tomorrow");

    store
        .set_message_todo("todo-me", false)
        .expect("todo completed")
        .expect("message exists");
    assert!(store
        .list_todo_messages(10)
        .expect("todos listed after complete")
        .is_empty());
}

#[test]
fn encrypted_store_clears_todos_when_messages_are_cleared() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "todo-clear-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "cleanup after incident".to_string(),
        created_at: 1_700_000_296,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store
        .set_message_todo("todo-clear-me", true)
        .expect("todo saved")
        .expect("message exists");
    assert_eq!(
        store
            .clear_conversation_messages("direct:a:b")
            .expect("messages cleared"),
        1
    );
    assert!(store
        .list_todo_messages(10)
        .expect("todos listed after conversation clear")
        .is_empty());
}

#[test]
fn encrypted_store_adds_and_removes_message_reactions() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "react-me".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "reactable".to_string(),
        created_at: 1_700_000_295,
    };

    store.enqueue_outbox(&message).expect("message queued");
    let reacted = store
        .set_message_reaction("react-me", "direct:a:b", "b", "ok", true)
        .expect("reaction updated")
        .expect("message exists");
    assert_eq!(reacted.reactions.len(), 1);
    assert_eq!(reacted.reactions[0].sender_id, "b");
    assert_eq!(reacted.reactions[0].reaction, "ok");

    let listed = store
        .list_messages("direct:a:b", 10)
        .expect("messages listed");
    assert_eq!(listed[0].reactions.len(), 1);

    let cleared = store
        .set_message_reaction("react-me", "direct:a:b", "b", "ok", false)
        .expect("reaction cleared")
        .expect("message exists");
    assert!(cleared.reactions.is_empty());
}

#[test]
fn encrypted_store_rejects_reactions_for_recalled_messages() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "react-recalled".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "will be recalled".to_string(),
        created_at: 1_700_000_296,
    };

    store.enqueue_outbox(&message).expect("message queued");
    store
        .revoke_message("react-recalled", "a")
        .expect("message recalled")
        .expect("message exists");

    let rejected = store.set_message_reaction("react-recalled", "direct:a:b", "b", "ok", true);

    assert!(rejected
        .expect_err("recalled message reaction rejected")
        .to_string()
        .contains("recalled message cannot be reacted"));
    assert!(store
        .get_message("react-recalled")
        .expect("message loaded")
        .expect("message exists")
        .reactions
        .is_empty());
}

#[test]
fn encrypted_store_marks_conversation_read_for_unread_counts() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let incoming = ChatBody {
        message_id: "unread-1".to_string(),
        conversation_id: "direct:peer:me".to_string(),
        sender_id: "peer".to_string(),
        recipients: vec!["me".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "needs attention".to_string(),
        created_at: 1_700_000_300,
    };

    assert!(store
        .insert_incoming_once(&incoming)
        .expect("incoming inserted"));
    let before = store.list_conversations().expect("conversations listed");
    assert_eq!(before[0].unread_count, 1);
    let receipts = store
        .received_messages_for_read_receipt("direct:peer:me", "me", 10)
        .expect("read receipt candidates listed");
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].id, "unread-1");

    store
        .mark_conversation_read("direct:peer:me")
        .expect("marked read");
    let after = store.list_conversations().expect("conversations listed");
    assert_eq!(after[0].unread_count, 0);
    assert!(store
        .received_messages_for_read_receipt("direct:peer:me", "me", 10)
        .expect("read receipt candidates listed after read")
        .is_empty());
    assert_eq!(
        store.message_status("unread-1").unwrap(),
        Some(MessageStatus::Read)
    );
}

#[test]
fn encrypted_store_lists_all_read_receipt_candidates_when_limit_allows() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    for index in 0..125 {
        let incoming = ChatBody {
            message_id: format!("bulk-read-{index:03}"),
            conversation_id: "direct:peer:me".to_string(),
            sender_id: "peer".to_string(),
            recipients: vec!["me".to_string()],
            signature: Vec::new(),
            quote: None,
            attachments: Vec::new(),
            body: format!("bulk read {index}"),
            created_at: 1_700_000_300 + index,
        };
        assert!(store
            .insert_incoming_once(&incoming)
            .expect("incoming inserted"));
    }

    let receipts = store
        .received_messages_for_read_receipt("direct:peer:me", "me", 200)
        .expect("read receipt candidates listed");

    assert_eq!(receipts.len(), 125);
    assert_eq!(receipts[0].id, "bulk-read-124");
    assert_eq!(receipts[124].id, "bulk-read-000");
}

#[test]
fn encrypted_store_lists_read_receipt_candidates_across_conversations() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    for (message_id, conversation_id, sender_id, recipients) in [
        ("all-read-a", "direct:peer-a:me", "peer-a", vec!["me"]),
        ("all-read-b", "group:ops", "peer-b", vec!["me", "peer-a"]),
        ("all-read-local", "group:ops", "me", vec!["peer-a"]),
    ] {
        let incoming = ChatBody {
            message_id: message_id.to_string(),
            conversation_id: conversation_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.into_iter().map(str::to_string).collect(),
            signature: Vec::new(),
            quote: None,
            attachments: Vec::new(),
            body: message_id.to_string(),
            created_at: 1_700_000_400,
        };
        assert!(store
            .insert_incoming_once(&incoming)
            .expect("incoming inserted"));
    }

    let receipts = store
        .all_received_messages_for_read_receipts("me")
        .expect("all read receipt candidates listed");

    assert_eq!(
        receipts
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["all-read-a", "all-read-b"]
    );
}

#[test]
fn encrypted_store_preserves_unread_badges_for_muted_conversations() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let incoming = ChatBody {
        message_id: "muted-unread-1".to_string(),
        conversation_id: "direct:muted:me".to_string(),
        sender_id: "muted".to_string(),
        recipients: vec!["me".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "silent but visible".to_string(),
        created_at: 1_700_000_310,
    };

    assert!(store
        .insert_incoming_once(&incoming)
        .expect("incoming inserted"));
    store
        .update_conversation_preferences("direct:muted:me", false, true, false)
        .expect("muted preference saved");

    let conversations = store.list_conversations().expect("conversations listed");
    let muted = conversations
        .iter()
        .find(|conversation| conversation.id == "direct:muted:me")
        .expect("muted conversation listed");
    assert!(muted.muted);
    assert_eq!(muted.unread_count, 1);
}

#[test]
fn encrypted_store_persists_manual_unread_marker_until_marked_read() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let message = ChatBody {
        message_id: "manual-unread-1".to_string(),
        conversation_id: "direct:todo:me".to_string(),
        sender_id: "me".to_string(),
        recipients: vec!["todo".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "follow up later".to_string(),
        created_at: 1_700_000_320,
    };

    store.enqueue_outbox(&message).expect("message saved");
    store
        .mark_conversation_unread("direct:todo:me")
        .expect("manual unread saved");
    let unread = store.list_conversations().expect("conversations listed");
    assert_eq!(unread[0].unread_count, 1);
    assert!(unread[0].manual_unread);

    store
        .mark_conversation_read("direct:todo:me")
        .expect("manual unread cleared");
    let read = store
        .conversation_summary("direct:todo:me")
        .expect("summary loaded")
        .expect("summary exists");
    assert_eq!(read.unread_count, 0);
    assert!(!read.manual_unread);
}

#[test]
fn encrypted_store_marks_all_conversations_read() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    for (index, conversation_id) in ["direct:a:me", "direct:b:me"].iter().enumerate() {
        let incoming = ChatBody {
            message_id: format!("all-read-{index}"),
            conversation_id: conversation_id.to_string(),
            sender_id: format!("peer-{index}"),
            recipients: vec!["me".to_string()],
            signature: Vec::new(),
            quote: None,
            attachments: Vec::new(),
            body: "needs attention".to_string(),
            created_at: 1_700_000_330 + index as i64,
        };
        assert!(store
            .insert_incoming_once(&incoming)
            .expect("incoming inserted"));
    }

    let follow_up = ChatBody {
        message_id: "all-read-manual".to_string(),
        conversation_id: "direct:manual:me".to_string(),
        sender_id: "me".to_string(),
        recipients: vec!["manual".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "manual follow up".to_string(),
        created_at: 1_700_000_340,
    };
    store.enqueue_outbox(&follow_up).expect("outbox saved");
    store
        .mark_conversation_unread("direct:manual:me")
        .expect("manual unread saved");

    assert_eq!(
        store
            .list_conversations()
            .expect("conversations listed")
            .iter()
            .map(|conversation| conversation.unread_count)
            .sum::<u32>(),
        3
    );

    let changed = store
        .mark_all_conversations_read()
        .expect("all conversations marked read");
    assert_eq!(changed, 3);
    assert!(store
        .list_conversations()
        .expect("conversations listed after read")
        .iter()
        .all(|conversation| conversation.unread_count == 0));
}

#[test]
fn encrypted_store_persists_network_settings_and_group_conversations() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let settings = NetworkSettings {
        auto_discovery: false,
        multicast: false,
        seed_peers: vec!["192.168.2.10:24251".to_string()],
        scan_ranges: vec!["192.168.2.0/24".to_string()],
        discovery_interval_secs: 3,
        peer_ttl_secs: 15,
    };

    store
        .save_network_settings(&settings)
        .expect("network settings saved");
    assert_eq!(
        store
            .load_network_settings()
            .expect("network settings loaded"),
        Some(settings)
    );

    let group_id = store
        .create_group_conversation(
            "Ops Room",
            "local-peer",
            &["peer-a".to_string(), "peer-b".to_string()],
        )
        .expect("group conversation saved");
    let conversations = store.list_conversations().expect("conversations listed");
    assert!(conversations
        .iter()
        .any(|conversation| conversation.id == group_id && conversation.title == "Ops Room"));

    let members = store
        .list_group_members(&group_id)
        .expect("group members listed");
    assert_eq!(members, vec!["peer-a".to_string(), "peer-b".to_string()]);

    store
        .upsert_group_conversation(
            &group_id,
            "Ops Room Renamed",
            "Release notes pinned for every member",
            "local-peer",
            &["peer-a".to_string(), "peer-c".to_string()],
        )
        .expect("group conversation updated");
    let summary = store
        .conversation_summary(&group_id)
        .expect("summary loaded")
        .expect("summary exists");
    assert_eq!(summary.title, "Ops Room Renamed");
    assert_eq!(summary.group_owner_peer_id, "local-peer");
    assert_eq!(
        summary.group_announcement,
        "Release notes pinned for every member"
    );
    assert_eq!(
        store
            .list_group_members(&group_id)
            .expect("updated members listed"),
        vec!["peer-a".to_string(), "peer-c".to_string()]
    );
}

#[test]
fn encrypted_store_persists_app_preferences() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    assert_eq!(
        store
            .load_app_preferences()
            .expect("missing app preferences loads"),
        None
    );

    let preferences = AppPreferences {
        dark_mode: true,
        send_shortcut: "ctrl_enter".to_string(),
        shortcuts: AppShortcuts {
            send_message: "ctrl_enter".to_string(),
            screenshot: "ctrl_shift_a".to_string(),
            toggle_window: "ctrl_shift_i".to_string(),
        },
        show_notification_preview: false,
        privacy_mode: false,
        close_to_tray: false,
        ..AppPreferences::default()
    };
    store
        .save_app_preferences(&preferences)
        .expect("app preferences saved");

    assert_eq!(
        store
            .load_app_preferences()
            .expect("app preferences loaded"),
        Some(preferences)
    );
}

#[test]
fn encrypted_store_persists_transfer_tasks_with_progress() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "transfer-store-1".to_string(),
        vec![
            FileEntry::new("report.pdf".to_string(), 10, "a".repeat(64)),
            FileEntry::new("image.png".to_string(), 15, "b".repeat(64)),
        ],
        262_144,
    )
    .expect("manifest builds");

    store
        .upsert_transfer("direct:a:b", &manifest, "indexed", 0)
        .expect("transfer saved");
    store
        .update_transfer_progress(&manifest.transfer_id, "downloaded", manifest.total_bytes)
        .expect("transfer progress updated");

    let tasks = store.list_transfers(20).expect("transfers listed");
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].id, manifest.transfer_id);
    assert_eq!(tasks[0].name, "2 个文件");
    assert_eq!(tasks[0].status, "downloaded");
    assert_eq!(tasks[0].sent_bytes, 25);
    assert_eq!(tasks[0].total_bytes, 25);
    assert_eq!(
        tasks[0].files,
        vec!["report.pdf".to_string(), "image.png".to_string()]
    );
}

#[test]
fn encrypted_store_deletes_and_clears_transfer_tasks() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "transfer-cleanup-1".to_string(),
        vec![FileEntry::new(
            "cleanup.txt".to_string(),
            10,
            "a".repeat(64),
        )],
        262_144,
    )
    .expect("manifest builds");

    store
        .upsert_transfer("direct:a:b", &manifest, "downloaded", manifest.total_bytes)
        .expect("transfer saved");
    let cleared = store.clear_completed_transfers().expect("cleared");
    assert_eq!(cleared.removed_count, 1);
    assert_eq!(cleared.transfer_ids, vec!["transfer-cleanup-1"]);
    assert!(store
        .list_transfers(20)
        .expect("transfers listed")
        .is_empty());

    store
        .upsert_transfer("direct:a:b", &manifest, "indexed", 0)
        .expect("transfer saved again");
    let active_cleared = store.clear_completed_transfers().expect("cleared active");
    assert_eq!(active_cleared.removed_count, 0);
    assert!(active_cleared.transfer_ids.is_empty());
    assert_eq!(
        store
            .list_transfers(20)
            .expect("active transfer listed")
            .len(),
        1
    );

    store
        .cancel_transfer(&manifest.transfer_id)
        .expect("transfer canceled");
    let canceled = store.list_transfers(20).expect("canceled transfer listed");
    assert_eq!(canceled[0].status, "canceled");
    assert_eq!(canceled[0].sent_bytes, 0);
    let canceled_cleared = store.clear_completed_transfers().expect("cleared canceled");
    assert_eq!(canceled_cleared.removed_count, 1);
    assert_eq!(canceled_cleared.transfer_ids, vec!["transfer-cleanup-1"]);
    assert!(store
        .list_transfers(20)
        .expect("transfers listed after canceled cleanup")
        .is_empty());

    store
        .upsert_transfer("direct:a:b", &manifest, "indexed", 0)
        .expect("transfer saved before delete");
    assert!(store
        .delete_transfer(&manifest.transfer_id)
        .expect("transfer deleted"));
    assert!(!store
        .delete_transfer(&manifest.transfer_id)
        .expect("missing transfer reports unchanged"));
    assert!(store
        .list_transfers(20)
        .expect("transfers listed")
        .is_empty());
}

#[test]
fn encrypted_store_does_not_reactivate_canceled_or_completed_transfers_from_manifest_upsert() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let canceled_manifest = TransferManifest::from_entries(
        "transfer-canceled-reannounce".to_string(),
        vec![FileEntry::new(
            "cancelled.zip".to_string(),
            6,
            "0".repeat(64),
        )],
        262_144,
    )
    .expect("canceled manifest");
    let downloaded_manifest = TransferManifest::from_entries(
        "transfer-downloaded-reannounce".to_string(),
        vec![FileEntry::new("done.zip".to_string(), 6, "1".repeat(64))],
        262_144,
    )
    .expect("downloaded manifest");
    let failed_manifest = TransferManifest::from_entries(
        "transfer-failed-reannounce".to_string(),
        vec![FileEntry::new("retry.zip".to_string(), 6, "2".repeat(64))],
        262_144,
    )
    .expect("failed manifest");

    store
        .upsert_transfer("direct:a:b", &canceled_manifest, "indexed", 0)
        .expect("canceled transfer saved");
    store
        .cancel_transfer(&canceled_manifest.transfer_id)
        .expect("transfer canceled");
    store
        .upsert_transfer("direct:a:b", &canceled_manifest, "manifest_received", 0)
        .expect("canceled transfer reannounced");

    store
        .upsert_transfer(
            "direct:a:b",
            &downloaded_manifest,
            "downloaded",
            downloaded_manifest.total_bytes,
        )
        .expect("downloaded transfer saved");
    store
        .upsert_transfer("direct:a:b", &downloaded_manifest, "manifest_received", 0)
        .expect("downloaded transfer reannounced");

    store
        .upsert_transfer("direct:a:b", &failed_manifest, "failed", 0)
        .expect("failed transfer saved");
    store
        .upsert_transfer("direct:a:b", &failed_manifest, "manifest_received", 0)
        .expect("failed transfer reannounced");

    assert_eq!(
        store
            .transfer_status(&canceled_manifest.transfer_id)
            .expect("canceled status"),
        Some("canceled".to_string())
    );
    assert_eq!(
        store
            .transfer_status(&downloaded_manifest.transfer_id)
            .expect("downloaded status"),
        Some("downloaded".to_string())
    );
    assert_eq!(
        store
            .transfer_status(&failed_manifest.transfer_id)
            .expect("failed status"),
        Some("manifest_received".to_string())
    );
}

#[test]
fn encrypted_store_allows_only_one_active_download_start_per_transfer() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "transfer-download-gate".to_string(),
        vec![FileEntry::new("payload.zip".to_string(), 6, "3".repeat(64))],
        262_144,
    )
    .expect("manifest");

    store
        .upsert_transfer("direct:a:b", &manifest, "manifest_received", 0)
        .expect("transfer saved");

    assert!(store
        .begin_transfer_download(&manifest.transfer_id)
        .expect("first download starts"));
    store
        .upsert_transfer("direct:a:b", &manifest, "manifest_received", 0)
        .expect("duplicate transfer announcement saved");
    assert!(!store
        .begin_transfer_download(&manifest.transfer_id)
        .expect("duplicate download suppressed"));
    assert_eq!(
        store
            .transfer_status(&manifest.transfer_id)
            .expect("status loaded"),
        Some("downloading".to_string())
    );

    store
        .update_transfer_progress_with_error(&manifest.transfer_id, "failed", 3, "network")
        .expect("transfer failed");
    assert!(store
        .begin_transfer_download(&manifest.transfer_id)
        .expect("failed transfer can restart"));

    store
        .cancel_transfer(&manifest.transfer_id)
        .expect("transfer canceled");
    assert!(!store
        .begin_transfer_download(&manifest.transfer_id)
        .expect("canceled transfer does not restart"));
}

#[test]
fn encrypted_store_persists_conversation_preferences_and_deletes_conversation() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let first = ChatBody {
        message_id: "pref-1".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "normal conversation".to_string(),
        created_at: 1_700_000_100,
    };
    let second = ChatBody {
        message_id: "pref-2".to_string(),
        conversation_id: "direct:a:c".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["c".to_string()],
        signature: Vec::new(),

        quote: None,

        attachments: Vec::new(),

        body: "pinned conversation".to_string(),
        created_at: 1_700_000_000,
    };

    store.enqueue_outbox(&first).expect("first queued");
    store.enqueue_outbox(&second).expect("second queued");
    store
        .update_conversation_preferences("direct:a:c", true, true, false)
        .expect("preferences saved");

    let conversations = store.list_conversations().expect("conversations listed");
    assert_eq!(conversations[0].id, "direct:a:c");
    assert!(conversations[0].pinned);
    assert!(conversations[0].muted);

    store
        .delete_conversation("direct:a:c")
        .expect("conversation deleted");
    assert!(store
        .list_messages("direct:a:c", 10)
        .expect("messages listed")
        .is_empty());
    assert!(!store
        .list_conversations()
        .expect("conversations listed")
        .iter()
        .any(|conversation| conversation.id == "direct:a:c"));
}

#[test]
fn encrypted_store_titles_legacy_direct_conversations_with_remote_peer() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let outgoing = ChatBody {
        message_id: "direct-title-outgoing".to_string(),
        conversation_id: "direct:peer-b".to_string(),
        sender_id: "local".to_string(),
        recipients: vec!["peer-b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "outgoing".to_string(),
        created_at: 1_700_000_500,
    };
    let incoming = ChatBody {
        message_id: "direct-title-incoming".to_string(),
        conversation_id: "direct:local".to_string(),
        sender_id: "peer-a".to_string(),
        recipients: vec!["local".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "incoming".to_string(),
        created_at: 1_700_000_501,
    };

    store.enqueue_outbox(&outgoing).expect("outgoing saved");
    assert!(store
        .insert_incoming_once(&incoming)
        .expect("incoming saved"));

    let conversations = store.list_conversations().expect("conversations listed");
    let outgoing_summary = conversations
        .iter()
        .find(|conversation| conversation.id == "direct:peer-b")
        .expect("outgoing summary");
    let incoming_summary = conversations
        .iter()
        .find(|conversation| conversation.id == "direct:local")
        .expect("incoming summary");
    assert_eq!(outgoing_summary.title, "peer-b");
    assert_eq!(incoming_summary.title, "peer-a");
}

#[test]
fn encrypted_store_clears_conversation_messages_without_deleting_preferences_or_draft() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let first = ChatBody {
        message_id: "clear-1".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "clear me".to_string(),
        created_at: 1_700_000_410,
    };
    let second = ChatBody {
        message_id: "clear-2".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "b".to_string(),
        recipients: vec!["a".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: Vec::new(),
        body: "clear me too".to_string(),
        created_at: 1_700_000_411,
    };
    let quote = Some(MessageQuote {
        message_id: "clear-1".to_string(),
        sender_id: "a".to_string(),
        body_preview: "clear me".to_string(),
    });

    store.enqueue_outbox(&first).expect("first queued");
    assert!(store
        .insert_incoming_once(&second)
        .expect("incoming inserted"));
    store
        .set_message_favorite("clear-1", true)
        .expect("favorite saved");
    store
        .set_message_reaction("clear-1", "direct:a:b", "b", "ok", true)
        .expect("reaction saved");
    store
        .update_conversation_preferences("direct:a:b", true, true, false)
        .expect("preferences saved");
    store
        .save_conversation_draft("direct:a:b", "kept draft", &quote)
        .expect("draft saved");

    store
        .clear_conversation_messages("direct:a:b")
        .expect("conversation messages cleared");

    assert!(store
        .list_messages("direct:a:b", 10)
        .expect("messages listed")
        .is_empty());
    assert!(store
        .list_favorite_messages(10)
        .expect("favorites listed")
        .is_empty());
    let conversations = store.list_conversations().expect("conversations listed");
    let conversation = conversations
        .iter()
        .find(|conversation| conversation.id == "direct:a:b")
        .expect("draft keeps conversation visible");
    assert!(conversation.pinned);
    assert!(conversation.muted);
    assert_eq!(conversation.draft_preview, "kept draft");
}

#[test]
fn encrypted_store_persists_and_clears_conversation_drafts() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let quote = Some(MessageQuote {
        message_id: "quoted-draft".to_string(),
        sender_id: "peer".to_string(),
        body_preview: "quoted preview".to_string(),
    });

    store
        .save_conversation_draft("direct:a:b", "draft body", &quote)
        .expect("draft saved");
    let draft = store
        .load_conversation_draft("direct:a:b")
        .expect("draft loaded")
        .expect("draft exists");
    assert_eq!(draft.text, "draft body");
    assert_eq!(
        draft.quote.expect("quote exists").message_id,
        "quoted-draft"
    );

    let conversations = store.list_conversations().expect("conversations listed");
    assert_eq!(conversations[0].id, "direct:a:b");
    assert_eq!(conversations[0].draft_preview, "draft body");

    store
        .save_conversation_draft("direct:a:b", "", &None)
        .expect("draft cleared");
    assert!(store
        .load_conversation_draft("direct:a:b")
        .expect("draft lookup after clear")
        .is_none());
}

#[test]
fn encrypted_store_lists_last_message_previews() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let text = ChatBody {
        message_id: "preview-text".to_string(),
        conversation_id: "direct:a:b".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["b".to_string()],
        signature: Vec::new(),
        body: "hello from the latest message".to_string(),
        attachments: Vec::new(),
        created_at: 1_700_000_000_000,
        quote: None,
    };
    store.enqueue_outbox(&text).expect("text message saved");

    let manifest = TransferManifest::from_entries(
        "preview-transfer".to_string(),
        vec![FileEntry::new("report.pdf".to_string(), 42, "a".repeat(64))],
        262_144,
    )
    .expect("manifest");
    let file = ChatBody {
        message_id: "preview-file".to_string(),
        conversation_id: "direct:a:c".to_string(),
        sender_id: "a".to_string(),
        recipients: vec!["c".to_string()],
        signature: Vec::new(),
        body: String::new(),
        attachments: vec![MessageAttachment::transfer(manifest)],
        created_at: 1_700_000_000_500,
        quote: None,
    };
    store.enqueue_outbox(&file).expect("file message saved");

    let conversations = store.list_conversations().expect("conversations listed");
    let text_summary = conversations
        .iter()
        .find(|conversation| conversation.id == "direct:a:b")
        .expect("text conversation listed");
    let file_summary = conversations
        .iter()
        .find(|conversation| conversation.id == "direct:a:c")
        .expect("file conversation listed");

    assert_eq!(
        text_summary.last_message_preview,
        "hello from the latest message"
    );
    assert_eq!(file_summary.last_message_preview, "[文件] report.pdf");
}

#[test]
fn encrypted_store_pages_conversation_history_before_cursor() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    for index in 0..5 {
        let message = ChatBody {
            message_id: format!("page-{index}"),
            conversation_id: "direct:a:b".to_string(),
            sender_id: "a".to_string(),
            recipients: vec!["b".to_string()],
            signature: Vec::new(),
            quote: None,
            attachments: Vec::new(),
            body: format!("message {index}"),
            created_at: 1_700_000_500 + index,
        };
        store.enqueue_outbox(&message).expect("message saved");
    }

    let latest = store
        .list_messages_before("direct:a:b", None, 2)
        .expect("latest page");
    assert_eq!(
        latest
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["page-3", "page-4"]
    );

    let older = store
        .list_messages_before("direct:a:b", Some(latest[0].created_at), 2)
        .expect("older page");
    assert_eq!(
        older
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["page-1", "page-2"]
    );
}

#[test]
fn encrypted_store_persists_contact_metadata() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");

    store
        .update_contact_metadata("peer-a", "Alice Ops", "研发部", true, false)
        .expect("contact metadata saved");
    let first = store
        .list_contact_metadata()
        .expect("contact metadata listed");

    assert_eq!(first.len(), 1);
    assert_eq!(first[0].peer_id, "peer-a");
    assert_eq!(first[0].remark, "Alice Ops");
    assert_eq!(first[0].group_name, "研发部");
    assert!(first[0].favorite);
    assert!(!first[0].blocked);

    store
        .update_contact_metadata("peer-a", "", "", false, true)
        .expect("contact metadata updated");
    let updated = store
        .list_contact_metadata()
        .expect("updated contact metadata listed");

    assert_eq!(updated[0].remark, "");
    assert_eq!(updated[0].group_name, "");
    assert!(!updated[0].favorite);
    assert!(updated[0].blocked);
    assert!(store
        .is_peer_blocked("peer-a")
        .expect("blocked state loaded"));
    assert_eq!(
        store
            .filter_unblocked_peer_ids(vec!["peer-a".to_string(), "peer-b".to_string()])
            .expect("blocked peers filtered"),
        vec!["peer-b".to_string()]
    );
}

#[test]
fn transfer_manifest_records_total_size_and_digest() {
    let manifest = TransferManifest::from_entries(
        "transfer-1".to_string(),
        vec![
            FileEntry::new("notes.txt".to_string(), 10, "a".repeat(64)),
            FileEntry::new("slides.pdf".to_string(), 20, "b".repeat(64)),
        ],
        262_144,
    )
    .expect("manifest builds");

    assert_eq!(manifest.total_bytes, 30);
    assert_eq!(manifest.files.len(), 2);
    assert_eq!(manifest.chunk_size, 262_144);
    assert_eq!(manifest.sha256.len(), 64);
}

#[test]
fn file_entry_serialization_omits_local_source_path() {
    let entry = FileEntry::new("folder/report.pdf".to_string(), 42, "a".repeat(64))
        .with_relative_path("folder/report.pdf")
        .with_source_path(r"C:\Users\Alice\Secret\report.pdf");

    let json = serde_json::to_string(&entry).expect("file entry serializes");
    let decoded: FileEntry = serde_json::from_str(&json).expect("file entry decodes");

    assert!(!json.contains("Secret"));
    assert!(!json.contains("source_path"));
    assert_eq!(decoded.path, "folder/report.pdf");
    assert_eq!(decoded.relative_path, "folder/report.pdf");
    assert_eq!(decoded.source_path, "");
}

#[test]
fn encrypted_store_hydrates_local_transfer_sources_for_forward_and_retry() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "transfer-local-sources".to_string(),
        vec![
            FileEntry::new("folder/a.txt".to_string(), 5, "a".repeat(64))
                .with_relative_path("folder/a.txt")
                .with_source_path(r"C:\Users\Alice\Files\a.txt"),
            FileEntry::new("folder/b.txt".to_string(), 7, "b".repeat(64))
                .with_relative_path("folder/b.txt")
                .with_source_path(r"C:\Users\Alice\Files\b.txt"),
        ],
        262_144,
    )
    .expect("manifest");
    let message = ChatBody {
        message_id: "source-hydrate-1".to_string(),
        conversation_id: "direct:sender:receiver".to_string(),
        sender_id: "sender".to_string(),
        recipients: vec!["receiver".to_string()],
        signature: Vec::new(),
        quote: None,
        attachments: vec![MessageAttachment::transfer(manifest.clone())],
        body: "files".to_string(),
        created_at: 1_700_000_430,
    };

    store
        .upsert_transfer(&message.conversation_id, &manifest, "indexed", 0)
        .expect("transfer saved");
    store.enqueue_outbox(&message).expect("message saved");

    let chat_body = store
        .get_chat_body(&message.message_id)
        .expect("chat body lookup")
        .expect("chat body exists");
    let chat_message = store
        .get_message(&message.message_id)
        .expect("message lookup")
        .expect("message exists");

    assert_eq!(
        chat_body.attachments[0].manifest.files[0].source_path,
        r"C:\Users\Alice\Files\a.txt"
    );
    assert_eq!(
        chat_message.attachments[0].manifest.files[1].source_path,
        r"C:\Users\Alice\Files\b.txt"
    );
}

#[test]
fn encrypted_store_persists_resumable_local_transfer_authorizations() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "transfer-restore-auth".to_string(),
        vec![
            FileEntry::new("folder/a.txt".to_string(), 5, "a".repeat(64))
                .with_relative_path("folder/a.txt")
                .with_source_path(r"C:\Users\Alice\Files\a.txt"),
        ],
        262_144,
    )
    .expect("manifest");
    let mut authorizations = HashMap::new();
    authorizations.insert("peer-a".to_string(), vec![1, 2, 3, 4]);

    store
        .upsert_transfer("direct:sender:peer-a", &manifest, "indexed", 0)
        .expect("transfer saved");
    store
        .save_transfer_authorizations(&manifest.transfer_id, &authorizations)
        .expect("authorizations saved");

    let offers = store
        .list_resumable_local_transfer_offers(10)
        .expect("resumable transfer offers listed");

    assert_eq!(offers.len(), 1);
    assert_eq!(offers[0].0.transfer_id, manifest.transfer_id);
    assert_eq!(
        offers[0].0.files[0].source_path,
        r"C:\Users\Alice\Files\a.txt"
    );
    assert_eq!(offers[0].1.get("peer-a"), Some(&vec![1, 2, 3, 4]));
}

#[test]
fn blocking_peer_removes_local_transfer_authorizations_for_that_peer() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let manifest = TransferManifest::from_entries(
        "transfer-block-auth".to_string(),
        vec![
            FileEntry::new("folder/a.txt".to_string(), 5, "a".repeat(64))
                .with_relative_path("folder/a.txt")
                .with_source_path(r"C:\Users\Alice\Files\a.txt"),
        ],
        262_144,
    )
    .expect("manifest");
    let mut authorizations = HashMap::new();
    authorizations.insert("peer-a".to_string(), vec![1, 2, 3, 4]);
    authorizations.insert("peer-b".to_string(), vec![5, 6, 7, 8]);

    store
        .upsert_transfer("group:ops", &manifest, "indexed", 0)
        .expect("transfer saved");
    store
        .save_transfer_authorizations(&manifest.transfer_id, &authorizations)
        .expect("authorizations saved");
    store
        .update_contact_metadata("peer-a", "", "", false, true)
        .expect("peer blocked");

    let offers = store
        .list_resumable_local_transfer_offers(10)
        .expect("resumable transfer offers listed");

    assert_eq!(offers.len(), 1);
    assert!(!offers[0].1.contains_key("peer-a"));
    assert_eq!(offers[0].1.get("peer-b"), Some(&vec![5, 6, 7, 8]));
}

#[test]
fn resumable_local_transfer_authorizations_ignore_blocked_legacy_rows() {
    let store = EncryptedStore::open_memory_with_key("unit-test-key").expect("store opens");
    let shared_manifest = TransferManifest::from_entries(
        "transfer-blocked-legacy-shared".to_string(),
        vec![
            FileEntry::new("shared/a.txt".to_string(), 5, "a".repeat(64))
                .with_relative_path("shared/a.txt")
                .with_source_path(r"C:\Users\Alice\Files\shared-a.txt"),
        ],
        262_144,
    )
    .expect("shared manifest");
    let blocked_only_manifest = TransferManifest::from_entries(
        "transfer-blocked-legacy-only".to_string(),
        vec![FileEntry::new("only/a.txt".to_string(), 5, "b".repeat(64))
            .with_relative_path("only/a.txt")
            .with_source_path(r"C:\Users\Alice\Files\only-a.txt")],
        262_144,
    )
    .expect("blocked-only manifest");

    store
        .update_contact_metadata("peer-a", "", "", false, true)
        .expect("peer blocked");
    store
        .upsert_transfer("group:ops", &shared_manifest, "indexed", 0)
        .expect("shared transfer saved");
    store
        .save_transfer_authorizations(
            &shared_manifest.transfer_id,
            &HashMap::from([
                ("peer-a".to_string(), vec![1, 2, 3, 4]),
                ("peer-b".to_string(), vec![5, 6, 7, 8]),
            ]),
        )
        .expect("shared authorizations saved");
    store
        .upsert_transfer("direct:peer-a", &blocked_only_manifest, "indexed", 0)
        .expect("blocked-only transfer saved");
    store
        .save_transfer_authorizations(
            &blocked_only_manifest.transfer_id,
            &HashMap::from([("peer-a".to_string(), vec![9, 10, 11, 12])]),
        )
        .expect("blocked-only authorizations saved");

    let offers = store
        .list_resumable_local_transfer_offers(10)
        .expect("resumable transfer offers listed");
    let local_offer = store
        .local_transfer_offer(&shared_manifest.transfer_id)
        .expect("local offer loaded")
        .expect("shared offer exists");

    assert_eq!(offers.len(), 1);
    assert_eq!(offers[0].0.transfer_id, shared_manifest.transfer_id);
    assert!(!offers[0].1.contains_key("peer-a"));
    assert_eq!(offers[0].1.get("peer-b"), Some(&vec![5, 6, 7, 8]));
    assert!(!local_offer.2.contains_key("peer-a"));
    assert_eq!(local_offer.2.get("peer-b"), Some(&vec![5, 6, 7, 8]));
}
