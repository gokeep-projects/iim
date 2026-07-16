use serde::{Deserialize, Serialize};

use crate::protocol::{ProtocolFrame, QUIC_PORT};

#[cfg(feature = "quic")]
use std::{net::SocketAddr, sync::Arc, time::Duration};

#[cfg(feature = "quic")]
use anyhow::{anyhow, Context};

#[cfg(feature = "quic")]
use quinn::rustls::{
    self,
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, PrivatePkcs8KeyDer, ServerName, UnixTime},
    DigitallySignedStruct, SignatureScheme,
};

pub const DEFAULT_HEARTBEAT_SECS: u64 = 15;
pub const DEFAULT_MAX_IDLE_TIMEOUT_SECS: u64 = 60;
pub const DEFAULT_OUTBOX_RETRY_AFTER_MILLIS: i64 = 10_000;
pub const DEFAULT_OUTBOX_MAX_ATTEMPTS: u32 = 3;
pub const DEFAULT_OUTBOX_BATCH_LIMIT: u32 = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportEndpoint {
    pub peer_id: String,
    pub address: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReceivedFrame {
    pub endpoint: TransportEndpoint,
    pub frame: ProtocolFrame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutboxDeliveryPolicy {
    pub retry_after_millis: i64,
    pub max_attempts: u32,
    pub batch_limit: u32,
}

impl OutboxDeliveryPolicy {
    pub const fn new(retry_after_millis: i64, max_attempts: u32, batch_limit: u32) -> Self {
        Self {
            retry_after_millis,
            max_attempts,
            batch_limit,
        }
    }

    pub fn retry_after_millis(self) -> i64 {
        self.retry_after_millis.max(0)
    }

    pub fn max_attempts(self) -> u32 {
        self.max_attempts.clamp(1, DEFAULT_OUTBOX_MAX_ATTEMPTS)
    }

    pub fn batch_limit(self) -> u32 {
        self.batch_limit.max(1)
    }
}

impl Default for OutboxDeliveryPolicy {
    fn default() -> Self {
        Self {
            retry_after_millis: DEFAULT_OUTBOX_RETRY_AFTER_MILLIS,
            max_attempts: DEFAULT_OUTBOX_MAX_ATTEMPTS,
            batch_limit: DEFAULT_OUTBOX_BATCH_LIMIT,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportConfig {
    pub listen_port: u16,
    pub heartbeat_secs: u64,
    pub max_idle_timeout_secs: u64,
    pub outbox: OutboxDeliveryPolicy,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            listen_port: QUIC_PORT,
            heartbeat_secs: DEFAULT_HEARTBEAT_SECS,
            max_idle_timeout_secs: DEFAULT_MAX_IDLE_TIMEOUT_SECS,
            outbox: OutboxDeliveryPolicy::default(),
        }
    }
}

#[derive(Clone)]
pub struct QuicTransport {
    config: TransportConfig,
    #[cfg(feature = "quic")]
    endpoint: Option<quinn::Endpoint>,
}

impl QuicTransport {
    pub fn new(config: TransportConfig) -> Self {
        Self {
            config,
            #[cfg(feature = "quic")]
            endpoint: None,
        }
    }

    pub fn config(&self) -> &TransportConfig {
        &self.config
    }

    pub fn outbox_policy(&self) -> OutboxDeliveryPolicy {
        self.config.outbox
    }

    #[cfg(feature = "quic")]
    pub fn bind(bind_addr: SocketAddr, config: TransportConfig) -> anyhow::Result<Self> {
        let mut endpoint = quinn::Endpoint::server(server_config(&config)?, bind_addr)
            .context("bind QUIC endpoint")?;
        endpoint.set_default_client_config(client_config(&config)?);
        Ok(Self {
            config,
            endpoint: Some(endpoint),
        })
    }

    #[cfg(feature = "quic")]
    pub fn local_addr(&self) -> anyhow::Result<SocketAddr> {
        self.endpoint()?
            .local_addr()
            .context("read QUIC local address")
    }

    #[cfg(feature = "quic")]
    pub async fn send_frame(
        &self,
        remote: SocketAddr,
        server_name: &str,
        frame: &ProtocolFrame,
    ) -> anyhow::Result<()> {
        let payload = frame.encode().context("encode protocol frame for QUIC")?;
        let connection = self
            .endpoint()?
            .connect(remote, server_name)
            .context("start QUIC connection")?
            .await
            .context("establish QUIC connection")?;
        let (mut send, _recv) = connection.open_bi().await.context("open QUIC stream")?;
        send.write_all(&payload).await.context("write QUIC frame")?;
        send.finish().context("finish QUIC stream")?;
        let _ = tokio::time::timeout(Duration::from_secs(2), send.stopped()).await;
        Ok(())
    }

    #[cfg(feature = "quic")]
    pub async fn accept_frame(&self, max_frame_size: usize) -> anyhow::Result<ReceivedFrame> {
        let incoming = self
            .endpoint()?
            .accept()
            .await
            .ok_or_else(|| anyhow!("QUIC endpoint closed"))?;
        let connection = incoming.await.context("accept QUIC connection")?;
        let remote = connection.remote_address();
        let (mut send, mut recv) = connection
            .accept_bi()
            .await
            .context("accept QUIC bidirectional stream")?;
        let bytes = recv
            .read_to_end(max_frame_size)
            .await
            .context("read QUIC frame")?;
        let _ = send.finish();
        Ok(ReceivedFrame {
            endpoint: TransportEndpoint {
                peer_id: String::new(),
                address: remote.to_string(),
            },
            frame: ProtocolFrame::decode(&bytes).context("decode QUIC protocol frame")?,
        })
    }

    #[cfg(feature = "quic")]
    fn endpoint(&self) -> anyhow::Result<&quinn::Endpoint> {
        self.endpoint
            .as_ref()
            .ok_or_else(|| anyhow!("QUIC endpoint is not bound"))
    }
}

impl Default for QuicTransport {
    fn default() -> Self {
        Self::new(TransportConfig::default())
    }
}

#[cfg(feature = "quic")]
fn client_config(config: &TransportConfig) -> anyhow::Result<quinn::ClientConfig> {
    let mut crypto = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(SkipServerVerification::new())
        .with_no_client_auth();
    crypto.alpn_protocols = vec![b"iim-lan/1".to_vec()];
    let mut client_config = quinn::ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto)
            .context("configure QUIC client TLS")?,
    ));
    client_config.transport_config(Arc::new(quinn_transport_config(config)?));
    Ok(client_config)
}

