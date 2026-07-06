use std::collections::{BTreeSet, HashMap};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::file_transfer::{
    download_manifest_from_peer, manifest_sources_available, FILE_TRANSFER_PORT,
};
use crate::identity::{fingerprint_for_public_key, verify_signature, DeviceIdentity};
#[cfg(feature = "quic")]
use crate::protocol::ProtocolFrame;
use crate::protocol::{
    AckFrame, ChatBody, ChatMessage, GroupInviteFrame, MessageReactionFrame, MessageRevokeFrame,
    MessageStatus, NudgeFrame, ReadReceiptFrame, TransferAnnouncementFrame, TransferManifest,
    TypingFrame, DISCOVERY_PORT, QUIC_PORT,
};
use crate::transport::QuicTransport;
use crate::AppState;

pub const DISCOVERY_MULTICAST_ADDR: Ipv4Addr = Ipv4Addr::new(239, 242, 50, 1);
pub const MAX_DISCOVERY_PACKET_BYTES: usize = 65_507;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeerStatus {
    Online,
    Away,
    Offline,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerProfile {
    pub peer_id: String,
    pub display_name: String,
    pub hostname: String,
    pub avatar_hash: Option<String>,
    pub status: PeerStatus,
    pub endpoints: Vec<String>,
    pub fingerprint: String,
    #[serde(default)]
    pub public_key: Vec<u8>,
}

impl PeerProfile {
    pub fn from_identity(identity: &DeviceIdentity, status: PeerStatus) -> Self {
        Self {
            peer_id: identity.peer_id().to_string(),
            display_name: identity.display_name().to_string(),
            hostname: identity.hostname().to_string(),
            avatar_hash: None,
            status,
            endpoints: vec![format!("0.0.0.0:{QUIC_PORT}")],
            fingerprint: identity.fingerprint().to_string(),
            public_key: identity.public_identity().public_key,
        }
    }
}

pub fn validate_peer_profile_identity(profile: &PeerProfile) -> Result<(), String> {
    let peer_id = profile.peer_id.trim();
    let fingerprint = profile.fingerprint.trim();
    if peer_id.is_empty() {
        return Err("peer id is required".to_string());
    }
    if fingerprint.is_empty() {
        return Err("peer fingerprint is required".to_string());
    }
    let derived = fingerprint_for_public_key(&profile.public_key)
        .ok_or_else(|| "peer public key is invalid".to_string())?;
    if fingerprint != derived {
        return Err("peer fingerprint does not match public key".to_string());
    }
    if peer_id != derived {
        return Err("peer id does not match public key fingerprint".to_string());
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkSettings {
    #[serde(default = "default_auto_discovery")]
    pub auto_discovery: bool,
    #[serde(default = "default_multicast")]
    pub multicast: bool,
    #[serde(default)]
    pub seed_peers: Vec<String>,
    #[serde(default)]
    pub scan_ranges: Vec<String>,
    #[serde(default = "default_discovery_interval_secs")]
    pub discovery_interval_secs: u64,
    #[serde(default = "default_peer_ttl_secs")]
    pub peer_ttl_secs: u64,
}

fn default_auto_discovery() -> bool {
    true
}

fn default_multicast() -> bool {
    true
}

fn default_discovery_interval_secs() -> u64 {
    3
}

fn default_peer_ttl_secs() -> u64 {
    15
}

impl Default for NetworkSettings {
    fn default() -> Self {
        Self {
            auto_discovery: true,
            multicast: true,
            seed_peers: Vec::new(),
            scan_ranges: Vec::new(),
            discovery_interval_secs: default_discovery_interval_secs(),
            peer_ttl_secs: default_peer_ttl_secs(),
        }
    }
}

pub fn normalize_network_settings(settings: NetworkSettings) -> NetworkSettings {
    NetworkSettings {
        auto_discovery: settings.auto_discovery,
        multicast: settings.multicast,
        seed_peers: normalized_seed_peers(&settings.seed_peers),
        scan_ranges: normalized_scan_ranges(&settings.scan_ranges),
        discovery_interval_secs: settings.discovery_interval_secs.clamp(1, 60),
        peer_ttl_secs: settings.peer_ttl_secs.clamp(5, 600),
    }
}

fn normalized_seed_peers(values: &[String]) -> Vec<String> {
    let mut peers = BTreeSet::new();
    for value in values {
        if let Some(ip) = configured_private_unicast_ipv4(value) {
            peers.insert(ip.to_string());
        }
    }
    peers.into_iter().collect()
}

fn normalized_scan_ranges(values: &[String]) -> Vec<String> {
    let mut ranges = BTreeSet::new();
    for value in values {
        if let Some(range) = normalize_scan_range(value) {
            ranges.insert(range);
        }
    }
    ranges.into_iter().collect()
}

fn normalize_scan_range(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let Some((base, prefix)) = trimmed.split_once('/') else {
        return configured_private_unicast_ipv4(trimmed).map(|ip| ip.to_string());
    };
    let ip = base.parse::<Ipv4Addr>().ok()?;
    let prefix = prefix.parse::<u32>().ok()?;
    if prefix > 32 {
        return None;
    }
    if !is_private_unicast_ipv4(ip) {
        return None;
    }
    if scan_range_hosts(trimmed, 1025).len() > 1024 {
        return None;
    }
    Some(format!("{}/{}", canonical_network_ipv4(ip, prefix), prefix))
}

pub fn peer_is_stale(now_millis: i64, last_seen_millis: i64, ttl_millis: i64) -> bool {
    now_millis.saturating_sub(last_seen_millis) > ttl_millis
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_network_settings_clamps_timing_and_deduplicates_targets() {
        let normalized = normalize_network_settings(NetworkSettings {
            auto_discovery: true,
            multicast: true,
            seed_peers: vec![
                "192.168.1.20:24251".to_string(),
                "192.168.1.20".to_string(),
                "not-an-ip".to_string(),
            ],
            scan_ranges: vec![
                "192.168.1.0/24".to_string(),
                "192.168.1.0/24".to_string(),
                "10.0.0.0/8".to_string(),
            ],
            discovery_interval_secs: 0,
            peer_ttl_secs: 2,
        });

        assert_eq!(normalized.seed_peers, vec!["192.168.1.20"]);
        assert_eq!(normalized.scan_ranges, vec!["192.168.1.0/24"]);
        assert_eq!(normalized.discovery_interval_secs, 1);
        assert_eq!(normalized.peer_ttl_secs, 5);
    }

    #[test]
    fn network_settings_deserializes_legacy_saved_values() {
        let settings: NetworkSettings = serde_json::from_str(
            r#"{"auto_discovery":true,"multicast":true,"seed_peers":[],"scan_ranges":[]}"#,
        )
        .expect("legacy network settings should deserialize");

        assert_eq!(
            settings.discovery_interval_secs,
            default_discovery_interval_secs()
        );
        assert_eq!(settings.peer_ttl_secs, default_peer_ttl_secs());
    }

    #[test]
    fn discovery_targets_include_seed_peers_and_scan_ranges_without_multicast() {
        let targets = discovery_targets(&NetworkSettings {
            auto_discovery: true,
            multicast: false,
            seed_peers: vec!["192.168.1.20:24251".to_string()],
            scan_ranges: vec!["192.168.1.8/30".to_string()],
            discovery_interval_secs: 3,
            peer_ttl_secs: 15,
        });

        assert!(targets.contains(&SocketAddrV4::new(
            Ipv4Addr::new(192, 168, 1, 20),
            DISCOVERY_PORT
        )));
        assert!(targets.contains(&SocketAddrV4::new(
            Ipv4Addr::new(192, 168, 1, 9),
            DISCOVERY_PORT
        )));
        assert!(targets.contains(&SocketAddrV4::new(
            Ipv4Addr::new(192, 168, 1, 10),
            DISCOVERY_PORT
        )));
        assert!(!targets.contains(&SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT)));
        assert!(!targets.contains(&SocketAddrV4::new(DISCOVERY_MULTICAST_ADDR, DISCOVERY_PORT)));
    }

    #[test]
    fn discovery_packet_limit_accepts_folder_transfer_manifests_larger_than_legacy_buffer() {
        let files = (0..90)
            .map(|index| {
                crate::protocol::FileEntry::new(
                    format!("folder/subfolder-{index:02}/design-document-{index:02}.md"),
                    512,
                    "a".repeat(64),
                )
            })
            .collect::<Vec<_>>();
        let manifest =
            TransferManifest::from_entries("folder-transfer".to_string(), files, 256 * 1024)
                .expect("manifest is valid");
        let packet = DiscoveryPacket::Transfer {
            conversation_id: "direct:sender:receiver".to_string(),
            sender_id: "sender".to_string(),
            recipients: vec!["receiver".to_string()],
            signature: vec![7; 64],
            manifest,
        };

        let encoded = packet.encode().expect("packet encodes");

        assert!(encoded.len() > 4096);
        assert!(encoded.len() <= MAX_DISCOVERY_PACKET_BYTES);
    }

    #[test]
    fn nudge_discovery_packet_round_trips_with_kind() {
        let packet = DiscoveryPacket::Nudge {
            conversation_id: "direct:sender:receiver".to_string(),
            sender_id: "sender".to_string(),
            recipients: vec!["receiver".to_string()],
            nudged_at: 1_700_000_000_222,
            signature: vec![9; 64],
        };

        let encoded = packet.encode().expect("packet encodes");
        let decoded = DiscoveryPacket::decode(&encoded).expect("packet decodes");

        assert_eq!(decoded.kind(), "nudge");
        assert_eq!(decoded, packet);
    }

    #[test]
    fn discovery_send_outcome_allows_partial_target_failures() {
        let result = ensure_discovery_packet_delivered(&[
            SendOutcome::Failed("192.168.1.10:24250: unreachable".to_string()),
            SendOutcome::Sent,
        ]);

        assert!(result.is_ok());
    }

    #[test]
    fn discovery_send_outcome_fails_only_when_all_targets_fail() {
        let error = ensure_discovery_packet_delivered(&[
            SendOutcome::Failed("192.168.1.10:24250: unreachable".to_string()),
            SendOutcome::Failed("192.168.1.11:24250: refused".to_string()),
        ])
        .expect_err("all failed targets should be reported");

        let error = error.to_string();
        assert!(error.contains("failed to send discovery packet to any target"));
        assert!(error.contains("192.168.1.10:24250"));
        assert!(error.contains("192.168.1.11:24250"));
    }
}

pub fn normalize_peer_endpoints(mut profile: PeerProfile, source: SocketAddr) -> PeerProfile {
    let source_ip = match source.ip() {
        IpAddr::V4(ip) => ip.to_string(),
        IpAddr::V6(ip) => ip.to_string(),
    };
    if profile.endpoints.is_empty()
        || profile
            .endpoints
            .iter()
            .any(|endpoint| endpoint.starts_with("0.0.0.0:") || endpoint.starts_with("[::]:"))
    {
        profile.endpoints = vec![format!("{source_ip}:{QUIC_PORT}")];
    }
    profile
}

pub fn beacon_reply_target(source: SocketAddr, already_reachable: bool) -> Option<SocketAddrV4> {
    if already_reachable {
        return None;
    }
    match source {
        SocketAddr::V4(address) if !address.ip().is_unspecified() => Some(address),
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DiscoveryPacket {
    Beacon {
        profile: PeerProfile,
    },
    Chat {
        message: ChatBody,
    },
    Ack {
        ack: AckFrame,
    },
    GroupInvite {
        conversation_id: String,
        name: String,
        #[serde(default)]
        announcement: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        #[serde(default)]
        member_peer_ids: Vec<String>,
        #[serde(default)]
        signature: Vec<u8>,
    },
    Typing {
        conversation_id: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        active: bool,
        updated_at: i64,
        #[serde(default)]
        signature: Vec<u8>,
    },
    Nudge {
        conversation_id: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        nudged_at: i64,
        #[serde(default)]
        signature: Vec<u8>,
    },
    ReadReceipt {
        conversation_id: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        #[serde(default)]
        message_ids: Vec<String>,
        read_at: i64,
        #[serde(default)]
        signature: Vec<u8>,
    },
    MessageRevoke {
        conversation_id: String,
        message_id: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        revoked_at: i64,
        #[serde(default)]
        signature: Vec<u8>,
    },
    MessageReaction {
        conversation_id: String,
        message_id: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        reaction: String,
        active: bool,
        reacted_at: i64,
        #[serde(default)]
        signature: Vec<u8>,
    },
    Transfer {
        conversation_id: String,
        sender_id: String,
        #[serde(default)]
        recipients: Vec<String>,
        #[serde(default)]
        signature: Vec<u8>,
        manifest: TransferManifest,
    },
}

impl DiscoveryPacket {
    pub fn encode(&self) -> anyhow::Result<Vec<u8>> {
        let envelope = DiscoveryEnvelope {
            protocol: "iim.lan/1".to_string(),
            packet: self.clone(),
        };
        Ok(serde_json::to_vec(&envelope)?)
    }

    pub fn decode(bytes: &[u8]) -> anyhow::Result<Self> {
        let envelope: DiscoveryEnvelope = serde_json::from_slice(bytes)?;
        anyhow::ensure!(
            envelope.protocol == "iim.lan/1",
            "unsupported discovery protocol"
        );
        Ok(envelope.packet)
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::Beacon { .. } => "beacon",
            Self::Chat { .. } => "chat",
            Self::Ack { .. } => "ack",
            Self::GroupInvite { .. } => "group_invite",
            Self::Typing { .. } => "typing",
            Self::Nudge { .. } => "nudge",
            Self::ReadReceipt { .. } => "read_receipt",
            Self::MessageRevoke { .. } => "message_revoke",
            Self::MessageReaction { .. } => "message_reaction",
            Self::Transfer { .. } => "transfer",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DiscoveryEnvelope {
    protocol: String,
    packet: DiscoveryPacket,
}

pub fn discovery_targets(settings: &NetworkSettings) -> Vec<SocketAddrV4> {
    let mut targets = BTreeSet::new();
    if settings.multicast {
        targets.insert((Ipv4Addr::BROADCAST, DISCOVERY_PORT));
        targets.insert((DISCOVERY_MULTICAST_ADDR, DISCOVERY_PORT));
    }
    for seed in &settings.seed_peers {
        if let Some(ip) = configured_ipv4(seed) {
            targets.insert((ip, DISCOVERY_PORT));
        }
    }
    for range in &settings.scan_ranges {
        for ip in scan_range_hosts(range, 1024) {
            targets.insert((ip, DISCOVERY_PORT));
        }
    }
    targets
        .into_iter()
        .map(|(ip, port)| SocketAddrV4::new(ip, port))
        .collect()
}

fn configured_ipv4(value: &str) -> Option<Ipv4Addr> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(SocketAddr::V4(address)) = trimmed.parse::<SocketAddr>() {
        return Some(*address.ip());
    }
    if let Ok(IpAddr::V4(ip)) = trimmed.parse::<IpAddr>() {
        return Some(ip);
    }
    trimmed
        .split_once(':')
        .and_then(|(host, _)| host.parse::<Ipv4Addr>().ok())
}

fn configured_private_unicast_ipv4(value: &str) -> Option<Ipv4Addr> {
    configured_ipv4(value).filter(|ip| is_private_unicast_ipv4(*ip))
}

fn is_private_unicast_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
}

fn canonical_network_ipv4(ip: Ipv4Addr, prefix: u32) -> Ipv4Addr {
    if prefix == 0 {
        return Ipv4Addr::UNSPECIFIED;
    }
    let mask = u32::MAX << (32 - prefix);
    Ipv4Addr::from(u32::from(ip) & mask)
}

fn scan_range_hosts(value: &str, max_hosts: usize) -> Vec<Ipv4Addr> {
    let trimmed = value.trim();
    if trimmed.is_empty() || max_hosts == 0 {
        return Vec::new();
    }
    let Some((base, prefix)) = trimmed.split_once('/') else {
        return configured_ipv4(trimmed).into_iter().collect();
    };
    let Ok(ip) = base.parse::<Ipv4Addr>() else {
        return Vec::new();
    };
    let Ok(prefix) = prefix.parse::<u32>() else {
        return Vec::new();
    };
    if prefix > 32 {
        return Vec::new();
    }

    let host_bits = 32 - prefix;
    let size = if host_bits == 32 {
        u64::from(u32::MAX) + 1
    } else {
        1u64 << host_bits
    };
    let mask = if prefix == 0 {
        0
    } else {
        u32::MAX << host_bits
    };
    let network = u64::from(u32::from(ip) & mask);
    let first = if size > 2 { network + 1 } else { network };
    let last = if size > 2 {
        network.saturating_add(size).saturating_sub(2)
    } else {
        network.saturating_add(size).saturating_sub(1)
    };

    (first..=last)
        .take(max_hosts)
        .map(|value| Ipv4Addr::from(value as u32))
        .collect()
}

#[derive(Debug, PartialEq, Eq)]
enum SendOutcome {
    Sent,
    Failed(String),
}

fn ensure_discovery_packet_delivered(outcomes: &[SendOutcome]) -> anyhow::Result<()> {
    anyhow::ensure!(!outcomes.is_empty(), "no discovery targets configured");
    if outcomes
        .iter()
        .any(|outcome| matches!(outcome, SendOutcome::Sent))
    {
        return Ok(());
    }
    let details = outcomes
        .iter()
        .filter_map(|outcome| match outcome {
            SendOutcome::Failed(error) => Some(error.as_str()),
            SendOutcome::Sent => None,
        })
        .collect::<Vec<_>>()
        .join("; ");
    anyhow::bail!(
        "failed to send discovery packet to any target{}",
        if details.is_empty() {
            String::new()
        } else {
            format!(": {details}")
        }
    );
}

fn send_packet(packet: DiscoveryPacket, targets: &[SocketAddrV4]) -> anyhow::Result<()> {
    anyhow::ensure!(!targets.is_empty(), "no discovery targets configured");
    let socket = UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, 0))?;
    socket.set_broadcast(true)?;
    let _ = socket.set_multicast_ttl_v4(1);
    let payload = packet.encode()?;
    anyhow::ensure!(
        payload.len() <= MAX_DISCOVERY_PACKET_BYTES,
        "discovery packet exceeds UDP payload limit"
    );
    let mut outcomes = Vec::with_capacity(targets.len());
    for target in targets {
        match socket.send_to(&payload, target) {
            Ok(_) => outcomes.push(SendOutcome::Sent),
            Err(error) => outcomes.push(SendOutcome::Failed(format!("{target}: {error}"))),
        }
    }
    ensure_discovery_packet_delivered(&outcomes)
}

pub fn broadcast_chat(message: &ChatBody) -> anyhow::Result<()> {
    broadcast_chat_with_settings(message, &NetworkSettings::default())
}

pub fn broadcast_beacon_with_settings(
    profile: &PeerProfile,
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    if !settings.auto_discovery {
        return Ok(());
    }
    send_packet(
        DiscoveryPacket::Beacon {
            profile: profile.clone(),
        },
        &discovery_targets(settings),
    )
}

pub fn broadcast_chat_with_settings(
    message: &ChatBody,
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::Chat {
            message: message.clone(),
        },
        &discovery_targets(settings),
    )
}

pub fn send_ack_to(
    message: &ChatBody,
    source: SocketAddr,
    identity: &DeviceIdentity,
) -> anyhow::Result<()> {
    let target_ip = match source.ip() {
        IpAddr::V4(ip) => ip,
        IpAddr::V6(_) => Ipv4Addr::LOCALHOST,
    };
    send_packet(
        DiscoveryPacket::Ack {
            ack: ack_frame_for_message(message, identity),
        },
        &[SocketAddrV4::new(target_ip, DISCOVERY_PORT)],
    )
}

pub fn broadcast_ack(message: &ChatBody) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::Ack {
            ack: unsigned_ack_frame_for_message(message),
        },
        &discovery_targets(&NetworkSettings::default()),
    )
}

