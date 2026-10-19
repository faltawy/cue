use std::fmt;

use serde_json::Value;

const ERROR_KEY: &str = "$error";
const MAX_MESSAGE_CHARS: usize = 4_000;
const MAX_STACK_LINES: usize = 40;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ConsoleMessage {
    message: String,
    stack: Option<String>,
}

impl ConsoleMessage {
    pub(crate) fn from_args(args: &[Value]) -> Self {
        let mut stack = None;
        let parts: Vec<String> = args
            .iter()
            .map(|arg| match console_error(arg) {
                Some(error) => {
                    if stack.is_none() {
                        stack = error.stack.map(normalize_stack).filter(|s| !s.is_empty());
                    }
                    error.summary
                }
                None => render_value(arg),
            })
            .map(|part| single_line(&part))
            .collect();

        Self {
            message: truncate(&parts.join(" "), MAX_MESSAGE_CHARS),
            stack,
        }
    }
}

impl fmt::Display for ConsoleMessage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)?;
        if let Some(stack) = &self.stack {
            for line in stack.lines() {
                write!(f, "\n    {line}")?;
            }
        }
        Ok(())
    }
}

struct ConsoleError {
    summary: String,
    stack: Option<String>,
}

fn console_error(value: &Value) -> Option<ConsoleError> {
    let Value::Object(map) = value else {
        return None;
    };
    if map.len() != 1 {
        return None;
    }
    let error = map.get(ERROR_KEY)?.as_object()?;
    let text = |key: &str| {
        error
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    };

    let summary = match (text("name"), text("message")) {
        (Some(name), Some(message)) => format!("{name}: {message}"),
        (Some(name), None) => name.to_string(),
        (None, Some(message)) => message.to_string(),
        (None, None) => "Error".to_string(),
    };

    Some(ConsoleError {
        summary,
        stack: text("stack").map(str::to_string),
    })
}

fn render_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn single_line(text: &str) -> String {
    text.trim_end()
        .replace("\r\n", "\\n")
        .replace(['\n', '\r'], "\\n")
}

fn normalize_stack(stack: String) -> String {
    let lines: Vec<&str> = stack
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let omitted = lines.len().saturating_sub(MAX_STACK_LINES);
    let mut kept = lines[..lines.len() - omitted].join("\n");
    if omitted > 0 {
        kept.push_str(&format!("\n... {omitted} more frames"));
    }
    kept
}

fn truncate(text: &str, max_chars: usize) -> String {
    match text.char_indices().nth(max_chars) {
        Some((end, _)) => format!(
            "{}... [{} more chars]",
            &text[..end],
            text[end..].chars().count()
        ),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn render(args: Vec<Value>) -> String {
        ConsoleMessage::from_args(&args).to_string()
    }

    #[test]
    fn joins_arguments_like_the_browser_console() {
        assert_eq!(
            render(vec![
                json!("[stt] connected"),
                json!({ "provider": "soniox" }),
                json!(3),
                json!(true),
                json!(null),
                json!(["a", 1]),
            ]),
            r#"[stt] connected {"provider":"soniox"} 3 true null ["a",1]"#
        );
    }

    #[test]
    fn errors_render_name_message_and_indented_stack() {
        let rendered = render(vec![
            json!("failed to save note"),
            json!({ "$error": {
                "name": "TypeError",
                "message": "x is undefined",
                "stack": "save@http://localhost:1420/src/note.ts:10:5\n\nflush@http://localhost:1420/src/store.ts:3:1\n",
            }}),
        ]);

        assert_eq!(
            rendered,
            "failed to save note TypeError: x is undefined\n    save@http://localhost:1420/src/note.ts:10:5\n    flush@http://localhost:1420/src/store.ts:3:1"
        );
    }

    #[test]
    fn message_stays_on_one_line_and_only_the_stack_continues() {
        let rendered = render(vec![
            json!("first\nsecond\r\nthird\n"),
            json!({ "$error": { "name": "Error", "message": "boom", "stack": "a@x:1:1" } }),
        ]);

        assert_eq!(rendered, "first\\nsecond\\nthird Error: boom\n    a@x:1:1");
    }

    #[test]
    fn only_tagged_single_key_objects_are_errors() {
        assert_eq!(
            render(vec![json!({ "$error": { "message": "m" }, "extra": 1 })])
                .matches("$error")
                .count(),
            1
        );
        assert_eq!(
            render(vec![json!({ "$error": "text" })]),
            r#"{"$error":"text"}"#
        );
        assert_eq!(render(vec![json!({ "$error": {} })]), "Error");
    }

    #[test]
    fn long_messages_and_stacks_are_capped() {
        let long = "é".repeat(MAX_MESSAGE_CHARS + 25);
        let message = ConsoleMessage::from_args(&[json!(long)]);
        assert_eq!(
            message.message,
            format!("{}... [25 more chars]", "é".repeat(MAX_MESSAGE_CHARS))
        );

        let frames: Vec<String> = (0..MAX_STACK_LINES + 3)
            .map(|i| format!("f{i}@x:1:1"))
            .collect();
        let message = ConsoleMessage::from_args(&[json!({ "$error": {
            "name": "Error",
            "message": "deep",
            "stack": frames.join("\n"),
        }})]);
        let stack = message.stack.unwrap();
        assert_eq!(stack.lines().count(), MAX_STACK_LINES + 1);
        assert!(stack.starts_with("f0@x:1:1\n"));
        assert!(stack.ends_with(&format!(
            "f{}@x:1:1\n... 3 more frames",
            MAX_STACK_LINES - 1
        )));
    }

    #[test]
    fn no_arguments_render_empty() {
        assert_eq!(render(vec![]), "");
    }
}