#[cfg(feature = "quic")]
fn server_config(config: &TransportConfig) -> anyhow::Result<quinn::ServerConfig> {
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".to_string()])
        .context("generate QUIC self-signed certificate")?;
    let cert_der = CertificateDer::from(cert.cert);
    let private_key = PrivatePkcs8KeyDer::from(cert.key_pair.serialize_der());
    let mut crypto = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], private_key.into())
        .context("configure QUIC server certificate")?;
    crypto.alpn_protocols = vec![b"iim-lan/1".to_vec()];

    let mut server_config = quinn::ServerConfig::with_crypto(Arc::new(
        quinn::crypto::rustls::QuicServerConfig::try_from(crypto)
            .context("configure QUIC server TLS")?,
    ));
    server_config.transport_config(Arc::new(quinn_transport_config(config)?));
    Ok(server_config)
}

#[cfg(feature = "quic")]
fn quinn_transport_config(config: &TransportConfig) -> anyhow::Result<quinn::TransportConfig> {
    let mut transport = quinn::TransportConfig::default();
    transport.keep_alive_interval(Some(Duration::from_secs(config.heartbeat_secs.max(1))));
    transport.max_idle_timeout(Some(
        quinn::IdleTimeout::try_from(Duration::from_secs(config.max_idle_timeout_secs.max(1)))
            .context("configure QUIC max idle timeout")?,
    ));
    transport.max_concurrent_uni_streams(0_u8.into());
    Ok(transport)
}

#[cfg(feature = "quic")]
#[derive(Debug)]
struct SkipServerVerification(Arc<rustls::crypto::CryptoProvider>);

#[cfg(feature = "quic")]
impl SkipServerVerification {
    fn new() -> Arc<Self> {
        Arc::new(Self(Arc::new(rustls::crypto::ring::default_provider())))
    }
}

#[cfg(feature = "quic")]
impl ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}
