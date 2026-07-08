pub mod commands;
pub mod desktop;
pub mod discovery;
pub mod file_transfer;
pub mod identity;
pub mod protocol;
pub mod screen_capture;
pub mod staging;
pub mod store;
pub mod store_key;
pub mod transport;

use std::collections::HashMap;
#[cfg(feature = "quic")]
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use anyhow::Context;
use chrono::Utc;
use discovery::{peer_is_stale, NetworkSettings, PeerProfile, PeerStatus};
use file_transfer::{manifest_sources_available, TransferRegistry};
use identity::DeviceIdentity;
#[cfg(feature = "quic")]
use protocol::QUIC_PORT;
use store::{default_data_dir, EncryptedStore};
#[cfg(feature = "quic")]
use tauri::{Emitter, Manager};
#[cfg(feature = "quic")]
use transport::{QuicTransport, TransportConfig};

fn recover_mutex_guard<'a, T>(mutex: &'a Mutex<T>, label: &str) -> MutexGuard<'a, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("recovering poisoned {label} mutex");
            poisoned.into_inner()
        }
    }
}

pub struct AppState {
    identity: DeviceIdentity,
    identity_path: PathBuf,
    self_profile: Mutex<PeerProfile>,
    store: EncryptedStore,
    peers: Mutex<HashMap<String, PeerProfile>>,
    peer_seen_at: Mutex<HashMap<String, i64>>,
    settings: Mutex<NetworkSettings>,
    transfer_registry: TransferRegistry,
    #[cfg(feature = "quic")]
    transport: Mutex<QuicTransport>,
}

impl AppState {
    pub fn bootstrap() -> anyhow::Result<Self> {
        let hostname = hostname::get()
            .ok()
            .and_then(|name| name.into_string().ok())
            .unwrap_or_else(|| "windows-pc".to_string());
        let display_name = std::env::var("USERNAME").unwrap_or_else(|_| "IIM User".to_string());
        let identity_path = default_data_dir().join("identity.json");
        let identity = DeviceIdentity::load_or_create(&identity_path, display_name, hostname)
            .context("load or create device identity")?;
        let store = EncryptedStore::open_default().context("open local encrypted store")?;
        let self_profile = PeerProfile::from_identity(&identity, PeerStatus::Online);
        let settings = store
            .load_network_settings()
            .context("load network settings")?
            .unwrap_or_default();
        let mut peers = HashMap::new();
        peers.insert(self_profile.peer_id.clone(), self_profile.clone());
        let mut peer_seen_at = HashMap::new();
        peer_seen_at.insert(self_profile.peer_id.clone(), Utc::now().timestamp_millis());

        let transfer_registry = TransferRegistry::default();
        for (manifest, authorizations) in store
            .list_resumable_local_transfer_offers(1000)
            .context("load resumable local transfer offers")?
        {
            if manifest_sources_available(&manifest) {
                transfer_registry.register_authorized(manifest, authorizations);
            }
        }

        Ok(Self {
            identity,
            identity_path,
            self_profile: Mutex::new(self_profile.clone()),
            store,
            peers: Mutex::new(peers),
            peer_seen_at: Mutex::new(peer_seen_at),
            settings: Mutex::new(settings),
            transfer_registry,
            #[cfg(feature = "quic")]
            transport: Mutex::new(QuicTransport::default()),
        })
    }

    pub fn identity(&self) -> &DeviceIdentity {
        &self.identity
    }

    pub fn store(&self) -> &EncryptedStore {
        &self.store
    }

    pub fn self_profile(&self) -> PeerProfile {
        recover_mutex_guard(&self.self_profile, "self profile").clone()
    }

    pub fn update_self_profile(&self, mut profile: PeerProfile) -> anyhow::Result<PeerProfile> {
        let current = self.self_profile();
        profile.peer_id = current.peer_id;
        profile.fingerprint = current.fingerprint;
        profile.endpoints = if profile.endpoints.is_empty() {
            current.endpoints
        } else {
            profile.endpoints
        };
        if profile.hostname.trim().is_empty() {
            profile.hostname = current.hostname;
        }
        self.identity.persist_public_profile(
            &self.identity_path,
            profile.display_name.trim(),
            profile.hostname.trim(),
        )?;
        *recover_mutex_guard(&self.self_profile, "self profile") = profile.clone();
        self.upsert_peer(profile.clone());
        Ok(profile)
    }

    pub fn upsert_peer(&self, peer: PeerProfile) {
        recover_mutex_guard(&self.peer_seen_at, "peer seen")
            .insert(peer.peer_id.clone(), Utc::now().timestamp_millis());
        recover_mutex_guard(&self.peers, "peers").insert(peer.peer_id.clone(), peer);
    }

    pub fn peers(&self) -> Vec<PeerProfile> {
        let mut peers: Vec<_> = recover_mutex_guard(&self.peers, "peers")
            .values()
            .cloned()
            .collect();
        peers.sort_by(|a, b| a.display_name.cmp(&b.display_name));
        peers
    }

    pub fn peer(&self, peer_id: &str) -> Option<PeerProfile> {
        recover_mutex_guard(&self.peers, "peers")
            .get(peer_id)
            .cloned()
    }

    pub fn mark_stale_peers_offline(&self, ttl_millis: i64) -> Vec<PeerProfile> {
        let now = Utc::now().timestamp_millis();
        let self_id = self.identity.peer_id();
        let seen = recover_mutex_guard(&self.peer_seen_at, "peer seen");
        let mut peers = recover_mutex_guard(&self.peers, "peers");
        let mut offline = Vec::new();

        for peer in peers.values_mut() {
            if peer.peer_id == self_id || peer.status == PeerStatus::Offline {
                continue;
            }
            let last_seen = seen.get(&peer.peer_id).copied().unwrap_or(0);
            if peer_is_stale(now, last_seen, ttl_millis) {
                peer.status = PeerStatus::Offline;
                offline.push(peer.clone());
            }
        }
        offline
    }

