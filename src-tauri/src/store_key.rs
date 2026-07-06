use std::path::{Path, PathBuf};

use rand::{rngs::OsRng, RngCore};

use crate::identity::to_hex;

const STORE_KEY_FILE: &str = "db.key.dpapi";
const STORE_KEY_BYTES: usize = 32;

pub fn store_key_path(data_dir: &Path) -> PathBuf {
    data_dir.join(STORE_KEY_FILE)
}

pub fn load_or_create_store_key(data_dir: &Path) -> anyhow::Result<String> {
    std::fs::create_dir_all(data_dir)?;
    let path = store_key_path(data_dir);
    let key = if path.exists() {
        unprotect_secret_bytes(&std::fs::read(&path)?)?
    } else {
        let key = new_key_material();
        let protected = protect_secret_bytes(&key)?;
        write_key_file(&path, &protected)?;
        key
    };
    key_material_to_sqlcipher_hex(&key)
}

pub fn key_material_to_sqlcipher_hex(key: &[u8]) -> anyhow::Result<String> {
    anyhow::ensure!(
        key.len() == STORE_KEY_BYTES,
        "database key must be {STORE_KEY_BYTES} bytes"
    );
    Ok(to_hex(key))
}

fn new_key_material() -> Vec<u8> {
    let mut key = vec![0u8; STORE_KEY_BYTES];
    OsRng.fill_bytes(&mut key);
    key
}

fn write_key_file(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes)?;
    Ok(())
}

#[cfg(windows)]
pub fn protect_secret_bytes(bytes: &[u8]) -> anyhow::Result<Vec<u8>> {
    use std::ptr::{null, null_mut};
    use std::slice;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &input,
            null(),
            null(),
            null_mut(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    anyhow::ensure!(ok != 0, "protect database key with Windows DPAPI");
    let protected =
        unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(protected)
}

#[cfg(windows)]
pub fn unprotect_secret_bytes(bytes: &[u8]) -> anyhow::Result<Vec<u8>> {
    use std::ptr::{null, null_mut};
    use std::slice;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            null(),
            null_mut(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    anyhow::ensure!(ok != 0, "unprotect database key with Windows DPAPI");
    let key = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(output.pbData as _);
    }
    Ok(key)
}

#[cfg(not(windows))]
pub fn protect_secret_bytes(bytes: &[u8]) -> anyhow::Result<Vec<u8>> {
    Ok(bytes.to_vec())
}

#[cfg(not(windows))]
pub fn unprotect_secret_bytes(bytes: &[u8]) -> anyhow::Result<Vec<u8>> {
    Ok(bytes.to_vec())
}