pub fn broadcast_transfer(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    signature: &[u8],
    manifest: &TransferManifest,
) -> anyhow::Result<()> {
    broadcast_transfer_with_settings(
        conversation_id,
        sender_id,
        recipients,
        signature,
        manifest,
        &NetworkSettings::default(),
    )
}

pub fn broadcast_group_invite_with_settings(
    conversation_id: &str,
    name: &str,
    announcement: &str,
    sender_id: &str,
    recipients: &[String],
    member_peer_ids: &[String],
    signature: &[u8],
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::GroupInvite {
            conversation_id: conversation_id.to_string(),
            name: name.to_string(),
            announcement: announcement.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            member_peer_ids: member_peer_ids.to_vec(),
            signature: signature.to_vec(),
        },
        &discovery_targets(settings),
    )
}

pub fn group_invite_signing_payload(
    conversation_id: &str,
    name: &str,
    announcement: &str,
    sender_id: &str,
    recipients: &[String],
    member_peer_ids: &[String],
) -> Vec<u8> {
    GroupInviteFrame {
        conversation_id: conversation_id.to_string(),
        name: name.to_string(),
        announcement: announcement.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        member_peer_ids: member_peer_ids.to_vec(),
        signature: Vec::new(),
    }
    .signing_payload()
}

pub fn broadcast_transfer_with_settings(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    signature: &[u8],
    manifest: &TransferManifest,
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::Transfer {
            conversation_id: conversation_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            signature: signature.to_vec(),
            manifest: manifest.clone(),
        },
        &discovery_targets(settings),
    )
}