    pub fn settings(&self) -> NetworkSettings {
        recover_mutex_guard(&self.settings, "settings").clone()
    }

    pub fn update_settings(&self, settings: NetworkSettings) -> anyhow::Result<()> {
        self.store.save_network_settings(&settings)?;
        *recover_mutex_guard(&self.settings, "settings") = settings;
        Ok(())
    }

    pub fn transfer_registry(&self) -> &TransferRegistry {
        &self.transfer_registry
    }

    #[cfg(feature = "quic")]
    pub fn bind_quic_transport(&self) -> anyhow::Result<()> {
        let transport = QuicTransport::bind(
            SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), QUIC_PORT),
            TransportConfig::default(),
        )
        .context("bind QUIC transport")?;
        *recover_mutex_guard(&self.transport, "transport") = transport;
        Ok(())
    }

    #[cfg(feature = "quic")]
    pub fn transport(&self) -> QuicTransport {
        recover_mutex_guard(&self.transport, "transport").clone()
    }
}

pub fn run() {
    let app_state = AppState::bootstrap().expect("bootstrap application state");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_self_profile,
            commands::update_self_profile,
            commands::list_peers,
            commands::list_contact_metadata,
            commands::update_contact_metadata,
            commands::list_conversations,
            commands::list_messages,
            commands::export_conversation_history,
            commands::delete_message,
            commands::clear_conversation_messages,
            commands::retry_message,
            commands::revoke_message,
            commands::forward_message,
            commands::send_text,
            commands::send_typing,
            commands::send_nudge,
            commands::send_files,
            commands::create_group,
            commands::update_group,
            commands::list_group_members,
            commands::update_conversation_preferences,
            commands::delete_conversation,
            commands::mark_conversation_read,
            commands::mark_conversation_unread,
            commands::mark_all_conversations_read,
            commands::get_conversation_draft,
            commands::save_conversation_draft,
            commands::search_messages,
            commands::search_conversation_messages,
            commands::list_conversation_messages_between,
            commands::set_message_favorite,
            commands::set_message_pin,
            commands::list_pinned_messages,
            commands::set_message_todo,
            commands::list_todo_messages,
            commands::list_outbox_messages,
            commands::list_message_delivery_receipts,
            commands::set_message_reaction,
            commands::list_favorite_messages,
            commands::list_transfers,
            commands::delete_transfer,
            commands::cancel_transfer,
            commands::resume_transfer,
            commands::clear_completed_transfers,
            commands::open_transfer_location,
            commands::trust_peer,
            commands::list_trusted_peers,
            commands::remove_trusted_peer,
            commands::get_network_settings,
            commands::get_transport_config,
            commands::update_network_settings,
            commands::get_app_preferences,
            commands::update_app_preferences,
            commands::minimize_to_tray,
            commands::show_main_window,
            commands::start_screen_capture,
            commands::stage_clipboard_files,
            commands::get_storage_overview,
            commands::migrate_storage_directory,
            commands::clear_staged_files,
            commands::open_storage_location,
            commands::restart_app
        ])
        .on_window_event(desktop::handle_window_event)
        .on_menu_event(|app, event| desktop::handle_menu_action(app, event.id().as_ref()))
        .on_tray_icon_event(|app, event| desktop::handle_tray_event(app, event))
        .setup(|app| {
            desktop::install_system_tray(app)?;
            let handle = app.handle().clone();
            discovery::spawn_background_discovery(handle);
            #[cfg(feature = "quic")]
            {
                let state = app.state::<AppState>();
                match state.bind_quic_transport() {
                    Ok(()) => discovery::spawn_quic_listener(app.handle().clone()),
                    Err(error) => {
                        let _ = app.emit(
                            "network:warning",
                            format!("QUIC transport unavailable: {error}"),
                        );
                    }
                }
            }
            file_transfer::spawn_file_transfer_server(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state() -> AppState {
        let identity = DeviceIdentity::generate("Local User".to_string(), "local-pc".to_string());
        let identity_path = std::env::temp_dir().join("iim-test-identity.json");
        let self_profile = PeerProfile::from_identity(&identity, PeerStatus::Online);
        let mut peers = HashMap::new();
        peers.insert(self_profile.peer_id.clone(), self_profile.clone());
        let mut peer_seen_at = HashMap::new();
        peer_seen_at.insert(self_profile.peer_id.clone(), Utc::now().timestamp_millis());

        AppState {
            identity,
            identity_path,
            self_profile: Mutex::new(self_profile),
            store: EncryptedStore::open_memory_with_key("app-state-test-key").expect("store"),
            peers: Mutex::new(peers),
            peer_seen_at: Mutex::new(peer_seen_at),
            settings: Mutex::new(NetworkSettings::default()),
            transfer_registry: TransferRegistry::default(),
            #[cfg(feature = "quic")]
            transport: Mutex::new(QuicTransport::default()),
        }
    }

    #[test]
    fn app_state_profile_lock_poisoning_does_not_panic() {
        let state = test_state();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = state.self_profile.lock().expect("lock before poison");
            panic!("poison self profile lock");
        }));

        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| state.self_profile()));

        assert!(
            result.is_ok(),
            "app state profile access should recover from lock poisoning"
        );
    }
}
