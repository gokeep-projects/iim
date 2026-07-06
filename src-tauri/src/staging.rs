use std::collections::HashSet;
use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::Deserialize;
use uuid::Uuid;

use crate::store::default_data_dir;

#[derive(Debug, Clone, Deserialize)]
pub struct StagedClipboardFile {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

pub fn sanitize_staged_file_name(file_name: &str) -> String {
    let leaf = file_name
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(file_name)
        .trim();
    let sanitized: String = leaf
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect();
    let mut sanitized = sanitized.trim_end_matches(['.', ' ']).to_string();

    if sanitized.is_empty() {
        sanitized = "clipboard.bin".to_string();
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

    if sanitized == "." || sanitized == ".." {
        "clipboard.bin".to_string()
    } else {
        sanitized
    }
}

pub fn staged_clipboard_file_path(
    base_dir: &Path,
    transfer_id: &str,
    file_name: &str,
) -> anyhow::Result<PathBuf> {
    let safe_transfer_id = sanitize_staged_file_name(transfer_id);
    let safe_file_name = sanitize_staged_file_name(file_name);
    let directory = base_dir.join(safe_transfer_id);
    Ok(directory.join(safe_file_name))
}

pub fn write_staged_clipboard_files(files: &[StagedClipboardFile]) -> anyhow::Result<Vec<PathBuf>> {
    let transfer_id = Uuid::new_v4().to_string();
    let base_dir = default_data_dir().join("staged");
    write_staged_clipboard_files_at(&base_dir, &transfer_id, files)
}

pub fn write_staged_clipboard_files_at(
    base_dir: &Path,
    transfer_id: &str,
    files: &[StagedClipboardFile],
) -> anyhow::Result<Vec<PathBuf>> {
    let target_dir = base_dir.join(sanitize_staged_file_name(transfer_id));
    std::fs::create_dir_all(&target_dir).context("create staged clipboard directory")?;

    let mut used_names = HashSet::new();
    let mut paths = Vec::with_capacity(files.len());
    for (index, file) in files.iter().enumerate() {
        let mut name = sanitize_staged_file_name(&file.file_name);
        if !used_names.insert(name.clone()) {
            name = format!("{}-{}", index + 1, name);
            used_names.insert(name.clone());
        }
        let path = staged_clipboard_file_path(base_dir, transfer_id, &name)?;
        std::fs::write(&path, &file.bytes).with_context(|| format!("write {}", path.display()))?;
        paths.push(path);
    }

    Ok(paths)
}