pub fn transfer_announcement_signing_payload(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    manifest: &TransferManifest,
) -> Vec<u8> {
    TransferAnnouncementFrame {
        conversation_id: conversation_id.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        signature: Vec::new(),
        manifest: manifest.clone(),
    }
    .signing_payload()
}

pub fn broadcast_typing_with_settings(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    active: bool,
    updated_at: i64,
    signature: &[u8],
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::Typing {
            conversation_id: conversation_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            active,
            updated_at,
            signature: signature.to_vec(),
        },
        &discovery_targets(settings),
    )
}

pub fn typing_signing_payload(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    active: bool,
    updated_at: i64,
) -> Vec<u8> {
    TypingFrame {
        conversation_id: conversation_id.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        active,
        updated_at,
        signature: Vec::new(),
    }
    .signing_payload()
}

pub fn broadcast_nudge_with_settings(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    nudged_at: i64,
    signature: &[u8],
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::Nudge {
            conversation_id: conversation_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            nudged_at,
            signature: signature.to_vec(),
        },
        &discovery_targets(settings),
    )
}

pub fn nudge_signing_payload(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    nudged_at: i64,
) -> Vec<u8> {
    NudgeFrame {
        conversation_id: conversation_id.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        nudged_at,
        signature: Vec::new(),
    }
    .signing_payload()
}

pub fn broadcast_read_receipt_with_settings(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    message_ids: &[String],
    read_at: i64,
    signature: &[u8],
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::ReadReceipt {
            conversation_id: conversation_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            message_ids: message_ids.to_vec(),
            read_at,
            signature: signature.to_vec(),
        },
        &discovery_targets(settings),
    )
}

