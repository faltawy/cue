use std::time::Duration;

use reqwest::StatusCode;
use reqwest::header::{ACCEPT, AUTHORIZATION, HeaderMap, HeaderName, HeaderValue};
use url::Url;

use crate::{Error, Result};

pub const REPO: &str = "faltawy/cue";
pub const MANIFEST_ASSET: &str = "latest.json";
const API_VERSION_HEADER: HeaderName = HeaderName::from_static("x-github-api-version");
const API_VERSION: HeaderValue = HeaderValue::from_static("2022-11-28");

pub fn auth_headers(token: &str, accept: &'static str) -> Result<HeaderMap> {
    let mut bearer = HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|_| Error::Github("The GitHub token has invalid characters.".into()))?;
    bearer.set_sensitive(true);

    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, bearer);
    headers.insert(ACCEPT, HeaderValue::from_static(accept));
    headers.insert(API_VERSION_HEADER, API_VERSION);
    Ok(headers)
}

// The browser download URL of a private release asset rejects API tokens;
// only the API URL streams the file when asked for application/octet-stream.
pub fn manifest_asset_url(release: &serde_json::Value) -> Option<Url> {
    release
        .get("assets")?
        .as_array()?
        .iter()
        .find(|asset| asset.get("name").and_then(|n| n.as_str()) == Some(MANIFEST_ASSET))?
        .get("url")?
        .as_str()?
        .parse()
        .ok()
}

pub async fn latest_manifest_url(token: &str) -> Result<Url> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("cue-updater/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| Error::Github(error.to_string()))?;

    let response = client
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases/latest"
        ))
        .headers(auth_headers(token, "application/vnd.github+json")?)
        .send()
        .await
        .map_err(|error| Error::Github(format!("Couldn't reach GitHub: {error}")))?;

    match response.status() {
        status if status.is_success() => {}
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            return Err(Error::Github(
                "GitHub rejected the token. Create a new one and paste it again.".into(),
            ));
        }
        StatusCode::NOT_FOUND => {
            return Err(Error::Github(format!(
                "No release found. Check that the token can read {REPO}."
            )));
        }
        status => return Err(Error::Github(format!("GitHub returned {status}."))),
    }

    let release: serde_json::Value = response
        .json()
        .await
        .map_err(|error| Error::Github(format!("Unexpected GitHub response: {error}")))?;
    manifest_asset_url(&release)
        .ok_or_else(|| Error::Github(format!("The latest release has no {MANIFEST_ASSET} yet.")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_api_url_of_the_manifest_asset() {
        let release = serde_json::json!({
            "tag_name": "v0.2.0",
            "assets": [
                {
                    "name": "Cue_0.2.0_aarch64.app.tar.gz",
                    "url": "https://api.github.com/repos/faltawy/cue/releases/assets/11",
                    "browser_download_url": "https://github.com/faltawy/cue/releases/download/v0.2.0/Cue_0.2.0_aarch64.app.tar.gz"
                },
                {
                    "name": "latest.json",
                    "url": "https://api.github.com/repos/faltawy/cue/releases/assets/12",
                    "browser_download_url": "https://github.com/faltawy/cue/releases/download/v0.2.0/latest.json"
                }
            ]
        });

        assert_eq!(
            manifest_asset_url(&release).unwrap().as_str(),
            "https://api.github.com/repos/faltawy/cue/releases/assets/12"
        );
    }

    #[test]
    fn the_token_never_shows_up_in_debug_output_or_errors() {
        let token = "github_pat_11ABCDEFG0123456789";
        let headers = auth_headers(token, "application/octet-stream").unwrap();

        assert_eq!(
            headers.get(AUTHORIZATION).unwrap().to_str().unwrap(),
            format!("Bearer {token}")
        );
        assert!(!format!("{headers:?}").contains(token));

        let pasted_with_a_newline = format!("{token}\nextra");
        let error = auth_headers(&pasted_with_a_newline, "application/json").unwrap_err();
        assert!(!error.to_string().contains(token));
        assert!(!format!("{error:?}").contains(token));
    }

    #[test]
    fn a_release_without_a_manifest_has_no_update_url() {
        let release = serde_json::json!({
            "assets": [{
                "name": "Cue_0.2.0_aarch64.dmg",
                "url": "https://api.github.com/repos/faltawy/cue/releases/assets/10"
            }]
        });

        assert_eq!(manifest_asset_url(&release), None);
    }
}
