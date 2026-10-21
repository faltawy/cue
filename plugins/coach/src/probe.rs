use std::time::Duration;

use reqwest::StatusCode;
use reqwest::header::{ACCEPT, CONTENT_TYPE, WWW_AUTHENTICATE};
use url::Url;

pub const PROTOCOL_VERSION: &str = "2025-06-18";
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum McpProbe {
    None {
        server_name: Option<String>,
        server_version: Option<String>,
    },
    Bearer {
        browser_sign_in: bool,
    },
    Basic,
    Unreachable {
        reason: String,
    },
    NotMcp {
        status: u16,
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Challenge {
    pub scheme: String,
    pub params: Vec<(String, String)>,
}

impl Challenge {
    fn param(&self, name: &str) -> Option<&str> {
        self.params
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

pub fn parse_www_authenticate(header: &str) -> Vec<Challenge> {
    let mut challenges: Vec<Challenge> = Vec::new();
    let mut rest = header.trim();
    while !rest.is_empty() {
        rest = rest.trim_start_matches([',', ' ', '\t']);
        if rest.is_empty() {
            break;
        }
        let token_end = rest.find([' ', ',', '=']).unwrap_or(rest.len());
        let token = &rest[..token_end];
        let after = &rest[token_end..];
        if after.trim_start().starts_with('=') && !challenges.is_empty() {
            let value_start = after.trim_start()[1..].trim_start();
            let (value, remaining) = if let Some(quoted) = value_start.strip_prefix('"') {
                let mut value = String::new();
                let mut chars = quoted.char_indices();
                let mut end = quoted.len();
                while let Some((index, c)) = chars.next() {
                    match c {
                        '\\' => {
                            if let Some((_, escaped)) = chars.next() {
                                value.push(escaped);
                            }
                        }
                        '"' => {
                            end = index + 1;
                            break;
                        }
                        c => value.push(c),
                    }
                }
                (value, &quoted[end..])
            } else {
                let end = value_start.find(',').unwrap_or(value_start.len());
                (value_start[..end].trim().to_string(), &value_start[end..])
            };
            if let Some(last) = challenges.last_mut() {
                last.params.push((token.to_string(), value));
            }
            rest = remaining;
        } else {
            challenges.push(Challenge {
                scheme: token.to_string(),
                params: Vec::new(),
            });
            rest = after;
        }
    }
    challenges
}

fn initialize_request() -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "cue-coach", "version": env!("CARGO_PKG_VERSION") },
        },
    })
}

pub fn initialize_result(content_type: &str, body: &str) -> Option<serde_json::Value> {
    let message: serde_json::Value = if content_type.starts_with("text/event-stream") {
        body.lines()
            .filter_map(|line| line.strip_prefix("data:"))
            .find_map(|data| serde_json::from_str(data.trim()).ok())?
    } else {
        serde_json::from_str(body).ok()?
    };
    let result = message.get("result")?;
    result.get("protocolVersion")?;
    Some(result.clone())
}

fn describe_send_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "the server didn't answer within 8 seconds".to_string()
    } else if error.is_connect() {
        "nothing is listening at that address".to_string()
    } else {
        let mut message = error.to_string();
        let mut source = std::error::Error::source(error);
        while let Some(cause) = source {
            message = format!("{message}: {cause}");
            source = cause.source();
        }
        message
    }
}