pub fn read_receipt_signing_payload(
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    message_ids: &[String],
    read_at: i64,
) -> Vec<u8> {
    ReadReceiptFrame {
        conversation_id: conversation_id.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        message_ids: message_ids.to_vec(),
        read_at,
        signature: Vec::new(),
    }
    .signing_payload()
}

pub fn broadcast_message_revoke_with_settings(
    conversation_id: &str,
    message_id: &str,
    sender_id: &str,
    recipients: &[String],
    revoked_at: i64,
    signature: &[u8],
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::MessageRevoke {
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            revoked_at,
            signature: signature.to_vec(),
        },
        &discovery_targets(settings),
    )
}

pub fn message_revoke_signing_payload(
    conversation_id: &str,
    message_id: &str,
    sender_id: &str,
    recipients: &[String],
    revoked_at: i64,
) -> Vec<u8> {
    MessageRevokeFrame {
        conversation_id: conversation_id.to_string(),
        message_id: message_id.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        revoked_at,
        signature: Vec::new(),
    }
    .signing_payload()
}

pub fn broadcast_message_reaction_with_settings(
    conversation_id: &str,
    message_id: &str,
    sender_id: &str,
    recipients: &[String],
    reaction: &str,
    active: bool,
    reacted_at: i64,
    signature: &[u8],
    settings: &NetworkSettings,
) -> anyhow::Result<()> {
    send_packet(
        DiscoveryPacket::MessageReaction {
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            sender_id: sender_id.to_string(),
            recipients: recipients.to_vec(),
            reaction: reaction.to_string(),
            active,
            reacted_at,
            signature: signature.to_vec(),
        },
        &discovery_targets(settings),
    )
}

pub fn message_reaction_signing_payload(
    conversation_id: &str,
    message_id: &str,
    sender_id: &str,
    recipients: &[String],
    reaction: &str,
    active: bool,
    reacted_at: i64,
) -> Vec<u8> {
    MessageReactionFrame {
        conversation_id: conversation_id.to_string(),
        message_id: message_id.to_string(),
        sender_id: sender_id.to_string(),
        recipients: recipients.to_vec(),
        reaction: reaction.to_string(),
        active,
        reacted_at,
        signature: Vec::new(),
    }
    .signing_payload()
}

pub fn validate_group_invite_members(
    self_peer_id: &str,
    sender_id: &str,
    recipients: &[String],
    member_peer_ids: &[String],
) -> Result<(), String> {
    let self_peer_id = self_peer_id.trim();
    let sender_id = sender_id.trim();
    if self_peer_id.is_empty() {
        return Err("local peer id is required".to_string());
    }
    if sender_id.is_empty() {
        return Err("sender peer id is required".to_string());
    }
    if !message_targets_peer(recipients, self_peer_id) {
        return Err("group invite does not target local peer".to_string());
    }
    if member_peer_ids
        .iter()
        .all(|peer_id| peer_id.trim() != self_peer_id)
    {
        return Err("group invite members do not include local peer".to_string());
    }
    if member_peer_ids
        .iter()
        .all(|peer_id| peer_id.trim() != sender_id)
    {
        return Err("group invite members do not include sender".to_string());
    }
    Ok(())
}

pub fn ack_frame_for_message(message: &ChatBody, identity: &DeviceIdentity) -> AckFrame {
    let mut ack = AckFrame {
        message_id: message.message_id.clone(),
        conversation_id: message.conversation_id.clone(),
        sender_id: identity.peer_id().to_string(),
        signature: Vec::new(),
        received_at: Utc::now().timestamp_millis(),
    };
    ack.signature = identity.sign(&ack.signing_payload());
    ack
}

pub fn unsigned_ack_frame_for_message(message: &ChatBody) -> AckFrame {
    AckFrame {
        message_id: message.message_id.clone(),
        conversation_id: message.conversation_id.clone(),
        sender_id: String::new(),
        signature: Vec::new(),
        received_at: Utc::now().timestamp_millis(),
    }
}

pub fn ack_targets_message(ack: &AckFrame, message: &ChatBody) -> bool {
    let ack_sender = ack.sender_id.trim();
    !ack_sender.is_empty()
        && ack.message_id.trim() == message.message_id.trim()
        && ack.conversation_id.trim() == message.conversation_id.trim()
        && message
            .recipients
            .iter()
            .any(|peer_id| peer_id.trim() == ack_sender)
}

