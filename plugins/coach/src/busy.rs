use std::time::Duration;

use crate::process::Endpoint;

const TIMEOUT: Duration = Duration::from_secs(2);

#[derive(serde::Deserialize)]
struct Busy {
    busy: bool,
}

// Unknown counts as answering: a restart must never cut off an answer.
pub(crate) async fn answering(client: &reqwest::Client, endpoint: &Endpoint) -> bool {
    let response = client
        .get(format!("{}/busy", endpoint.url))
        .bearer_auth(&endpoint.token)
        .timeout(TIMEOUT)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status);
    let busy = match response {
        Ok(response) => response.json::<Busy>().await,
        Err(error) => Err(error),
    };
    busy.map(|Busy { busy }| busy).unwrap_or_else(|error| {
        tracing::warn!(%error, "coach_busy_probe_failed");
        true
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    use axum::Router;
    use axum::extract::State;
    use axum::http::{HeaderMap, StatusCode, header};
    use axum::response::{IntoResponse, Response};
    use axum::routing::get;

    use super::*;

    const TOKEN: &str = "launch-token";

    async fn busy_route(State(busy): State<Arc<AtomicBool>>, headers: HeaderMap) -> Response {
        let authorized = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            == Some(&format!("Bearer {TOKEN}"));
        if !authorized {
            return (StatusCode::UNAUTHORIZED, "Sign in from Cue.").into_response();
        }
        axum::Json(serde_json::json!({ "busy": busy.load(Ordering::SeqCst) })).into_response()
    }

    async fn coach(busy: bool) -> (String, Arc<AtomicBool>) {
        let state = Arc::new(AtomicBool::new(busy));
        let app = Router::new()
            .route("/busy", get(busy_route))
            .with_state(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (url, state)
    }

    fn endpoint(url: &str, token: &str) -> Endpoint {
        Endpoint {
            url: url.into(),
            token: token.into(),
        }
    }

    #[tokio::test]
    async fn reads_the_coach_busy_flag_with_the_launch_token() {
        let client = reqwest::Client::new();
        let (url, busy) = coach(true).await;

        assert!(answering(&client, &endpoint(&url, TOKEN)).await);

        busy.store(false, Ordering::SeqCst);
        assert!(!answering(&client, &endpoint(&url, TOKEN)).await);
    }

    #[tokio::test]
    async fn a_refused_or_unreachable_probe_counts_as_answering() {
        let client = reqwest::Client::new();
        let (url, _busy) = coach(false).await;

        assert!(!answering(&client, &endpoint(&url, TOKEN)).await);
        assert!(answering(&client, &endpoint(&url, "stale-token")).await);

        let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let unreachable = format!("http://{}", closed.local_addr().unwrap());
        drop(closed);
        assert!(answering(&client, &endpoint(&unreachable, TOKEN)).await);
    }
}