pub async fn probe(client: &reqwest::Client, url: &str) -> McpProbe {
    let Ok(resource) = Url::parse(url) else {
        return McpProbe::Unreachable {
            reason: format!("{url} is not a valid address"),
        };
    };
    if !matches!(resource.scheme(), "http" | "https") {
        return McpProbe::Unreachable {
            reason: "use an http:// or https:// address".to_string(),
        };
    }

    let response = match client
        .post(resource.clone())
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "application/json, text/event-stream")
        .timeout(TIMEOUT)
        .json(&initialize_request())
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return McpProbe::Unreachable {
                reason: describe_send_error(&error),
            };
        }
    };

    let status = response.status();
    let challenges = response
        .headers()
        .get_all(WWW_AUTHENTICATE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(parse_www_authenticate)
        .collect::<Vec<_>>();

    if status.is_success() {
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        let body = response.text().await.unwrap_or_default();
        return match initialize_result(&content_type, &body) {
            Some(result) => {
                let info = result.get("serverInfo");
                let text = |key: &str| {
                    info.and_then(|info| info.get(key))
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string)
                };
                McpProbe::None {
                    server_name: text("name"),
                    server_version: text("version"),
                }
            }
            None => McpProbe::NotMcp {
                status: status.as_u16(),
                message: "the address answered, but not as an MCP server".to_string(),
            },
        };
    }

    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        let bearer = challenges
            .iter()
            .find(|challenge| challenge.scheme.eq_ignore_ascii_case("bearer"));
        let basic = challenges
            .iter()
            .any(|challenge| challenge.scheme.eq_ignore_ascii_case("basic"));
        if basic && bearer.is_none() {
            return McpProbe::Basic;
        }
        return McpProbe::Bearer {
            browser_sign_in: bearer
                .and_then(|challenge| challenge.param("resource_metadata"))
                .is_some(),
        };
    }

    McpProbe::NotMcp {
        status: status.as_u16(),
        message: format!(
            "the address answered {status}, which isn't an MCP server endpoint; check the path (often /mcp)"
        ),
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use axum::Router;
    use axum::http::{HeaderMap, StatusCode, header};
    use axum::response::IntoResponse;
    use axum::routing::post;

    use super::*;

    async fn serve(router: Router) -> SocketAddr {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        address
    }

    fn initialize_ok() -> serde_json::Value {
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "serverInfo": { "name": "clients", "version": "1.2.0" },
            },
        })
    }

    async fn probe_at(address: SocketAddr, path: &str) -> McpProbe {
        probe(&reqwest::Client::new(), &format!("http://{address}{path}")).await
    }

    fn unauthorized(challenge: &str) -> impl IntoResponse + Clone + use<> {
        let challenge = challenge.to_string();
        (
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, challenge)],
            "",
        )
    }

    #[test]
    fn www_authenticate_parses_schemes_and_quoted_params() {
        assert_eq!(
            parse_www_authenticate(
                r#"Bearer realm="mcp", resource_metadata="https://x.test/.well-known/oauth-protected-resource", scope="read write""#
            ),
            vec![Challenge {
                scheme: "Bearer".into(),
                params: vec![
                    ("realm".into(), "mcp".into()),
                    (
                        "resource_metadata".into(),
                        "https://x.test/.well-known/oauth-protected-resource".into()
                    ),
                    ("scope".into(), "read write".into()),
                ],
            }]
        );
        assert_eq!(
            parse_www_authenticate(r#"Basic realm="a", Bearer"#)
                .iter()
                .map(|challenge| challenge.scheme.as_str())
                .collect::<Vec<_>>(),
            vec!["Basic", "Bearer"]
        );
    }

    #[test]
    fn initialize_result_reads_json_and_sse_bodies_and_rejects_other_json() {
        let json = initialize_ok().to_string();
        assert!(initialize_result("application/json", &json).is_some());
        assert!(
            initialize_result(
                "text/event-stream",
                &format!("event: message\ndata: {json}\n\n")
            )
            .is_some()
        );
        assert!(initialize_result("application/json", r#"{"ok": true}"#).is_none());
        assert!(initialize_result("text/html", "<html></html>").is_none());
    }

    #[tokio::test]
    async fn a_server_that_answers_initialize_needs_no_sign_in() {
        let address = serve(Router::new().route(
            "/mcp",
            post(|headers: HeaderMap| async move {
                assert!(headers.get(header::AUTHORIZATION).is_none());
                axum::Json(initialize_ok())
            }),
        ))
        .await;

        assert_eq!(
            probe_at(address, "/mcp").await,
            McpProbe::None {
                server_name: Some("clients".into()),
                server_version: Some("1.2.0".into()),
            }
        );
    }

    #[tokio::test]
    async fn a_plain_bearer_challenge_without_metadata_asks_for_a_token() {
        let address =
            serve(Router::new().route("/mcp", post(|| async { unauthorized("Bearer") }))).await;

        assert_eq!(
            probe_at(address, "/mcp").await,
            McpProbe::Bearer {
                browser_sign_in: false
            }
        );
    }

    #[tokio::test]
    async fn an_unauthorized_answer_without_a_challenge_asks_for_a_token() {
        let address =
            serve(Router::new().route("/mcp", post(|| async { StatusCode::UNAUTHORIZED }))).await;

        assert_eq!(
            probe_at(address, "/mcp").await,
            McpProbe::Bearer {
                browser_sign_in: false
            }
        );
    }

    #[tokio::test]
    async fn a_basic_challenge_asks_for_a_user_name_and_password() {
        let address = serve(Router::new().route(
            "/mcp",
            post(|| async { unauthorized(r#"Basic realm="mcp""#) }),
        ))
        .await;

        assert_eq!(probe_at(address, "/mcp").await, McpProbe::Basic);
    }

    #[tokio::test]
    async fn an_oauth_style_challenge_asks_for_a_token_with_a_browser_sign_in_hint() {
        let address = serve(Router::new().route(
            "/mcp",
            post(|| async {
                unauthorized(
                    r#"Bearer realm="OAuth", resource_metadata="https://x.test/.well-known/oauth-protected-resource/mcp", scope="read write""#,
                )
            }),
        ))
        .await;

        assert_eq!(
            probe_at(address, "/mcp").await,
            McpProbe::Bearer {
                browser_sign_in: true
            }
        );
    }

    #[tokio::test]
    async fn wrong_paths_and_non_mcp_answers_are_reported_as_not_mcp() {
        let address = serve(
            Router::new()
                .route("/html", post(|| async { "<html>hello</html>" }))
                .route(
                    "/json",
                    post(|| async { axum::Json(serde_json::json!({"ok": true})) }),
                ),
        )
        .await;

        assert!(matches!(
            probe_at(address, "/missing").await,
            McpProbe::NotMcp { status: 404, .. }
        ));
        assert!(matches!(
            probe_at(address, "/html").await,
            McpProbe::NotMcp { status: 200, .. }
        ));
        assert!(matches!(
            probe_at(address, "/json").await,
            McpProbe::NotMcp { status: 200, .. }
        ));
    }

    #[tokio::test]
    async fn nothing_listening_or_a_bad_address_is_unreachable() {
        let port = crate::process::free_port().unwrap();
        assert!(matches!(
            probe(
                &reqwest::Client::new(),
                &format!("http://127.0.0.1:{port}/mcp")
            )
            .await,
            McpProbe::Unreachable { .. }
        ));
        assert!(matches!(
            probe(&reqwest::Client::new(), "not a url").await,
            McpProbe::Unreachable { .. }
        ));
        assert!(matches!(
            probe(&reqwest::Client::new(), "ftp://127.0.0.1/mcp").await,
            McpProbe::Unreachable { .. }
        ));
    }
}
