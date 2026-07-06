use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

use crate::identity::{to_hex, verify_signature};
use crate::protocol::{FileEntry, TransferManifest};
use crate::store::default_data_dir;
use crate::AppState;

pub const FILE_TRANSFER_PORT: u16 = 24252;

#[derive(Debug, Default, Clone)]
pub struct TransferRegistry {
    offers: Arc<Mutex<HashMap<String, TransferOffer>>>,
}

impl TransferRegistry {
    fn offers(&self) -> MutexGuard<'_, HashMap<String, TransferOffer>> {
        match self.offers.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                eprintln!("recovering poisoned transfer registry mutex");
                poisoned.into_inner()
            }
        }
    }

    pub fn register(&self, manifest: TransferManifest) {
        self.register_authorized(manifest, HashMap::new());
    }

    pub fn register_authorized(
        &self,
        manifest: TransferManifest,
        authorized_peers: HashMap<String, Vec<u8>>,
    ) {
        self.offers().insert(
            manifest.transfer_id.clone(),
            TransferOffer {
                manifest,
                authorized_peers,
            },
        );
    }

    fn file_for(&self, transfer_id: &str, file_index: usize) -> Option<FileEntry> {
        self.offers()
            .get(transfer_id)
            .and_then(|offer| offer.manifest.files.get(file_index).cloned())
    }

    pub fn remove(&self, transfer_id: &str) -> bool {
        self.offers().remove(transfer_id).is_some()
    }

    pub fn offer_count(&self) -> usize {
        self.offers().len()
    }

    pub fn remove_authorization_for_peer(&self, peer_id: &str) -> usize {
        let peer_id = peer_id.trim();
        if peer_id.is_empty() {
            return 0;
        }

        let mut removed = 0;
        self.offers().retain(|_, offer| {
            let was_private_offer = !offer.authorized_peers.is_empty();
            if offer.authorized_peers.remove(peer_id).is_some() {
                removed += 1;
            }
            !(was_private_offer && offer.authorized_peers.is_empty())
        });
        removed
    }

    fn public_key_for(&self, transfer_id: &str, requester_id: &str) -> Option<Vec<u8>> {
        self.offers()
            .get(transfer_id)
            .and_then(|offer| offer.authorized_peers.get(requester_id).cloned())
    }

    fn requires_authorization(&self, transfer_id: &str) -> bool {
        self.offers()
            .get(transfer_id)
            .map(|offer| !offer.authorized_peers.is_empty())
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone)]
struct TransferOffer {
    manifest: TransferManifest,
    authorized_peers: HashMap<String, Vec<u8>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileRequest {
    transfer_id: String,
    file_index: usize,
    #[serde(default)]
    offset: u64,
    #[serde(default)]
    requester_id: String,
    #[serde(default)]
    signature: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRequestSignaturePayload {
    pub transfer_id: String,
    pub file_index: usize,
    pub offset: u64,
    pub requester_id: String,
}

impl FileRequestSignaturePayload {
    pub fn signing_payload(&self) -> anyhow::Result<Vec<u8>> {
        serde_json::to_vec(self).context("serialize file request signature payload")
    }
}

pub fn spawn_file_transfer_server(app: AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(("0.0.0.0", FILE_TRANSFER_PORT)) {
            Ok(listener) => listener,
            Err(error) => {
                let _ = app.emit("network:warning", format!("文件传输端口绑定失败: {error}"));
                return;
            }
        };

        for stream in listener.incoming().flatten() {
            if let Some(state) = app.try_state::<AppState>() {
                let registry = state.transfer_registry().clone();
                thread::spawn(move || {
                    let _ = serve_stream(stream, &registry);
                });
            }
        }
    });
}

pub fn serve_registered_files_once(
    listener: TcpListener,
    registry: TransferRegistry,
) -> anyhow::Result<()> {
    let (stream, _) = listener.accept()?;
    serve_stream(stream, &registry)
}

