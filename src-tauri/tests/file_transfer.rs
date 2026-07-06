use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::path::Path;
use std::time::Duration;

use iim::commands::collect_file_entries;
use iim::file_transfer::{
    download_file, download_file_unsigned, manifest_sources_available, serve_registered_files_once,
    TransferRegistry,
};
use iim::identity::{to_hex, DeviceIdentity};
use iim::protocol::{FileEntry, TransferManifest};
use sha2::{Digest, Sha256};

#[cfg(unix)]
fn create_file_symlink(target: &std::path::Path, link: &std::path::Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_file_symlink(target: &std::path::Path, link: &std::path::Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_file(target, link)
}

#[test]
fn tcp_file_transfer_downloads_bytes_and_verifies_sha256() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("测试文件.txt");
    fs::write(&source, b"hello from lan file transfer").expect("write source");
    let digest = to_hex(&Sha256::digest(b"hello from lan file transfer"));
    let manifest = TransferManifest::from_entries(
        "transfer-1".to_string(),
        vec![FileEntry::new(
            source.to_string_lossy().to_string(),
            28,
            digest.clone(),
        )],
        262_144,
    )
    .expect("manifest");
    let registry = TransferRegistry::default();
    assert_eq!(registry.offer_count(), 0);
    registry.register(manifest.clone());
    assert_eq!(registry.offer_count(), 1);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server = std::thread::spawn(move || serve_registered_files_once(listener, registry));

    let target_dir = temp.path().join("received");
    let saved = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &target_dir,
        Duration::from_secs(3),
    )
    .expect("download");

    server.join().expect("server thread").expect("served file");
    assert_eq!(
        fs::read(saved).expect("read received"),
        b"hello from lan file transfer"
    );
}

#[test]
fn tcp_file_transfer_resumes_partial_download() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("resume.txt");
    fs::write(&source, b"hello from resumed transfer").expect("write source");
    let digest = to_hex(&Sha256::digest(b"hello from resumed transfer"));
    let manifest = TransferManifest::from_entries(
        "transfer-resume".to_string(),
        vec![FileEntry::new(
            source.to_string_lossy().to_string(),
            27,
            digest.clone(),
        )],
        262_144,
    )
    .expect("manifest");
    let registry = TransferRegistry::default();
    registry.register(manifest.clone());

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server = std::thread::spawn(move || serve_registered_files_once(listener, registry));

    let target_dir = temp.path().join("received-resume");
    fs::create_dir_all(&target_dir).expect("create target");
    fs::write(target_dir.join("resume.txt"), b"hello from ").expect("write partial");

    let saved = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &target_dir,
        Duration::from_secs(3),
    )
    .expect("download");

    server.join().expect("server thread").expect("served file");
    assert_eq!(
        fs::read(saved).expect("read received"),
        b"hello from resumed transfer"
    );
}

#[test]
fn tcp_file_transfer_replaces_partial_symlink_without_touching_target() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("source.bin");
    let source_bytes = b"correct-safe-download";
    fs::write(&source, source_bytes).expect("write source");
    let digest = to_hex(&Sha256::digest(source_bytes));
    let manifest = TransferManifest::from_entries(
        "transfer-partial-symlink".to_string(),
        vec![
            FileEntry::new("source.bin".to_string(), source_bytes.len() as u64, digest)
                .with_source_path(source.to_string_lossy().to_string()),
        ],
        262_144,
    )
    .expect("manifest");
    let registry = TransferRegistry::default();
    registry.register(manifest.clone());

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server_registry = registry.clone();
    let server = std::thread::spawn(move || {
        for _ in 0..2 {
            let _ = serve_registered_files_once(
                listener.try_clone().expect("clone listener"),
                server_registry.clone(),
            );
        }
    });

    let target_dir = temp.path().join("received-partial-symlink");
    fs::create_dir_all(&target_dir).expect("create target");
    let outside = temp.path().join("outside.txt");
    fs::write(&outside, b"bad").expect("write outside");
    let target = target_dir.join("source.bin");
    if create_file_symlink(&outside, &target).is_err() {
        return;
    }

    let saved = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &target_dir,
        Duration::from_secs(3),
    )
    .expect("download");

    let _ = TcpStream::connect(SocketAddr::new(
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        address.port(),
    ));
    server.join().expect("server thread");

    assert_eq!(fs::read(&outside).expect("read outside"), b"bad");
    assert!(!fs::symlink_metadata(&saved)
        .expect("download metadata")
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(saved).expect("read received"), source_bytes);
}

