use std::collections::BTreeMap;

use base64::Engine;

use crate::{Error, Result};

pub const SECRET_SCOPE: &str = "coach-mcp";

#[derive(
    Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum McpAuth {
    #[default]
    None,
    Bearer,
    Basic {
        username: String,
    },
    Header {
        name: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum McpSecret {
    Token { token: String },
    Basic { password: String },
    Header { value: String },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum McpSecretInput {
    Token { token: String },
    Basic { password: String },
    Header { value: String },
}

impl From<McpSecretInput> for McpSecret {
    fn from(input: McpSecretInput) -> Self {
        match input {
            McpSecretInput::Token { token } => Self::Token { token },
            McpSecretInput::Basic { password } => Self::Basic { password },
            McpSecretInput::Header { value } => Self::Header { value },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum McpAuthState {
    Ready,
    NeedsSecret,
    Rejected,
    Unreachable,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct McpServerStatus {
    pub name: String,
    pub state: McpAuthState,
}

pub trait SecretStore {
    fn get(&self, key: &str) -> Result<Option<String>>;
    fn set(&self, key: &str, value: &str) -> Result<()>;
    fn delete(&self, key: &str) -> Result<()>;
}

pub struct KeychainSecrets<'a>(pub &'a tauri::AppHandle);

impl SecretStore for KeychainSecrets<'_> {
    fn get(&self, key: &str) -> Result<Option<String>> {
        tauri_plugin_store2::read_secret_blocking(self.0, SECRET_SCOPE, key).map_err(Error::Other)
    }

    fn set(&self, key: &str, value: &str) -> Result<()> {
        tauri_plugin_store2::write_secret_blocking(self.0, SECRET_SCOPE, key, value)
            .map_err(Error::Other)
    }

    fn delete(&self, key: &str) -> Result<()> {
        tauri_plugin_store2::delete_secret_blocking(self.0, SECRET_SCOPE, key).map_err(Error::Other)
    }
}

pub fn read_secret(store: &dyn SecretStore, server: &str) -> Result<Option<McpSecret>> {
    store
        .get(server)?
        .map(|raw| serde_json::from_str(&raw).map_err(Error::from))
        .transpose()
}

pub fn write_secret(store: &dyn SecretStore, server: &str, secret: &McpSecret) -> Result<()> {
    store.set(server, &serde_json::to_string(secret)?)
}

/// Ready only when the server accepts the stored secret, so the badge matches what the coach will see.
pub async fn connection_state(
    http: &reqwest::Client,
    url: &str,
    auth: &McpAuth,
    secret: Option<&McpSecret>,
) -> McpAuthState {
    let Some(headers) = headers_for(auth, secret) else {
        return McpAuthState::NeedsSecret;
    };
    match crate::probe::probe(http, url, &headers).await {
        crate::probe::McpProbe::None { .. } => McpAuthState::Ready,
        crate::probe::McpProbe::Bearer { .. } | crate::probe::McpProbe::Basic => {
            McpAuthState::Rejected
        }
        crate::probe::McpProbe::Unreachable { .. } | crate::probe::McpProbe::NotMcp { .. } => {
            McpAuthState::Unreachable
        }
    }
}

pub fn headers_for(auth: &McpAuth, secret: Option<&McpSecret>) -> Option<BTreeMap<String, String>> {
    let header = match (auth, secret) {
        (McpAuth::None, _) => return Some(BTreeMap::new()),
        (McpAuth::Bearer, Some(McpSecret::Token { token })) => {
            ("Authorization".to_string(), format!("Bearer {token}"))
        }
        (McpAuth::Basic { username }, Some(McpSecret::Basic { password })) => {
            let encoded =
                base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
            ("Authorization".to_string(), format!("Basic {encoded}"))
        }
        (McpAuth::Header { name }, Some(McpSecret::Header { value })) => {
            (name.clone(), value.clone())
        }
        _ => return None,
    };
    Some(BTreeMap::from([header]))
}

pub fn legacy_auth(headers: &BTreeMap<String, String>) -> Option<(McpAuth, McpSecret)> {
    let (name, value) = headers.iter().find(|(_, value)| !value.is_empty())?;
    if name.eq_ignore_ascii_case("authorization")
        && let Some(token) = value.strip_prefix("Bearer ")
    {
        return Some((
            McpAuth::Bearer,
            McpSecret::Token {
                token: token.to_string(),
            },
        ));
    }
    Some((
        McpAuth::Header { name: name.clone() },
        McpSecret::Header {
            value: value.clone(),
        },
    ))
}

#[cfg(test)]
pub mod memory {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::SecretStore;
    use crate::Result;

    #[derive(Default)]
    pub struct MemorySecrets(pub Mutex<HashMap<String, String>>);

    impl SecretStore for MemorySecrets {
        fn get(&self, key: &str) -> Result<Option<String>> {
            Ok(self.0.lock().unwrap().get(key).cloned())
        }

        fn set(&self, key: &str, value: &str) -> Result<()> {
            self.0.lock().unwrap().insert(key.into(), value.into());
            Ok(())
        }

        fn delete(&self, key: &str) -> Result<()> {
            self.0.lock().unwrap().remove(key);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_auth_kind_turns_its_secret_into_the_right_header() {
        let header = |auth: &McpAuth, secret: McpSecret| headers_for(auth, Some(&secret)).unwrap();

        assert_eq!(headers_for(&McpAuth::None, None), Some(BTreeMap::new()));
        assert_eq!(
            header(&McpAuth::Bearer, McpSecret::Token { token: "t1".into() }),
            BTreeMap::from([("Authorization".into(), "Bearer t1".into())])
        );
        assert_eq!(
            header(
                &McpAuth::Basic {
                    username: "falta".into()
                },
                McpSecret::Basic {
                    password: "pw".into()
                }
            ),
            BTreeMap::from([("Authorization".into(), "Basic ZmFsdGE6cHc=".into())])
        );
        assert_eq!(
            header(
                &McpAuth::Header {
                    name: "X-Api-Key".into()
                },
                McpSecret::Header { value: "k".into() }
            ),
            BTreeMap::from([("X-Api-Key".into(), "k".into())])
        );
    }

    #[test]
    fn a_missing_or_mismatched_secret_gives_no_headers() {
        assert_eq!(headers_for(&McpAuth::Bearer, None), None);
        assert_eq!(
            headers_for(
                &McpAuth::Bearer,
                Some(&McpSecret::Header { value: "x".into() })
            ),
            None
        );
    }

    #[tokio::test]
    async fn ready_means_the_server_accepted_the_stored_secret() {
        use axum::{Router, http::HeaderMap, response::IntoResponse, routing::post};

        let router = Router::new().route(
            "/mcp",
            post(|headers: HeaderMap| async move {
                if headers.get("authorization").and_then(|v| v.to_str().ok()) != Some("Bearer good")
                {
                    return (
                        axum::http::StatusCode::UNAUTHORIZED,
                        [("www-authenticate", "Bearer")],
                        "",
                    )
                        .into_response();
                }
                axum::Json(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "protocolVersion": crate::probe::PROTOCOL_VERSION,
                        "capabilities": {},
                        "serverInfo": { "name": "clients", "version": "1" },
                    },
                }))
                .into_response()
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/mcp", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let http = reqwest::Client::new();
        let state = |token: Option<&str>| {
            let secret = token.map(|token| McpSecret::Token {
                token: token.into(),
            });
            let (http, url) = (http.clone(), url.clone());
            async move { connection_state(&http, &url, &McpAuth::Bearer, secret.as_ref()).await }
        };

        assert_eq!(state(Some("good")).await, McpAuthState::Ready);
        assert_eq!(state(Some("stale")).await, McpAuthState::Rejected);
        assert_eq!(state(None).await, McpAuthState::NeedsSecret);
        assert_eq!(
            connection_state(&http, "http://127.0.0.1:9/mcp", &McpAuth::None, None).await,
            McpAuthState::Unreachable
        );
    }

    #[test]
    fn legacy_plaintext_headers_become_a_bearer_token_or_a_custom_header() {
        assert_eq!(
            legacy_auth(&BTreeMap::from([(
                "Authorization".into(),
                "Bearer abc".into()
            )])),
            Some((
                McpAuth::Bearer,
                McpSecret::Token {
                    token: "abc".into()
                }
            ))
        );
        assert_eq!(
            legacy_auth(&BTreeMap::from([("X-Key".into(), "v".into())])),
            Some((
                McpAuth::Header {
                    name: "X-Key".into()
                },
                McpSecret::Header { value: "v".into() }
            ))
        );
        assert_eq!(legacy_auth(&BTreeMap::new()), None);
    }
}