pub fn download_manifest_from_peer(
    peer: SocketAddr,
    manifest: &TransferManifest,
    app: &AppHandle,
    conversation_id: &str,
) {
    let manifest = manifest.clone();
    let app = app.clone();
    let conversation_id = conversation_id.to_string();
    thread::spawn(move || {
        let target_dir = default_data_dir()
            .join("received_files")
            .join(&manifest.transfer_id);
        let mut received_bytes = existing_received_bytes_for_manifest(&target_dir, &manifest);
        if received_bytes > 0 {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = state.store().update_transfer_progress(
                    &manifest.transfer_id,
                    "downloading",
                    received_bytes,
                );
            }
            let _ = app.emit(
                "transfer:progress",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "transfer_id": manifest.transfer_id,
                    "file": manifest.files.first().map(|file| file.path.clone()).unwrap_or_default(),
                    "sent_bytes": received_bytes,
                    "total_bytes": manifest.total_bytes,
                    "status": "downloading"
                }),
            );
        }
        for (index, file) in manifest.files.iter().enumerate() {
            if transfer_is_canceled(&app, &manifest.transfer_id) {
                let _ = app.emit(
                    "transfer:progress",
                    serde_json::json!({
                        "conversation_id": conversation_id,
                        "transfer_id": manifest.transfer_id,
                        "file": file.path,
                        "sent_bytes": received_bytes,
                        "total_bytes": manifest.total_bytes,
                        "status": "canceled"
                    }),
                );
                break;
            }
            match download_file_with_cancel(
                peer,
                &manifest.transfer_id,
                index,
                file,
                &target_dir,
                Duration::from_secs(30),
                app.try_state::<AppState>()
                    .map(|state| state.identity().peer_id().to_string())
                    .unwrap_or_default(),
                |payload| {
                    app.try_state::<AppState>()
                        .map(|state| state.identity().sign(payload))
                        .unwrap_or_default()
                },
                || transfer_is_canceled(&app, &manifest.transfer_id),
            ) {
                Ok(path) => {
                    if transfer_is_canceled(&app, &manifest.transfer_id) {
                        break;
                    }
                    received_bytes = existing_received_bytes_for_manifest(&target_dir, &manifest);
                    let transfer_status = if received_bytes >= manifest.total_bytes {
                        "downloaded"
                    } else {
                        "downloading"
                    };
                    if let Some(state) = app.try_state::<AppState>() {
                        if transfer_status == "downloaded" {
                            if let Ok(source_paths) =
                                received_transfer_source_paths(&target_dir, &manifest)
                            {
                                let _ = state
                                    .store()
                                    .save_transfer_sources(&manifest.transfer_id, &source_paths);
                            }
                        }
                        let _ = state.store().update_transfer_progress(
                            &manifest.transfer_id,
                            transfer_status,
                            received_bytes,
                        );
                    }
                    let _ = app.emit(
                        "transfer:progress",
                        serde_json::json!({
                            "conversation_id": conversation_id,
                            "transfer_id": manifest.transfer_id,
                            "file": path.to_string_lossy(),
                            "sent_bytes": received_bytes,
                            "total_bytes": manifest.total_bytes,
                            "status": transfer_status
                        }),
                    );
                }
                Err(error) => {
                    let error_message = error.to_string();
                    if transfer_is_canceled(&app, &manifest.transfer_id) {
                        let _ = app.emit(
                            "transfer:progress",
                            serde_json::json!({
                                "conversation_id": conversation_id,
                                "transfer_id": manifest.transfer_id,
                                "file": file.path,
                                "sent_bytes": received_bytes,
                                "total_bytes": manifest.total_bytes,
                                "status": "canceled"
                            }),
                        );
                        break;
                    }
                    if let Some(state) = app.try_state::<AppState>() {
                        let _ = state.store().update_transfer_progress_with_error(
                            &manifest.transfer_id,
                            "failed",
                            received_bytes,
                            &error_message,
                        );
                    }
                    let _ = app.emit(
                        "transfer:progress",
                        serde_json::json!({
                            "conversation_id": conversation_id,
                            "transfer_id": manifest.transfer_id,
                            "file": file.path,
                            "sent_bytes": received_bytes,
                            "total_bytes": manifest.total_bytes,
                            "status": "failed",
                            "error": error_message
                        }),
                    );
                }
            }
        }
    });
}

pub fn manifest_sources_available(manifest: &TransferManifest) -> bool {
    manifest
        .files
        .iter()
        .all(|file| Path::new(file.local_source_path()).is_file())
}