pub fn spawn_background_discovery(app: AppHandle) {
    thread::spawn(move || {
        let transport = QuicTransport::default();
        let outbox_policy = transport.outbox_policy();
        let socket = match UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, DISCOVERY_PORT))
        {
            Ok(socket) => socket,
            Err(error) => {
                let _ = app.emit("network:warning", format!("Discovery bind failed: {error}"));
                return;
            }
        };
        configure_discovery_socket(&socket);
        let mut buffer = vec![0u8; MAX_DISCOVERY_PACKET_BYTES];

        loop {
            let mut discovery_interval = Duration::from_secs(default_discovery_interval_secs());
            let mut peer_offline_after = Duration::from_secs(default_peer_ttl_secs());
            if let Some(state) = app.try_state::<AppState>() {
                let settings = state.settings();
                discovery_interval = Duration::from_secs(settings.discovery_interval_secs);
                peer_offline_after = Duration::from_secs(settings.peer_ttl_secs);
                if settings.auto_discovery {
                    let profile = state.self_profile();
                    let packet = DiscoveryPacket::Beacon { profile };
                    if let Ok(payload) = packet.encode() {
                        for target in discovery_targets(&settings) {
                            let _ = socket.send_to(&payload, target);
                        }
                    }
                }
                if let Ok(failed) = state
                    .store()
                    .fail_exhausted_outbox(outbox_policy.max_attempts())
                {
                    for message in failed {
                        let _ = app.emit("message:status_changed", message);
                    }
                }
                if let Ok(pending) = state.store().list_retryable_outbox(
                    outbox_policy.batch_limit(),
                    outbox_policy.retry_after_millis(),
                    outbox_policy.max_attempts(),
                ) {
                    for mut message in pending {
                        let retry_ready = state
                            .store()
                            .prune_blocked_recipients_for_retry(&mut message, |payload| {
                                state.identity().sign(payload)
                            });
                        match retry_ready {
                            Ok(true) => {}
                            Ok(false) => {
                                if let Ok(Some(updated)) =
                                    state.store().get_message(&message.message_id)
                                {
                                    let _ = app.emit("message:status_changed", updated);
                                }
                                continue;
                            }
                            Err(error) => {
                                let _ = app.emit(
                                    "network:warning",
                                    format!("Outbox recipient pruning failed: {error}"),
                                );
                                continue;
                            }
                        }
                        if !prepare_pending_transfer_offers(&state, &message) {
                            continue;
                        }
                        #[cfg(feature = "quic")]
                        let quic_scheduled = spawn_quic_chat_delivery(app.clone(), message.clone());
                        #[cfg(not(feature = "quic"))]
                        let quic_scheduled = false;
                        let udp_sent = broadcast_chat_with_settings(&message, &settings).is_ok();
                        if quic_scheduled || udp_sent {
                            let _ = state.store().mark_sending(&message.message_id);
                            if let Ok(Some(updated)) =
                                state.store().get_message(&message.message_id)
                            {
                                let _ = app.emit("message:status_changed", updated);
                            }
                        }
                    }
                }
            }

            while let Ok((size, source)) = socket.recv_from(&mut buffer) {
                if let Ok(packet) = DiscoveryPacket::decode(&buffer[..size]) {
                    match packet {
                        DiscoveryPacket::Beacon { profile } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                if profile.peer_id != state.identity().peer_id() {
                                    let already_reachable = state
                                        .peer(&profile.peer_id)
                                        .map(|peer| peer.status != PeerStatus::Offline)
                                        .unwrap_or(false);
                                    let profile = normalize_peer_endpoints(profile, source);
                                    if peer_is_blocked(&state, &profile.peer_id) {
                                        continue;
                                    }
                                    if let Err(error) = validate_peer_profile_identity(&profile) {
                                        let _ = app.emit(
                                            "network:warning",
                                            format!(
                                                "Peer identity rejected for {}: {error}",
                                                profile.display_name
                                            ),
                                        );
                                        continue;
                                    }
                                    match state
                                        .store()
                                        .trust_peer(&profile.peer_id, &profile.fingerprint)
                                    {
                                        Ok(()) => {
                                            state.upsert_peer(profile.clone());
                                            let _ = app.emit("peer:upserted", profile);
                                            if let Some(target) =
                                                beacon_reply_target(source, already_reachable)
                                            {
                                                let reply = DiscoveryPacket::Beacon {
                                                    profile: state.self_profile(),
                                                };
                                                if let Ok(payload) = reply.encode() {
                                                    let _ = socket.send_to(&payload, target);
                                                }
                                            }
                                        }
                                        Err(error) => {
                                            let _ = app.emit(
                                                "network:warning",
                                                format!(
                                                    "Peer fingerprint rejected for {}: {error}",
                                                    profile.display_name
                                                ),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                        DiscoveryPacket::Chat { message } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                if message.sender_id != state.identity().peer_id()
                                    && message.targets_peer(state.identity().peer_id())
                                {
                                    if peer_is_blocked(&state, &message.sender_id) {
                                        continue;
                                    }
                                    if !conversation_id_targets_sender_and_peer(
                                        &message.conversation_id,
                                        state.identity().peer_id(),
                                        &message.sender_id,
                                    ) {
                                        let _ = app.emit(
                                            "network:warning",
                                            format!(
                                                "Message conversation rejected from {}",
                                                message.sender_id
                                            ),
                                        );
                                        continue;
                                    }
                                    if !verify_chat_signature(&state, &message) {
                                        let _ = app.emit(
                                            "network:warning",
                                            format!(
                                                "Message signature rejected from {}",
                                                message.sender_id
                                            ),
                                        );
                                        continue;
                                    }
                                    let inserted = state
                                        .store()
                                        .insert_incoming_once(&message)
                                        .unwrap_or(false);
                                    let _ = send_ack_to(&message, source, state.identity());
                                    if inserted {
                                        let chat =
                                            ChatMessage::from((message, MessageStatus::Received));
                                        let _ = app.emit("message:received", chat);
                                    }
                                }
                            }
                        }
                        DiscoveryPacket::Ack { ack } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                if peer_is_blocked(&state, &ack.sender_id) {
                                    continue;
                                }
                                if !verify_ack_frame(&state, &ack) {
                                    let _ = app.emit(
                                        "network:warning",
                                        format!("ACK rejected from {}", ack.sender_id),
                                    );
                                    continue;
                                }
                                if state
                                    .store()
                                    .mark_peer_acknowledged(&ack.message_id, &ack.sender_id)
                                    .is_ok()
                                {
                                    if let Ok(Some(message)) =
                                        state.store().get_message(&ack.message_id)
                                    {
                                        let _ = app.emit("message:status_changed", message);
                                    }
                                }
                            }
                        }
                        DiscoveryPacket::GroupInvite {
                            conversation_id,
                            name,
                            announcement,
                            sender_id,
                            recipients,
                            member_peer_ids,
                            signature,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                process_group_invite_frame(
                                    &app,
                                    &state,
                                    GroupInviteFrame {
                                        conversation_id,
                                        name,
                                        announcement,
                                        sender_id,
                                        recipients,
                                        member_peer_ids,
                                        signature,
                                    },
                                    "Group invite",
                                );
                            }
                        }
                        DiscoveryPacket::Transfer {
                            conversation_id,
                            sender_id,
                            recipients,
                            signature,
                            manifest,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                let peer = SocketAddr::new(source.ip(), FILE_TRANSFER_PORT);
                                process_transfer_announcement_frame(
                                    &app,
                                    &state,
                                    TransferAnnouncementFrame {
                                        conversation_id,
                                        sender_id,
                                        recipients,
                                        signature,
                                        manifest,
                                    },
                                    Some(peer),
                                    "Transfer announcement",
                                );
                            }
                        }
                        DiscoveryPacket::Typing {
                            conversation_id,
                            sender_id,
                            recipients,
                            active,
                            updated_at,
                            signature,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                process_typing_frame(
                                    &app,
                                    &state,
                                    TypingFrame {
                                        conversation_id,
                                        sender_id,
                                        recipients,
                                        active,
                                        updated_at,
                                        signature,
                                    },
                                    "Typing signal",
                                );
                            }
                        }
                        DiscoveryPacket::Nudge {
                            conversation_id,
                            sender_id,
                            recipients,
                            nudged_at,
                            signature,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                process_nudge_frame(
                                    &app,
                                    &state,
                                    NudgeFrame {
                                        conversation_id,
                                        sender_id,
                                        recipients,
                                        nudged_at,
                                        signature,
                                    },
                                    "Nudge signal",
                                );
                            }
                        }
                        DiscoveryPacket::ReadReceipt {
                            conversation_id,
                            sender_id,
                            recipients,
                            message_ids,
                            read_at,
                            signature,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                process_read_receipt_frame(
                                    &app,
                                    &state,
                                    ReadReceiptFrame {
                                        conversation_id,
                                        sender_id,
                                        recipients,
                                        message_ids,
                                        read_at,
                                        signature,
                                    },
                                    "Read receipt",
                                );
                            }
                        }
                        DiscoveryPacket::MessageRevoke {
                            conversation_id,
                            message_id,
                            sender_id,
                            recipients,
                            revoked_at,
                            signature,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                process_message_revoke_frame(
                                    &app,
                                    &state,
                                    MessageRevokeFrame {
                                        conversation_id,
                                        message_id,
                                        sender_id,
                                        recipients,
                                        revoked_at,
                                        signature,
                                    },
                                    "Message revoke",
                                );
                            }
                        }
                        DiscoveryPacket::MessageReaction {
                            conversation_id,
                            message_id,
                            sender_id,
                            recipients,
                            reaction,
                            active,
                            reacted_at,
                            signature,
                        } => {
                            if let Some(state) = app.try_state::<AppState>() {
                                process_message_reaction_frame(
                                    &app,
                                    &state,
                                    MessageReactionFrame {
                                        conversation_id,
                                        message_id,
                                        sender_id,
                                        recipients,
                                        reaction,
                                        active,
                                        reacted_at,
                                        signature,
                                    },
                                    "Message reaction",
                                );
                            }
                        }
                    }
                }
            }

            if let Some(state) = app.try_state::<AppState>() {
                for peer in state.mark_stale_peers_offline(peer_offline_after.as_millis() as i64) {
                    let _ = app.emit("peer:offline", peer);
                }
            }

            thread::sleep(discovery_interval);
        }
    });
}

fn prepare_pending_transfer_offers(state: &AppState, message: &ChatBody) -> bool {
    for attachment in &message.attachments {
        if attachment.kind != "transfer" {
            continue;
        }
        if !manifest_sources_available(&attachment.manifest) {
            return false;
        }
        let authorized_peers: HashMap<String, Vec<u8>> = message
            .recipients
            .iter()
            .filter_map(|peer_id| {
                state.peer(peer_id).and_then(|peer| {
                    (!peer.public_key.is_empty()).then_some((peer_id.clone(), peer.public_key))
                })
            })
            .collect();
        if authorized_peers.len() != message.recipients.len() {
            return false;
        }
        state
            .transfer_registry()
            .register_authorized(attachment.manifest.clone(), authorized_peers);
    }
    true
}

