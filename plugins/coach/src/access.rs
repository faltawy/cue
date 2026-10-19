use std::fmt::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub const TOKEN_ENV: &str = "ANARLOG_COACH_TOKEN";
const LOGIN_LIFETIME_MS: u64 = 30_000;

pub fn new_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut out, byte| {
        let _ = write!(out, "{byte:02x}");
        out
    })
}

pub fn sign_code(token: &str, expires_ms: u64, nonce: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(token.as_bytes())
        .expect("HMAC accepts keys of any length");
    mac.update(format!("coach-auth:{expires_ms}:{nonce}").as_bytes());
    format!("{expires_ms}.{nonce}.{}", hex(&mac.finalize().into_bytes()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}

pub fn login_url(base_url: &str, token: &str) -> String {
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let code = sign_code(token, now_ms() + LOGIN_LIFETIME_MS, &nonce);
    format!("{base_url}/auth?code={code}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_match_the_coach_server_signer() {
        assert_eq!(
            sign_code("secret", 1_760_000_000_000, "00112233445566778899aabbccddeeff"),
            "1760000000000.00112233445566778899aabbccddeeff.4f8972c0ce6e10c7bf42ef07364e3cdd8c27e5473f2c88beb6a85f8c6907e79c"
        );
    }

    #[test]
    fn login_links_carry_a_fresh_short_lived_code_and_never_the_token() {
        let token = new_token();
        assert_eq!(token.len(), 64);
        let first = login_url("http://127.0.0.1:4747", &token);
        let second = login_url("http://127.0.0.1:4747", &token);
        assert!(first.starts_with("http://127.0.0.1:4747/auth?code="));
        assert_ne!(first, second);
        assert!(!first.contains(&token));
        let expires: u64 = first
            .trim_start_matches("http://127.0.0.1:4747/auth?code=")
            .split('.')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert!(expires > now_ms() && expires <= now_ms() + LOGIN_LIFETIME_MS);
    }
}