pub fn download_file(
    peer: SocketAddr,
    transfer_id: &str,
    file_index: usize,
    entry: &FileEntry,
    target_dir: &Path,
    timeout: Duration,
    requester_id: String,
    sign_request: impl Fn(&[u8]) -> Vec<u8>,
) -> anyhow::Result<PathBuf> {
    download_file_with_cancel(
        peer,
        transfer_id,
        file_index,
        entry,
        target_dir,
        timeout,
        requester_id,
        sign_request,
        || false,
    )
}

fn download_file_with_cancel(
    peer: SocketAddr,
    transfer_id: &str,
    file_index: usize,
    entry: &FileEntry,
    target_dir: &Path,
    timeout: Duration,
    requester_id: String,
    sign_request: impl Fn(&[u8]) -> Vec<u8>,
    should_cancel: impl Fn() -> bool,
) -> anyhow::Result<PathBuf> {
    download_file_with_request(
        peer,
        transfer_id,
        file_index,
        entry,
        target_dir,
        timeout,
        requester_id,
        sign_request,
        should_cancel,
    )
}

pub fn download_file_unsigned(
    peer: SocketAddr,
    transfer_id: &str,
    file_index: usize,
    entry: &FileEntry,
    target_dir: &Path,
    timeout: Duration,
) -> anyhow::Result<PathBuf> {
    download_file_with_request(
        peer,
        transfer_id,
        file_index,
        entry,
        target_dir,
        timeout,
        String::new(),
        |_| Vec::new(),
        || false,
    )
}

fn download_file_with_request(
    peer: SocketAddr,
    transfer_id: &str,
    file_index: usize,
    entry: &FileEntry,
    target_dir: &Path,
    timeout: Duration,
    requester_id: String,
    sign_request: impl Fn(&[u8]) -> Vec<u8>,
    should_cancel: impl Fn() -> bool,
) -> anyhow::Result<PathBuf> {
    fs::create_dir_all(target_dir)?;
    let target = received_file_target(target_dir, entry)?;
    let mut restart_from_zero = false;

    for attempt in 0..2 {
        if restart_from_zero && target.exists() {
            fs::remove_file(&target)?;
        }

        let downloaded = download_file_attempt(
            peer,
            transfer_id,
            file_index,
            entry,
            &target,
            timeout,
            &requester_id,
            &sign_request,
            &should_cancel,
        );

        match downloaded {
            Ok(path) => return Ok(path),
            Err(error)
                if attempt == 0
                    && target.exists()
                    && error.to_string().contains("file sha256 mismatch") =>
            {
                restart_from_zero = true;
            }
            Err(error) => return Err(error),
        }
    }

    anyhow::bail!("file sha256 mismatch after restart")
}

fn download_file_attempt(
    peer: SocketAddr,
    transfer_id: &str,
    file_index: usize,
    entry: &FileEntry,
    target: &Path,
    timeout: Duration,
    requester_id: &str,
    sign_request: &impl Fn(&[u8]) -> Vec<u8>,
    should_cancel: &impl Fn() -> bool,
) -> anyhow::Result<PathBuf> {
    let mut stream = TcpStream::connect_timeout(&peer, timeout)?;
    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(timeout))?;

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut offset = target
        .metadata()
        .map(|metadata| metadata.len().min(entry.size))
        .unwrap_or(0);
    if offset == entry.size {
        verify_file_digest(&target, &entry.sha256)?;
        return Ok(target.to_path_buf());
    }

    let mut output = if offset > 0 {
        OpenOptions::new().append(true).open(&target)?
    } else {
        File::create(&target)?
    };
    let mut remaining = entry.size.saturating_sub(offset);
    let mut buffer = [0u8; 64 * 1024];

    let signature_payload = FileRequestSignaturePayload {
        transfer_id: transfer_id.to_string(),
        file_index,
        offset,
        requester_id: requester_id.to_string(),
    };
    let signing_payload = signature_payload.signing_payload()?;
    let request = FileRequest {
        transfer_id: transfer_id.to_string(),
        file_index,
        offset,
        requester_id: requester_id.to_string(),
        signature: sign_request(&signing_payload),
    };
    stream.write_all(serde_json::to_string(&request)?.as_bytes())?;
    stream.write_all(b"\n")?;

    while remaining > 0 {
        anyhow::ensure!(!should_cancel(), "transfer canceled");
        let wanted = remaining.min(buffer.len() as u64) as usize;
        let read = stream.read(&mut buffer[..wanted])?;
        anyhow::ensure!(read > 0, "connection closed before file completed");
        anyhow::ensure!(!should_cancel(), "transfer canceled");
        output.write_all(&buffer[..read])?;
        remaining -= read as u64;
        offset += read as u64;
    }

    output.flush()?;
    verify_file_digest(&target, &entry.sha256)?;
    Ok(target.to_path_buf())
}

