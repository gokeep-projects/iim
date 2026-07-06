use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::Utc;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::store_key::{protect_secret_bytes, unprotect_secret_bytes};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicIdentity {
    pub peer_id: String,
    pub display_name: String,
    pub hostname: String,
    pub public_key: Vec<u8>,
    pub fingerprint: String,
}

#[derive(Debug)]
pub struct DeviceIdentity {
    display_name: String,
    hostname: String,
    signing_key: SigningKey,
    peer_id: String,
    fingerprint: String,
    sequence: AtomicU64,
}

impl DeviceIdentity {
    pub fn load_or_create(
        path: &Path,
        display_name: String,
        hostname: String,
    ) -> anyhow::Result<Self> {
        if path.exists() {
            let bytes = std::fs::read(path)?;
            let (stored, migrated) = decode_stored_identity(&bytes)?;
            if migrated {
                write_protected_identity(path, &stored)?;
            }
            let bytes: [u8; 32] = stored
                .signing_key
                .try_into()
                .map_err(|_| anyhow::anyhow!("stored identity key must be 32 bytes"))?;
            return Ok(Self::from_signing_key(
                stored.display_name,
                stored.hostname,
                SigningKey::from_bytes(&bytes),
            ));
        }

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let identity = Self::generate(display_name, hostname);
        let stored = StoredIdentity {
            display_name: identity.display_name.clone(),
            hostname: identity.hostname.clone(),
            signing_key: identity.signing_key.to_bytes().to_vec(),
        };
        write_protected_identity(path, &stored)?;
        Ok(identity)
    }

    pub fn persist_public_profile(
        &self,
        path: &Path,
        display_name: impl Into<String>,
        hostname: impl Into<String>,
    ) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let stored = StoredIdentity {
            display_name: display_name.into(),
            hostname: hostname.into(),
            signing_key: self.signing_key.to_bytes().to_vec(),
        };
        write_protected_identity(path, &stored)?;
        Ok(())
    }

    pub fn generate(display_name: String, hostname: String) -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        Self::from_signing_key(display_name, hostname, signing_key)
    }

    pub fn from_signing_key(
        display_name: String,
        hostname: String,
        signing_key: SigningKey,
    ) -> Self {
        let verifying_key = signing_key.verifying_key();
        let fingerprint = fingerprint_for_key(&verifying_key);
        let peer_id = fingerprint.clone();
        Self {
            display_name,
            hostname,
            signing_key,
            peer_id,
            fingerprint,
            sequence: AtomicU64::new(0),
        }
    }

    pub fn peer_id(&self) -> &str {
        &self.peer_id
    }

    pub fn display_name(&self) -> &str {
        &self.display_name
    }

    pub fn hostname(&self) -> &str {
        &self.hostname
    }

    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }

    pub fn public_identity(&self) -> PublicIdentity {
        PublicIdentity {
            peer_id: self.peer_id.clone(),
            display_name: self.display_name.clone(),
            hostname: self.hostname.clone(),
            public_key: self.signing_key.verifying_key().to_bytes().to_vec(),
            fingerprint: self.fingerprint.clone(),
        }
    }

    pub fn sign(&self, payload: &[u8]) -> Vec<u8> {
        self.signing_key.sign(payload).to_bytes().to_vec()
    }

    pub fn next_message_id(&self) -> String {
        let seq = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        format!("{}-{}-{}", self.peer_id, seq, Utc::now().timestamp_millis())
    }
}

pub fn verify_signature(public_key: &[u8], payload: &[u8], signature: &[u8]) -> bool {
    let Ok(public_key) = <[u8; 32]>::try_from(public_key) else {
        return false;
    };
    let Ok(signature) = <[u8; 64]>::try_from(signature) else {
        return false;
    };
    let Ok(verifying_key) = VerifyingKey::from_bytes(&public_key) else {
        return false;
    };
    verifying_key
        .verify(payload, &Signature::from_bytes(&signature))
        .is_ok()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredIdentity {
    display_name: String,
    hostname: String,
    signing_key: Vec<u8>,
}

fn decode_stored_identity(bytes: &[u8]) -> anyhow::Result<(StoredIdentity, bool)> {
    if let Ok(stored) = serde_json::from_slice::<StoredIdentity>(bytes) {
        return Ok((stored, true));
    }
    let protected = unprotect_secret_bytes(bytes)?;
    Ok((serde_json::from_slice(&protected)?, false))
}

fn write_protected_identity(path: &Path, identity: &StoredIdentity) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec(identity)?;
    std::fs::write(path, protect_secret_bytes(&json)?)?;
    Ok(())
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TrustError {
    #[error("peer id and fingerprint cannot be empty")]
    InvalidIdentity,
    #[error("peer fingerprint changed for {peer_id}: trusted {trusted}, presented {presented}")]
    FingerprintChanged {
        peer_id: String,
        trusted: String,
        presented: String,
    },
}

#[derive(Debug, Default, Clone)]
pub struct TrustBook {
    trusted: HashMap<String, String>,
}

impl TrustBook {
    pub fn verify_or_trust(
        &mut self,
        peer_id: impl Into<String>,
        fingerprint: impl Into<String>,
    ) -> Result<(), TrustError> {
        let peer_id = peer_id.into().trim().to_string();
        let fingerprint = fingerprint.into().trim().to_string();
        if peer_id.is_empty() || fingerprint.is_empty() {
            return Err(TrustError::InvalidIdentity);
        }
        match self.trusted.get(&peer_id) {
            Some(trusted) if trusted == &fingerprint => Ok(()),
            Some(trusted) => Err(TrustError::FingerprintChanged {
                peer_id,
                trusted: trusted.clone(),
                presented: fingerprint,
            }),
            None => {
                self.trusted.insert(peer_id, fingerprint);
                Ok(())
            }
        }
    }
}

pub fn fingerprint_for_key(key: &VerifyingKey) -> String {
    to_hex(&Sha256::digest(key.to_bytes()))
}

pub fn fingerprint_for_public_key(public_key: &[u8]) -> Option<String> {
    let bytes: [u8; 32] = public_key.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&bytes).ok()?;
    Some(fingerprint_for_key(&key))
}

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}