#[test]
fn tcp_file_transfer_preserves_safe_relative_paths() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source_dir = temp.path().join("source");
    let nested = source_dir.join("design").join("drafts");
    fs::create_dir_all(&nested).expect("create nested source");
    let source = nested.join("plan.txt");
    fs::write(&source, b"folder transfer").expect("write source");
    let digest = to_hex(&Sha256::digest(b"folder transfer"));
    let manifest = TransferManifest::from_entries(
        "transfer-folder".to_string(),
        vec![
            FileEntry::new(source.to_string_lossy().to_string(), 15, digest.clone())
                .with_relative_path("design/drafts/plan.txt"),
        ],
        262_144,
    )
    .expect("manifest");
    let registry = TransferRegistry::default();
    registry.register(manifest.clone());

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server = std::thread::spawn(move || serve_registered_files_once(listener, registry));

    let target_dir = temp.path().join("received-folder");
    let saved = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &target_dir,
        Duration::from_secs(3),
    )
    .expect("download");

    server.join().expect("server thread").expect("served file");
    assert!(saved.ends_with("design/drafts/plan.txt"));
    assert_eq!(fs::read(saved).expect("read received"), b"folder transfer");
}

#[test]
fn tcp_file_transfer_rejects_unsafe_relative_paths() {
    let temp = tempfile::tempdir().expect("tempdir");
    let entry = FileEntry::new("ignored.txt".to_string(), 1, "a".repeat(64))
        .with_relative_path("../escape.txt");

    let result = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 9),
        "transfer-unsafe",
        0,
        &entry,
        &temp.path().join("received-unsafe"),
        Duration::from_millis(100),
    );

    assert!(result.is_err());
    assert!(!temp.path().join("escape.txt").exists());
}

#[test]
fn transfer_manifest_source_availability_uses_private_source_paths() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("private-source.txt");
    fs::write(&source, b"available").expect("write source");
    let manifest = TransferManifest::from_entries(
        "transfer-source-check".to_string(),
        vec![
            FileEntry::new("public/private-source.txt".to_string(), 9, "a".repeat(64))
                .with_source_path(source.to_string_lossy().to_string()),
        ],
        262_144,
    )
    .expect("manifest");
    let missing = TransferManifest::from_entries(
        "transfer-source-missing".to_string(),
        vec![
            FileEntry::new("public/missing.txt".to_string(), 9, "a".repeat(64)).with_source_path(
                temp.path()
                    .join("missing.txt")
                    .to_string_lossy()
                    .to_string(),
            ),
        ],
        262_144,
    )
    .expect("manifest");

    assert!(manifest_sources_available(&manifest));
    assert!(!manifest_sources_available(&missing));
}