fn existing_received_bytes_for_manifest(target_dir: &Path, manifest: &TransferManifest) -> u64 {
    let mut received = 0u64;
    for entry in &manifest.files {
        let Ok(target) = received_file_target(target_dir, entry) else {
            break;
        };
        let Ok(metadata) = target.metadata() else {
            break;
        };
        let size = metadata.len().min(entry.size);
        if size == entry.size {
            if verify_file_digest(&target, &entry.sha256).is_err() {
                break;
            }
            received = received.saturating_add(entry.size);
            continue;
        }
        received = received.saturating_add(size);
        break;
    }
    received
}

fn received_transfer_source_paths(
    target_dir: &Path,
    manifest: &TransferManifest,
) -> anyhow::Result<Vec<String>> {
    manifest
        .files
        .iter()
        .map(|file| {
            Ok(received_file_target(target_dir, file)?
                .to_string_lossy()
                .to_string())
        })
        .collect()
}

fn received_file_target(target_dir: &Path, entry: &FileEntry) -> anyhow::Result<PathBuf> {
    let candidate = if entry.relative_path.trim().is_empty() {
        Path::new(&entry.path)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or("received-file")
            .to_string()
    } else {
        entry.relative_path.trim().to_string()
    };
    let mut safe_path = PathBuf::new();
    for component in Path::new(&candidate).components() {
        match component {
            Component::Normal(part) => safe_path.push(sanitize_received_path_component(part)),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                anyhow::bail!("unsafe relative file path");
            }
        }
    }
    if safe_path.as_os_str().is_empty() {
        safe_path.push("received-file");
    }
    Ok(target_dir.join(safe_path))
}

fn sanitize_received_path_component(component: &std::ffi::OsStr) -> String {
    let mut sanitized = component
        .to_string_lossy()
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
                '_'
            } else {
                ch
            }
        })
        .collect::<String>()
        .trim_end_matches([' ', '.'])
        .to_string();
    if sanitized.is_empty() {
        sanitized = "received-file".to_string();
    }

    let stem = sanitized
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem
            .strip_prefix("COM")
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=9).contains(&value))
        || stem
            .strip_prefix("LPT")
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=9).contains(&value));
    if reserved {
        sanitized.insert(0, '_');
    }
    sanitized
}

fn serve_stream(stream: TcpStream, registry: &TransferRegistry) -> anyhow::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let request: FileRequest = serde_json::from_str(line.trim())?;
    verify_file_request(&request, registry)?;
    let entry = registry
        .file_for(&request.transfer_id, request.file_index)
        .context("requested file is not registered")?;
    let source_path = entry.local_source_path();
    let mut file = File::open(source_path).with_context(|| format!("open {source_path}"))?;
    anyhow::ensure!(
        file.metadata()?.len() == entry.size,
        "source file size does not match manifest"
    );
    verify_file_digest(Path::new(source_path), &entry.sha256)?;
    anyhow::ensure!(
        request.offset <= entry.size,
        "requested offset beyond file size"
    );
    file.seek(SeekFrom::Start(request.offset))?;
    let mut writer = stream;
    let remaining = entry.size.saturating_sub(request.offset);
    std::io::copy(&mut file.take(remaining), &mut writer)?;
    Ok(())
}

fn transfer_is_canceled(app: &AppHandle, transfer_id: &str) -> bool {
    app.try_state::<AppState>()
        .and_then(|state| state.store().transfer_status(transfer_id).ok().flatten())
        .map(|status| matches!(status.as_str(), "canceled" | "cancelled"))
        .unwrap_or(false)
}