fn configure_discovery_socket(socket: &UdpSocket) {
    let _ = socket.set_broadcast(true);
    let _ = socket.set_multicast_ttl_v4(1);
    let _ = socket.join_multicast_v4(&DISCOVERY_MULTICAST_ADDR, &Ipv4Addr::UNSPECIFIED);
    let _ = socket.set_read_timeout(Some(Duration::from_millis(750)));
}

#[cfg(feature = "quic")]
pub fn spawn_quic_listener(app: AppHandle) {
    const MAX_QUIC_FRAME_SIZE: usize = 1024 * 1024;

    tauri::async_runtime::spawn(async move {
        loop {
            let Some(state) = app.try_state::<AppState>() else {
                tokio::time::sleep(Duration::from_millis(250)).await;
                continue;
            };
            let transport = state.transport().clone();
            drop(state);

            match transport.accept_frame(MAX_QUIC_FRAME_SIZE).await {
                Ok(frame) => handle_quic_frame(&app, frame).await,
                Err(error) => {
                    let _ = app.emit("network:warning", format!("QUIC receive failed: {error}"));
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    });
}

#[cfg(feature = "quic")]
pub fn spawn_quic_chat_delivery(app: AppHandle, message: ChatBody) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = quic_targets_for_message(&state, &message);
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::Chat(message);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_read_receipt_delivery(app: AppHandle, receipt: ReadReceiptFrame) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = receipt
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::ReadReceipt(receipt);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC read receipt send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_typing_delivery(app: AppHandle, typing: TypingFrame) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = typing
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::Typing(typing);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC typing send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_nudge_delivery(app: AppHandle, nudge: NudgeFrame) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = nudge
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::Nudge(nudge);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC nudge send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_message_revoke_delivery(app: AppHandle, revoke: MessageRevokeFrame) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = revoke
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::MessageRevoke(revoke);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC message revoke send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_message_reaction_delivery(
    app: AppHandle,
    reaction: MessageReactionFrame,
) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = reaction
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::MessageReaction(reaction);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC message reaction send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_group_invite_delivery(app: AppHandle, invite: GroupInviteFrame) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = invite
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::GroupInvite(invite);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC group invite send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
pub fn spawn_quic_transfer_announcement_delivery(
    app: AppHandle,
    transfer: TransferAnnouncementFrame,
) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    let transport = state.transport().clone();
    let targets = transfer
        .recipients
        .iter()
        .filter_map(|peer_id| state.peer(peer_id))
        .flat_map(|peer| quic_socket_addrs(&peer.endpoints))
        .collect::<Vec<_>>();
    drop(state);

    if targets.is_empty() {
        return false;
    }

    tauri::async_runtime::spawn(async move {
        let frame = ProtocolFrame::TransferAnnouncement(transfer);
        for endpoint in targets {
            if let Err(error) = transport.send_frame(endpoint, "localhost", &frame).await {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC transfer announcement send failed to {endpoint}: {error}"),
                );
            }
        }
    });
    true
}

#[cfg(feature = "quic")]
async fn handle_quic_frame(app: &AppHandle, received: crate::transport::ReceivedFrame) {
    match received.frame {
        ProtocolFrame::Chat(message) => {
            let ack_delivery = {
                let Some(state) = app.try_state::<AppState>() else {
                    return;
                };
                if message.sender_id == state.identity().peer_id()
                    || !message.targets_peer(state.identity().peer_id())
                {
                    return;
                }
                if peer_is_blocked(&state, &message.sender_id) {
                    return;
                }
                if !conversation_id_targets_sender_and_peer(
                    &message.conversation_id,
                    state.identity().peer_id(),
                    &message.sender_id,
                ) {
                    let _ = app.emit(
                        "network:warning",
                        format!(
                            "QUIC message conversation rejected from {}",
                            message.sender_id
                        ),
                    );
                    return;
                }
                if !verify_chat_signature(&state, &message) {
                    let _ = app.emit(
                        "network:warning",
                        format!("QUIC message signature rejected from {}", message.sender_id),
                    );
                    return;
                }

                let inserted = state
                    .store()
                    .insert_incoming_once(&message)
                    .unwrap_or(false);
                if inserted {
                    let chat = ChatMessage::from((message.clone(), MessageStatus::Received));
                    let _ = app.emit("message:received", chat);
                }

                let ack = ack_frame_for_message(&message, state.identity());
                let endpoints = state
                    .peer(&message.sender_id)
                    .map(|peer| quic_socket_addrs(&peer.endpoints))
                    .unwrap_or_default();
                (state.transport().clone(), endpoints, ack)
            };

            let (transport, endpoints, ack) = ack_delivery;
            for endpoint in endpoints {
                let _ = transport
                    .send_frame(endpoint, "localhost", &ProtocolFrame::Ack(ack.clone()))
                    .await;
            }
        }
        ProtocolFrame::Ack(ack) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            if peer_is_blocked(&state, &ack.sender_id) {
                return;
            }
            if !verify_ack_frame(&state, &ack) {
                let _ = app.emit(
                    "network:warning",
                    format!("QUIC ACK rejected from {}", ack.sender_id),
                );
                return;
            }
            if state
                .store()
                .mark_peer_acknowledged(&ack.message_id, &ack.sender_id)
                .is_ok()
            {
                if let Ok(Some(message)) = state.store().get_message(&ack.message_id) {
                    let _ = app.emit("message:status_changed", message);
                }
            }
        }
        ProtocolFrame::Typing(typing) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            process_typing_frame(app, &state, typing, "QUIC typing signal");
        }
        ProtocolFrame::Nudge(nudge) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            process_nudge_frame(app, &state, nudge, "QUIC nudge signal");
        }
        ProtocolFrame::ReadReceipt(receipt) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            process_read_receipt_frame(app, &state, receipt, "QUIC read receipt");
        }
        ProtocolFrame::GroupInvite(invite) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            process_group_invite_frame(app, &state, invite, "QUIC group invite");
        }
        ProtocolFrame::MessageRevoke(revoke) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            process_message_revoke_frame(app, &state, revoke, "QUIC message revoke");
        }
        ProtocolFrame::MessageReaction(reaction) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            process_message_reaction_frame(app, &state, reaction, "QUIC message reaction");
        }
        ProtocolFrame::TransferAnnouncement(transfer) => {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            let peer = received
                .endpoint
                .address
                .parse::<SocketAddr>()
                .ok()
                .map(|endpoint| SocketAddr::new(endpoint.ip(), FILE_TRANSFER_PORT));
            process_transfer_announcement_frame(
                app,
                &state,
                transfer,
                peer,
                "QUIC transfer announcement",
            );
        }
        ProtocolFrame::TransferManifest(manifest) => {
            let _ = app.emit(
                "network:warning",
                format!(
                    "QUIC transfer manifest {} arrived without conversation envelope",
                    manifest.transfer_id
                ),
            );
        }
    }
}

fn process_read_receipt_frame(
    app: &AppHandle,
    state: &AppState,
    receipt: ReadReceiptFrame,
    warning_label: &str,
) {
    if receipt.sender_id == state.identity().peer_id()
        || !message_targets_peer(&receipt.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &receipt.sender_id) {
        return;
    }
    if !verify_read_receipt_signature(
        state,
        &receipt.conversation_id,
        &receipt.sender_id,
        &receipt.recipients,
        &receipt.message_ids,
        receipt.read_at,
        &receipt.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!("{warning_label} rejected from {}", receipt.sender_id),
        );
        return;
    }
    for message_id in receipt.message_ids {
        if read_receipt_matches_message(
            state,
            &message_id,
            &receipt.conversation_id,
            &receipt.sender_id,
        ) && state.store().mark_read(&message_id).is_ok()
        {
            if let Ok(Some(message)) = state.store().get_message(&message_id) {
                let _ = app.emit("message:status_changed", message);
            }
        }
    }
}