#[test]
fn tcp_file_transfer_requires_signed_authorized_request_when_peers_are_registered() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("secure.txt");
    fs::write(&source, b"secure transfer").expect("write source");
    let digest = to_hex(&Sha256::digest(b"secure transfer"));
    let manifest = TransferManifest::from_entries(
        "transfer-secure".to_string(),
        vec![FileEntry::new(
            source.to_string_lossy().to_string(),
            15,
            digest.clone(),
        )],
        262_144,
    )
    .expect("manifest");
    let receiver = DeviceIdentity::generate("Receiver".to_string(), "receiver-pc".to_string());
    let mut authorized = std::collections::HashMap::new();
    authorized.insert(
        receiver.peer_id().to_string(),
        receiver.public_identity().public_key,
    );
    let registry = TransferRegistry::default();
    registry.register_authorized(manifest.clone(), authorized);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server = std::thread::spawn(move || serve_registered_files_once(listener, registry));

    let target_dir = temp.path().join("secure-received");
    let saved = download_file(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &target_dir,
        Duration::from_secs(3),
        receiver.peer_id().to_string(),
        |payload| receiver.sign(payload),
    )
    .expect("signed download");

    server.join().expect("server thread").expect("served file");
    assert_eq!(fs::read(saved).expect("read received"), b"secure transfer");
}

#[test]
fn tcp_file_transfer_rejects_unsigned_request_for_authorized_transfer() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("private.txt");
    fs::write(&source, b"private transfer").expect("write source");
    let digest = to_hex(&Sha256::digest(b"private transfer"));
    let manifest = TransferManifest::from_entries(
        "transfer-private".to_string(),
        vec![FileEntry::new(
            source.to_string_lossy().to_string(),
            16,
            digest.clone(),
        )],
        262_144,
    )
    .expect("manifest");
    let receiver = DeviceIdentity::generate("Receiver".to_string(), "receiver-pc".to_string());
    let mut authorized = std::collections::HashMap::new();
    authorized.insert(
        receiver.peer_id().to_string(),
        receiver.public_identity().public_key,
    );
    let registry = TransferRegistry::default();
    registry.register_authorized(manifest.clone(), authorized);

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server = std::thread::spawn(move || serve_registered_files_once(listener, registry));

    let target_dir = temp.path().join("private-received");
    let result = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &target_dir,
        Duration::from_secs(3),
    );

    assert!(result.is_err());
    assert!(server.join().expect("server thread").is_err());
}

#[test]
fn transfer_registry_remove_stops_future_file_requests() {
    let temp = tempfile::tempdir().expect("tempdir");
    let source = temp.path().join("cancel-source.txt");
    fs::write(&source, b"cancel me").expect("write source");
    let digest = to_hex(&Sha256::digest(b"cancel me"));
    let manifest = TransferManifest::from_entries(
        "transfer-cancel".to_string(),
        vec![FileEntry::new(
            source.to_string_lossy().to_string(),
            9,
            digest,
        )],
        262_144,
    )
    .expect("manifest");
    let registry = TransferRegistry::default();
    registry.register(manifest.clone());
    assert!(registry.remove(&manifest.transfer_id));

    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("local addr");
    let server = std::thread::spawn(move || serve_registered_files_once(listener, registry));

    let result = download_file_unsigned(
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port()),
        &manifest.transfer_id,
        0,
        &manifest.files[0],
        &temp.path().join("cancel-target"),
        Duration::from_secs(3),
    );

    assert!(result.is_err());
    assert!(server.join().expect("server thread").is_err());
}

#[test]
fn collect_file_entries_expands_directories_recursively() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path().join("folder");
    let nested = root.join("nested");
    fs::create_dir_all(&nested).expect("create nested folder");
    fs::write(root.join("a.txt"), b"alpha").expect("write a");
    fs::write(nested.join("b.txt"), b"beta").expect("write b");

    let entries = collect_file_entries(&[root.to_string_lossy().to_string()]).expect("entries");

    assert_eq!(entries.len(), 2);
    assert!(entries.iter().any(|entry| entry.path.ends_with("a.txt")));
    assert!(entries.iter().any(|entry| entry.path.ends_with("b.txt")));
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "folder/a.txt"));
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "folder/nested/b.txt"));
    assert!(entries.iter().any(|entry| entry.path == "folder/a.txt"
        && Path::new(entry.local_source_path()).ends_with(Path::new("folder").join("a.txt"))));
    assert_eq!(entries.iter().map(|entry| entry.size).sum::<u64>(), 9);
    assert!(entries.iter().all(|entry| entry.sha256.len() == 64));
}