fn verify_file_request(request: &FileRequest, registry: &TransferRegistry) -> anyhow::Result<()> {
    if !registry.requires_authorization(&request.transfer_id) {
        return Ok(());
    }
    anyhow::ensure!(
        !request.requester_id.trim().is_empty(),
        "file request requester is required"
    );
    anyhow::ensure!(
        !request.signature.is_empty(),
        "file request signature is required"
    );
    let public_key = registry
        .public_key_for(&request.transfer_id, &request.requester_id)
        .context("file request requester is not authorized")?;
    let payload = FileRequestSignaturePayload {
        transfer_id: request.transfer_id.clone(),
        file_index: request.file_index,
        offset: request.offset,
        requester_id: request.requester_id.clone(),
    };
    let signing_payload = payload.signing_payload()?;
    anyhow::ensure!(
        verify_signature(&public_key, &signing_payload, &request.signature),
        "file request signature is invalid"
    );
    Ok(())
}

fn verify_file_digest(path: &Path, expected_sha256: &str) -> anyhow::Result<()> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = to_hex(&hasher.finalize());
    anyhow::ensure!(actual == expected_sha256, "file sha256 mismatch");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::to_hex;
    use crate::protocol::FileEntry;
    use sha2::{Digest, Sha256};
    use std::io::Write;
    use tempfile::tempdir;

    #[cfg(unix)]
    fn create_file_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(windows)]
    fn create_file_symlink(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_file(target, link)
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        to_hex(&hasher.finalize())
    }

    #[test]
    fn download_restarts_when_existing_partial_file_has_bad_digest() {
        let temp = tempdir().expect("tempdir");
        let source_bytes = b"correct-lan-transfer-payload";
        let source_path = temp.path().join("source.bin");
        std::fs::write(&source_path, source_bytes).expect("source");

        let entry = FileEntry::new(
            "source.bin".to_string(),
            source_bytes.len() as u64,
            sha256_hex(source_bytes),
        )
        .with_source_path(source_path.to_string_lossy().to_string());
        let manifest =
            TransferManifest::from_entries("transfer-restart".to_string(), vec![entry.clone()], 8)
                .expect("manifest");
        let registry = TransferRegistry::default();
        registry.register(manifest);

        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind");
        let peer = listener.local_addr().expect("addr");
        let server_registry = registry.clone();
        let server = thread::spawn(move || {
            for _ in 0..2 {
                serve_registered_files_once(
                    listener.try_clone().expect("clone"),
                    server_registry.clone(),
                )
                .expect("serve file");
            }
        });

        let target_dir = temp.path().join("received");
        fs::create_dir_all(&target_dir).expect("target dir");
        let target = target_dir.join("source.bin");
        let mut partial = File::create(&target).expect("partial");
        partial.write_all(b"bad-prefix").expect("bad partial");
        partial.flush().expect("flush partial");

        let downloaded = download_file_unsigned(
            peer,
            "transfer-restart",
            0,
            &entry,
            &target_dir,
            Duration::from_secs(5),
        )
        .expect("download");

        assert_eq!(std::fs::read(downloaded).expect("downloaded"), source_bytes);
        server.join().expect("server");
    }

    #[test]
    fn download_replaces_existing_symlink_target_instead_of_following_it() {
        let temp = tempdir().expect("tempdir");
        let source_bytes = b"safe-download";
        let source_path = temp.path().join("source.bin");
        std::fs::write(&source_path, source_bytes).expect("source");

        let entry = FileEntry::new(
            "source.bin".to_string(),
            source_bytes.len() as u64,
            sha256_hex(source_bytes),
        )
        .with_source_path(source_path.to_string_lossy().to_string());
        let manifest =
            TransferManifest::from_entries("transfer-symlink".to_string(), vec![entry.clone()], 8)
                .expect("manifest");
        let registry = TransferRegistry::default();
        registry.register(manifest);

        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind");
        let peer = listener.local_addr().expect("addr");
        let server_registry = registry.clone();
        let server = thread::spawn(move || {
            serve_registered_files_once(listener, server_registry).expect("serve file");
        });

        let target_dir = temp.path().join("received");
        fs::create_dir_all(&target_dir).expect("target dir");
        let outside = temp.path().join("outside.txt");
        std::fs::write(&outside, b"outside-secret").expect("outside");
        let target = target_dir.join("source.bin");
        if create_file_symlink(&outside, &target).is_err() {
            return;
        }

        let downloaded = download_file_unsigned(
            peer,
            "transfer-symlink",
            0,
            &entry,
            &target_dir,
            Duration::from_secs(5),
        )
        .expect("download");

        assert_eq!(std::fs::read(&outside).expect("outside"), b"outside-secret");
        assert!(!std::fs::symlink_metadata(&downloaded)
            .expect("download metadata")
            .file_type()
            .is_symlink());
        assert_eq!(std::fs::read(downloaded).expect("downloaded"), source_bytes);
        server.join().expect("server");
    }

    #[test]
    fn serve_stream_limits_resumed_bytes_to_manifest_entry_size() {
        let temp = tempdir().expect("tempdir");
        let source_path = temp.path().join("source.bin");
        std::fs::write(&source_path, b"safe").expect("source");

        let entry = FileEntry::new("source.bin".to_string(), 4, sha256_hex(b"safe"))
            .with_source_path(source_path.to_string_lossy().to_string());
        let manifest =
            TransferManifest::from_entries("transfer-limited".to_string(), vec![entry], 8)
                .expect("manifest");
        let registry = TransferRegistry::default();
        registry.register(manifest);

        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind");
        let peer = listener.local_addr().expect("addr");
        let server_registry = registry.clone();
        let server = thread::spawn(move || {
            serve_registered_files_once(listener, server_registry).expect("serve file");
        });

        let mut stream = TcpStream::connect(peer).expect("connect");
        let request = FileRequest {
            transfer_id: "transfer-limited".to_string(),
            file_index: 0,
            offset: 2,
            requester_id: String::new(),
            signature: Vec::new(),
        };
        stream
            .write_all(serde_json::to_string(&request).expect("request").as_bytes())
            .expect("write request");
        stream.write_all(b"\n").expect("newline");
        let mut received = Vec::new();
        stream.read_to_end(&mut received).expect("read response");

        assert_eq!(received, b"fe");
        server.join().expect("server");
    }

    #[test]
    fn serve_stream_rejects_source_file_digest_mismatch() {
        let temp = tempdir().expect("tempdir");
        let source_path = temp.path().join("source.bin");
        std::fs::write(&source_path, b"evil").expect("source");

        let entry = FileEntry::new("source.bin".to_string(), 4, sha256_hex(b"good"))
            .with_source_path(source_path.to_string_lossy().to_string());
        let manifest =
            TransferManifest::from_entries("transfer-digest-mismatch".to_string(), vec![entry], 8)
                .expect("manifest");
        let registry = TransferRegistry::default();
        registry.register(manifest);

        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind");
        let peer = listener.local_addr().expect("addr");
        let server_registry = registry.clone();
        let server = thread::spawn(move || serve_registered_files_once(listener, server_registry));

        let mut stream = TcpStream::connect(peer).expect("connect");
        let request = FileRequest {
            transfer_id: "transfer-digest-mismatch".to_string(),
            file_index: 0,
            offset: 0,
            requester_id: String::new(),
            signature: Vec::new(),
        };
        stream
            .write_all(serde_json::to_string(&request).expect("request").as_bytes())
            .expect("write request");
        stream.write_all(b"\n").expect("newline");
        let mut received = Vec::new();
        stream.read_to_end(&mut received).expect("read response");

        let error = server
            .join()
            .expect("server")
            .expect_err("digest mismatch should reject serving");
        assert!(error.to_string().contains("file sha256 mismatch"));
        assert!(received.is_empty());
    }

    #[test]
    fn existing_received_bytes_counts_verified_full_files_and_current_partial() {
        let temp = tempdir().expect("tempdir");
        let target_dir = temp.path().join("received");
        fs::create_dir_all(&target_dir).expect("target dir");
        let first = b"first-file";
        let second = b"second-file-content";
        let first_entry = FileEntry::new(
            "first.bin".to_string(),
            first.len() as u64,
            sha256_hex(first),
        );
        let second_entry = FileEntry::new(
            "second.bin".to_string(),
            second.len() as u64,
            sha256_hex(second),
        );
        let manifest = TransferManifest::from_entries(
            "transfer-progress".to_string(),
            vec![first_entry, second_entry],
            8,
        )
        .expect("manifest");

        std::fs::write(target_dir.join("first.bin"), first).expect("first received");
        std::fs::write(target_dir.join("second.bin"), &second[..6]).expect("second partial");

        assert_eq!(
            existing_received_bytes_for_manifest(&target_dir, &manifest),
            first.len() as u64 + 6
        );
    }

    #[test]
    fn received_file_target_sanitizes_windows_reserved_names() {
        let target_dir = Path::new("received");
        let entry = FileEntry::new("ignored.txt".to_string(), 0, "a".repeat(64))
            .with_relative_path("folder/CON.txt");

        let target = received_file_target(target_dir, &entry).expect("safe target");

        assert!(target.ends_with(Path::new("folder").join("_CON.txt")));
    }

    #[test]
    fn received_file_target_replaces_windows_invalid_filename_characters() {
        let target_dir = Path::new("received");
        let entry = FileEntry::new("ignored.txt".to_string(), 0, "a".repeat(64))
            .with_relative_path("docs/report<draft>|v1?.txt");

        let target = received_file_target(target_dir, &entry).expect("safe target");

        assert!(target.ends_with(Path::new("docs").join("report_draft__v1_.txt")));
    }

    #[test]
    fn removing_peer_authorization_keeps_other_private_offers_and_drops_empty_ones() {
        let registry = TransferRegistry::default();
        let shared_manifest = TransferManifest::from_entries(
            "transfer-shared".to_string(),
            vec![FileEntry::new("shared.txt".to_string(), 1, "a".repeat(64))],
            262_144,
        )
        .expect("shared manifest");
        let peer_only_manifest = TransferManifest::from_entries(
            "transfer-peer-only".to_string(),
            vec![FileEntry::new("private.txt".to_string(), 1, "b".repeat(64))],
            262_144,
        )
        .expect("peer-only manifest");
        let public_manifest = TransferManifest::from_entries(
            "transfer-public".to_string(),
            vec![FileEntry::new("public.txt".to_string(), 1, "c".repeat(64))],
            262_144,
        )
        .expect("public manifest");
        let mut shared_authorizations = HashMap::new();
        shared_authorizations.insert("peer-a".to_string(), vec![1, 2, 3]);
        shared_authorizations.insert("peer-b".to_string(), vec![4, 5, 6]);
        let mut peer_only_authorizations = HashMap::new();
        peer_only_authorizations.insert("peer-a".to_string(), vec![7, 8, 9]);

        registry.register_authorized(shared_manifest, shared_authorizations);
        registry.register_authorized(peer_only_manifest, peer_only_authorizations);
        registry.register(public_manifest);

        assert_eq!(registry.remove_authorization_for_peer("peer-a"), 2);

        assert!(registry.requires_authorization("transfer-shared"));
        assert!(registry
            .public_key_for("transfer-shared", "peer-a")
            .is_none());
        assert_eq!(
            registry.public_key_for("transfer-shared", "peer-b"),
            Some(vec![4, 5, 6])
        );
        assert!(!registry.requires_authorization("transfer-peer-only"));
        assert!(registry.file_for("transfer-peer-only", 0).is_none());
        assert!(!registry.requires_authorization("transfer-public"));
        assert!(registry.file_for("transfer-public", 0).is_some());
    }

    #[test]
    fn file_request_signature_payload_reports_serialization_result() {
        let payload = FileRequestSignaturePayload {
            transfer_id: "transfer-result".to_string(),
            file_index: 2,
            offset: 1024,
            requester_id: "peer-a".to_string(),
        };

        let encoded = payload
            .signing_payload()
            .expect("signature payload should serialize");

        assert!(String::from_utf8(encoded)
            .expect("payload is utf8 json")
            .contains("transfer-result"));
    }

    #[test]
    fn transfer_registry_recovers_after_poisoned_lock() {
        let registry = TransferRegistry::default();
        let poisoned_registry = registry.clone();
        let _ = std::panic::catch_unwind(move || {
            let _guard = poisoned_registry.offers.lock().expect("registry lock");
            panic!("poison transfer registry");
        });
        let manifest = TransferManifest::from_entries(
            "transfer-poisoned".to_string(),
            vec![FileEntry::new(
                "after-poison.txt".to_string(),
                1,
                "d".repeat(64),
            )],
            262_144,
        )
        .expect("manifest");

        registry.register(manifest);

        assert_eq!(registry.offer_count(), 1);
        assert!(registry.file_for("transfer-poisoned", 0).is_some());
        assert!(registry.remove("transfer-poisoned"));
    }
}