fn process_typing_frame(
    app: &AppHandle,
    state: &AppState,
    typing: TypingFrame,
    warning_label: &str,
) {
    if typing.sender_id == state.identity().peer_id()
        || !message_targets_peer(&typing.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &typing.sender_id) {
        return;
    }
    if !conversation_id_targets_sender_and_peer(
        &typing.conversation_id,
        state.identity().peer_id(),
        &typing.sender_id,
    ) {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} conversation rejected from {}",
                typing.sender_id
            ),
        );
        return;
    }
    if !verify_typing_signature(
        state,
        &typing.conversation_id,
        &typing.sender_id,
        &typing.recipients,
        typing.active,
        typing.updated_at,
        &typing.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!("{warning_label} rejected from {}", typing.sender_id),
        );
        return;
    }
    let display_name = state
        .peer(&typing.sender_id)
        .map(|peer| peer.display_name)
        .unwrap_or_else(|| typing.sender_id.clone());
    let _ = app.emit(
        "typing:changed",
        serde_json::json!({
            "conversation_id": typing.conversation_id,
            "sender_id": typing.sender_id,
            "display_name": display_name,
            "active": typing.active,
            "updated_at": typing.updated_at
        }),
    );
}

fn process_nudge_frame(app: &AppHandle, state: &AppState, nudge: NudgeFrame, warning_label: &str) {
    if nudge.sender_id == state.identity().peer_id()
        || !message_targets_peer(&nudge.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &nudge.sender_id) {
        return;
    }
    if !conversation_id_targets_sender_and_peer(
        &nudge.conversation_id,
        state.identity().peer_id(),
        &nudge.sender_id,
    ) {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} conversation rejected from {}",
                nudge.sender_id
            ),
        );
        return;
    }
    if !verify_nudge_signature(
        state,
        &nudge.conversation_id,
        &nudge.sender_id,
        &nudge.recipients,
        nudge.nudged_at,
        &nudge.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!("{warning_label} rejected from {}", nudge.sender_id),
        );
        return;
    }
    let display_name = state
        .peer(&nudge.sender_id)
        .map(|peer| peer.display_name)
        .unwrap_or_else(|| nudge.sender_id.clone());
    let _ = app.emit(
        "nudge:received",
        serde_json::json!({
            "conversation_id": nudge.conversation_id,
            "sender_id": nudge.sender_id,
            "display_name": display_name,
            "nudged_at": nudge.nudged_at
        }),
    );
}

fn process_message_revoke_frame(
    app: &AppHandle,
    state: &AppState,
    revoke: MessageRevokeFrame,
    warning_label: &str,
) {
    if revoke.sender_id == state.identity().peer_id()
        || !message_targets_peer(&revoke.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &revoke.sender_id) {
        return;
    }
    if !verify_message_revoke_signature(
        state,
        &revoke.conversation_id,
        &revoke.message_id,
        &revoke.sender_id,
        &revoke.recipients,
        revoke.revoked_at,
        &revoke.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!("{warning_label} rejected from {}", revoke.sender_id),
        );
        return;
    }
    match state.store().revoke_message_in_conversation(
        &revoke.message_id,
        &revoke.conversation_id,
        &revoke.sender_id,
    ) {
        Ok(Some(message)) => {
            let _ = app.emit("message:status_changed", message);
        }
        Ok(None) => {}
        Err(error) => {
            let _ = app.emit(
                "network:warning",
                format!("Message revoke rejected for {}: {error}", revoke.message_id),
            );
        }
    }
}

fn process_message_reaction_frame(
    app: &AppHandle,
    state: &AppState,
    reaction: MessageReactionFrame,
    warning_label: &str,
) {
    if reaction.sender_id == state.identity().peer_id()
        || !message_targets_peer(&reaction.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &reaction.sender_id) {
        return;
    }
    if !verify_message_reaction_signature(
        state,
        &reaction.conversation_id,
        &reaction.message_id,
        &reaction.sender_id,
        &reaction.recipients,
        &reaction.reaction,
        reaction.active,
        reaction.reacted_at,
        &reaction.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!("{warning_label} rejected from {}", reaction.sender_id),
        );
        return;
    }
    match state.store().set_message_reaction(
        &reaction.message_id,
        &reaction.conversation_id,
        &reaction.sender_id,
        &reaction.reaction,
        reaction.active,
    ) {
        Ok(Some(message)) => {
            let _ = app.emit("message:status_changed", message);
        }
        Ok(None) => {}
        Err(error) => {
            let _ = app.emit(
                "network:warning",
                format!(
                    "Message reaction rejected for {}: {error}",
                    reaction.message_id
                ),
            );
        }
    }
}

fn process_group_invite_frame(
    app: &AppHandle,
    state: &AppState,
    invite: GroupInviteFrame,
    warning_label: &str,
) {
    if invite.sender_id == state.identity().peer_id()
        || !message_targets_peer(&invite.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &invite.sender_id) {
        return;
    }
    if !verify_group_invite_signature(
        state,
        &invite.conversation_id,
        &invite.name,
        &invite.announcement,
        &invite.sender_id,
        &invite.recipients,
        &invite.member_peer_ids,
        &invite.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} signature rejected from {}",
                invite.sender_id
            ),
        );
        return;
    }
    if let Err(error) = validate_group_invite_members(
        state.identity().peer_id(),
        &invite.sender_id,
        &invite.recipients,
        &invite.member_peer_ids,
    ) {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} membership rejected from {}: {error}",
                invite.sender_id
            ),
        );
        return;
    }
    if state
        .store()
        .upsert_group_conversation(
            &invite.conversation_id,
            &invite.name,
            &invite.announcement,
            &invite.member_peer_ids,
        )
        .is_ok()
    {
        if let Ok(Some(summary)) = state.store().conversation_summary(&invite.conversation_id) {
            let _ = app.emit("conversation:upserted", summary);
        }
    }
}

fn process_transfer_announcement_frame(
    app: &AppHandle,
    state: &AppState,
    transfer: TransferAnnouncementFrame,
    peer: Option<SocketAddr>,
    warning_label: &str,
) {
    if transfer.sender_id == state.identity().peer_id()
        || !message_targets_peer(&transfer.recipients, state.identity().peer_id())
    {
        return;
    }
    if peer_is_blocked(state, &transfer.sender_id) {
        return;
    }
    if !conversation_id_targets_sender_and_peer(
        &transfer.conversation_id,
        state.identity().peer_id(),
        &transfer.sender_id,
    ) {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} conversation rejected from {}",
                transfer.sender_id
            ),
        );
        return;
    }
    if let Err(error) = transfer.manifest.validate() {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} manifest rejected from {}: {error}",
                transfer.sender_id
            ),
        );
        return;
    }
    if !verify_transfer_announcement_signature(
        state,
        &transfer.conversation_id,
        &transfer.sender_id,
        &transfer.recipients,
        &transfer.manifest,
        &transfer.signature,
    ) {
        let _ = app.emit(
            "network:warning",
            format!(
                "{warning_label} signature rejected from {}",
                transfer.sender_id
            ),
        );
        return;
    }
    let _ = state.store().upsert_transfer(
        &transfer.conversation_id,
        &transfer.manifest,
        "manifest_received",
        0,
    );
    let download_started = state
        .store()
        .begin_transfer_download(&transfer.manifest.transfer_id)
        .unwrap_or(false);
    if download_started {
        if let Some(peer) = peer.or_else(|| transfer_source_peer(state, &transfer.sender_id)) {
            download_manifest_from_peer(peer, &transfer.manifest, app, &transfer.conversation_id);
        }
    }
    let _ = app.emit(
        "transfer:progress",
        serde_json::json!({
            "conversation_id": transfer.conversation_id,
            "transfer_id": transfer.manifest.transfer_id,
            "sent_bytes": transfer.manifest.total_bytes,
            "total_bytes": transfer.manifest.total_bytes,
            "status": if download_started { "downloading" } else { "manifest_received" }
        }),
    );
}

