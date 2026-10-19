use std::io::{self, Write};
use std::sync::LazyLock;

use regex::Regex;

static SECRET_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\b(bearer\s+|api[_ -]?key"?[=:]\s*"?|token"?[=:]\s*"?)[a-z0-9._~+/=-]{8,}"#)
        .expect("Invalid regex")
});

pub fn redact_text(value: &str) -> String {
    SECRET_REGEX
        .replace_all(value, "$1[SECRET_REDACTED]")
        .into_owned()
}

pub struct RedactingWriter<W: Write> {
    inner: W,
    buffer: Vec<u8>,
}

impl<W: Write> RedactingWriter<W> {
    pub fn new(inner: W) -> Self {
        Self {
            inner,
            buffer: Vec::with_capacity(8192),
        }
    }

    fn flush_buffer(&mut self) -> io::Result<()> {
        if self.buffer.is_empty() {
            return Ok(());
        }

        let line = String::from_utf8_lossy(&self.buffer);
        let redacted = redact_text(&line);
        self.inner.write_all(redacted.as_bytes())?;

        self.buffer.clear();
        Ok(())
    }
}

impl<W: Write> Write for RedactingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut last_newline_pos = 0;

        for (i, &byte) in buf.iter().enumerate() {
            if byte == b'\n' {
                self.buffer.extend_from_slice(&buf[last_newline_pos..=i]);
                self.flush_buffer()?;
                last_newline_pos = i + 1;
            }
        }

        if last_newline_pos < buf.len() {
            self.buffer.extend_from_slice(&buf[last_newline_pos..]);
        }

        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.flush_buffer()?;
        self.inner.flush()
    }
}

impl<W: Write> Drop for RedactingWriter<W> {
    fn drop(&mut self) {
        let _ = self.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_through(chunks: &[&str]) -> String {
        let mut output = Vec::new();
        {
            let mut writer = RedactingWriter::new(&mut output);
            for chunk in chunks {
                writer.write_all(chunk.as_bytes()).unwrap();
            }
            writer.flush().unwrap();
        }
        String::from_utf8(output).unwrap()
    }

    #[test]
    fn redacts_only_secrets() {
        for (input, expected) in [
            (
                "authorization Bearer abcdefghijklmnop",
                "authorization Bearer [SECRET_REDACTED]",
            ),
            ("api_key=sk_live_12345678", "api_key=[SECRET_REDACTED]"),
            ("token: abcdefgh1234", "token: [SECRET_REDACTED]"),
            (
                r#"connect api_key="sk_live_12345678" provider="soniox""#,
                r#"connect api_key="[SECRET_REDACTED]" provider="soniox""#,
            ),
            (
                r#"{"token":"abcdefgh1234"}"#,
                r#"{"token":"[SECRET_REDACTED]"}"#,
            ),
            (
                "session 550e8400-e29b-41d4-a716-446655440000 failed",
                "session 550e8400-e29b-41d4-a716-446655440000 failed",
            ),
            (
                "From alice@test.org via 127.0.0.1:8080 at /Users/alice/file",
                "From alice@test.org via 127.0.0.1:8080 at /Users/alice/file",
            ),
        ] {
            assert_eq!(write_through(&[input, "\n"]), format!("{expected}\n"));
        }
    }

    #[test]
    fn keeps_provider_account_errors() {
        assert_eq!(
            write_through(&["soniox rejected request: 402 Payment Required\n"]),
            "soniox rejected request: 402 Payment Required\n"
        );
    }

    #[test]
    fn redacts_secrets_split_across_writes() {
        assert_eq!(
            write_through(&["auth Bearer abcd", "efghijkl end\n", "line2\n"]),
            "auth Bearer [SECRET_REDACTED] end\nline2\n"
        );
    }

    #[test]
    fn passes_through_empty_and_blank_input() {
        for input in ["", "\n\n\n"] {
            assert_eq!(write_through(&[input]), input);
        }
    }
}