#[test]
fn collect_file_entries_disambiguates_duplicate_selected_file_names() {
    let temp = tempfile::tempdir().expect("tempdir");
    let first_dir = temp.path().join("project-a");
    let second_dir = temp.path().join("project-b");
    fs::create_dir_all(&first_dir).expect("create first dir");
    fs::create_dir_all(&second_dir).expect("create second dir");
    let first = first_dir.join("report.txt");
    let second = second_dir.join("report.txt");
    fs::write(&first, b"alpha").expect("write first");
    fs::write(&second, b"beta").expect("write second");

    let entries = collect_file_entries(&[
        first.to_string_lossy().to_string(),
        second.to_string_lossy().to_string(),
    ])
    .expect("entries");

    assert_eq!(entries.len(), 2);
    let relative_paths = entries
        .iter()
        .map(|entry| entry.relative_path.as_str())
        .collect::<Vec<_>>();
    assert_eq!(relative_paths, vec!["report (2).txt", "report.txt"]);
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "report.txt"
            && Path::new(entry.local_source_path())
                .ends_with(Path::new("project-a").join("report.txt"))));
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "report (2).txt"
            && Path::new(entry.local_source_path())
                .ends_with(Path::new("project-b").join("report.txt"))));
    TransferManifest::from_entries("duplicate-files".to_string(), entries, 262_144)
        .expect("disambiguated files build a safe manifest");
}

#[test]
fn collect_file_entries_disambiguates_duplicate_selected_folder_roots() {
    let temp = tempfile::tempdir().expect("tempdir");
    let first_root = temp.path().join("alpha").join("bundle");
    let second_root = temp.path().join("beta").join("bundle");
    fs::create_dir_all(first_root.join("nested")).expect("create first folder");
    fs::create_dir_all(second_root.join("nested")).expect("create second folder");
    fs::write(first_root.join("a.txt"), b"alpha-a").expect("write first a");
    fs::write(first_root.join("nested").join("b.txt"), b"alpha-b").expect("write first b");
    fs::write(second_root.join("a.txt"), b"beta-a").expect("write second a");
    fs::write(second_root.join("nested").join("b.txt"), b"beta-b").expect("write second b");

    let entries = collect_file_entries(&[
        first_root.to_string_lossy().to_string(),
        second_root.to_string_lossy().to_string(),
    ])
    .expect("entries");

    assert_eq!(entries.len(), 4);
    for expected in [
        "bundle/a.txt",
        "bundle/nested/b.txt",
        "bundle (2)/a.txt",
        "bundle (2)/nested/b.txt",
    ] {
        assert!(
            entries.iter().any(|entry| entry.relative_path == expected),
            "missing {expected}"
        );
    }
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "bundle/a.txt"
            && Path::new(entry.local_source_path())
                .ends_with(Path::new("alpha").join("bundle").join("a.txt"))));
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "bundle (2)/a.txt"
            && Path::new(entry.local_source_path())
                .ends_with(Path::new("beta").join("bundle").join("a.txt"))));
    TransferManifest::from_entries("duplicate-folders".to_string(), entries, 262_144)
        .expect("disambiguated folders build a safe manifest");
}

#[test]
fn collect_file_entries_does_not_follow_symlinked_files() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path().join("folder");
    fs::create_dir_all(&root).expect("create folder");
    fs::write(root.join("inside.txt"), b"inside").expect("write inside");
    let outside = temp.path().join("outside-secret.txt");
    fs::write(&outside, b"outside").expect("write outside");
    let link = root.join("linked-secret.txt");
    if create_file_symlink(&outside, &link).is_err() {
        return;
    }

    let entries = collect_file_entries(&[root.to_string_lossy().to_string()]).expect("entries");

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].relative_path, "folder/inside.txt");
    assert!(!entries
        .iter()
        .any(|entry| entry.relative_path.contains("linked-secret")));
}