fn transfer_source_peer(state: &AppState, sender_id: &str) -> Option<SocketAddr> {
    state
        .peer(sender_id)?
        .endpoints
        .iter()
        .filter_map(|endpoint| endpoint.parse::<SocketAddr>().ok())
        .map(|endpoint| SocketAddr::new(endpoint.ip(), FILE_TRANSFER_PORT))
        .next()
}

#[cfg(feature = "quic")]
fn quic_socket_addrs(endpoints: &[String]) -> Vec<SocketAddr> {
    endpoints
        .iter()
        .filter_map(|endpoint| endpoint.parse::<SocketAddr>().ok())
        .collect()
}

#[cfg(feature = "quic")]
fn quic_targets_for_message(state: &AppState, message: &ChatBody) -> Vec<SocketAddr> {
    let self_id = state.identity().peer_id();
    let recipient_ids: Vec<String> = if message.recipients.is_empty() {
        state
            .peers()
            .into_iter()
            .map(|peer| peer.peer_id)
            .filter(|peer_id| peer_id != self_id)
            .collect()
    } else {
        message
            .recipients
            .iter()
            .filter(|peer_id| peer_id.as_str() != self_id)
            .cloned()
            .collect()
    };

    let mut targets = BTreeSet::new();
    for peer_id in recipient_ids {
        if let Some(peer) = state.peer(&peer_id) {
            targets.extend(quic_socket_addrs(&peer.endpoints));
        }
    }
    targets.into_iter().collect()
}

fn message_targets_peer(recipients: &[String], peer_id: &str) -> bool {
    recipients.is_empty() || recipients.iter().any(|recipient| recipient == peer_id)
}

pub fn conversation_id_targets_sender_and_peer(
    conversation_id: &str,
    local_peer_id: &str,
    sender_id: &str,
) -> bool {
    let conversation_id = conversation_id.trim();
    let local_peer_id = local_peer_id.trim();
    let sender_id = sender_id.trim();
    if conversation_id.is_empty() || local_peer_id.is_empty() || sender_id.is_empty() {
        return false;
    }
    if let Some(group_id) = conversation_id.strip_prefix("group:") {
        return !group_id.trim().is_empty();
    }
    let Some(rest) = conversation_id.strip_prefix("direct:") else {
        return false;
    };
    let mut peers = rest
        .split(':')
        .map(str::trim)
        .filter(|peer_id| !peer_id.is_empty())
        .collect::<Vec<_>>();
    peers.sort_unstable();
    peers.dedup();
    let includes_local = peers.iter().any(|peer_id| *peer_id == local_peer_id);
    let includes_sender = peers.iter().any(|peer_id| *peer_id == sender_id);
    (peers.len() == 1 && includes_local) || (peers.len() == 2 && includes_local && includes_sender)
}

fn peer_is_blocked(state: &AppState, peer_id: &str) -> bool {
    state.store().is_peer_blocked(peer_id).unwrap_or(false)
}

fn verify_chat_signature(state: &AppState, message: &ChatBody) -> bool {
    if peer_is_blocked(state, &message.sender_id) {
        return false;
    }
    let public_key = state.peer(&message.sender_id).map(|peer| peer.public_key);
    verify_chat_signature_with_public_key(message, public_key.as_deref())
}

pub fn verify_chat_signature_with_public_key(
    message: &ChatBody,
    public_key: Option<&[u8]>,
) -> bool {
    if message.sender_id.trim().is_empty() || message.signature.is_empty() {
        return false;
    }
    verify_known_peer_signature_with_public_key(
        &message.signing_payload(),
        &message.signature,
        public_key,
    )
}

pub fn verify_known_peer_signature_with_public_key(
    payload: &[u8],
    signature: &[u8],
    public_key: Option<&[u8]>,
) -> bool {
    if signature.is_empty() {
        return false;
    }
    let Some(public_key) = public_key else {
        return false;
    };
    if public_key.is_empty() {
        return false;
    }
    verify_signature(public_key, payload, signature)
}

fn verify_ack_frame(state: &AppState, ack: &AckFrame) -> bool {
    if ack.sender_id.is_empty() || ack.signature.is_empty() {
        return false;
    }
    if peer_is_blocked(state, &ack.sender_id) {
        return false;
    }
    let Ok(Some(message)) = state.store().get_chat_body(&ack.message_id) else {
        return false;
    };
    if !ack_targets_message(ack, &message) {
        return false;
    }
    let Some(peer) = state.peer(&ack.sender_id) else {
        return false;
    };
    if peer.public_key.is_empty() {
        return false;
    }
    verify_signature(&peer.public_key, &ack.signing_payload(), &ack.signature)
}

fn verify_typing_signature(
    state: &AppState,
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    active: bool,
    updated_at: i64,
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &typing_signing_payload(conversation_id, sender_id, recipients, active, updated_at),
        signature,
        public_key.as_deref(),
    )
}

fn verify_nudge_signature(
    state: &AppState,
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    nudged_at: i64,
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &nudge_signing_payload(conversation_id, sender_id, recipients, nudged_at),
        signature,
        public_key.as_deref(),
    )
}

fn verify_read_receipt_signature(
    state: &AppState,
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    message_ids: &[String],
    read_at: i64,
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &read_receipt_signing_payload(conversation_id, sender_id, recipients, message_ids, read_at),
        signature,
        public_key.as_deref(),
    )
}

fn verify_message_revoke_signature(
    state: &AppState,
    conversation_id: &str,
    message_id: &str,
    sender_id: &str,
    recipients: &[String],
    revoked_at: i64,
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &message_revoke_signing_payload(
            conversation_id,
            message_id,
            sender_id,
            recipients,
            revoked_at,
        ),
        signature,
        public_key.as_deref(),
    )
}

fn verify_message_reaction_signature(
    state: &AppState,
    conversation_id: &str,
    message_id: &str,
    sender_id: &str,
    recipients: &[String],
    reaction: &str,
    active: bool,
    reacted_at: i64,
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &message_reaction_signing_payload(
            conversation_id,
            message_id,
            sender_id,
            recipients,
            reaction,
            active,
            reacted_at,
        ),
        signature,
        public_key.as_deref(),
    )
}

fn read_receipt_matches_message(
    state: &AppState,
    message_id: &str,
    conversation_id: &str,
    reader_id: &str,
) -> bool {
    let Ok(Some(message)) = state.store().get_chat_body(message_id) else {
        return false;
    };
    message.conversation_id == conversation_id
        && message.sender_id == state.identity().peer_id()
        && message
            .recipients
            .iter()
            .any(|peer_id| peer_id == reader_id)
}

fn verify_group_invite_signature(
    state: &AppState,
    conversation_id: &str,
    name: &str,
    announcement: &str,
    sender_id: &str,
    recipients: &[String],
    member_peer_ids: &[String],
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &group_invite_signing_payload(
            conversation_id,
            name,
            announcement,
            sender_id,
            recipients,
            member_peer_ids,
        ),
        signature,
        public_key.as_deref(),
    )
}

fn verify_transfer_announcement_signature(
    state: &AppState,
    conversation_id: &str,
    sender_id: &str,
    recipients: &[String],
    manifest: &TransferManifest,
    signature: &[u8],
) -> bool {
    let public_key = state.peer(sender_id).map(|peer| peer.public_key);
    verify_known_peer_signature_with_public_key(
        &transfer_announcement_signing_payload(conversation_id, sender_id, recipients, manifest),
        signature,
        public_key.as_deref(),
    )
}
