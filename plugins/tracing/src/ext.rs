use std::path::PathBuf;

pub struct Tracing<'a, R: tauri::Runtime, M: tauri::Manager<R>> {
    manager: &'a M,
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<'a, R: tauri::Runtime, M: tauri::Manager<R>> Tracing<'a, R, M> {
    pub fn logs_dir(&self) -> Result<PathBuf, crate::Error> {
        let logs_dir = self
            .manager
            .path()
            .app_log_dir()
            .map_err(|e| crate::Error::PathResolver(e.to_string()))?;
        std::fs::create_dir_all(&logs_dir)
            .map_err(|e| crate::Error::PathResolver(format!("create logs dir: {}", e)))?;
        Ok(logs_dir)
    }

    pub fn do_log(&self, level: Level, data: Vec<serde_json::Value>) -> Result<(), crate::Error> {
        let message = crate::console::ConsoleMessage::from_args(&data);
        match level {
            Level::Trace => tracing::trace!(target: super::WEBVIEW_CONSOLE_TARGET, "{message}"),
            Level::Debug => tracing::debug!(target: super::WEBVIEW_CONSOLE_TARGET, "{message}"),
            Level::Info => tracing::info!(target: super::WEBVIEW_CONSOLE_TARGET, "{message}"),
            Level::Warn => tracing::warn!(target: super::WEBVIEW_CONSOLE_TARGET, "{message}"),
            Level::Error => tracing::error!(target: super::WEBVIEW_CONSOLE_TARGET, "{message}"),
        }
        Ok(())
    }
}

impl<R: tauri::Runtime, M: tauri::Manager<R>> Tracing<'_, R, M> {
    pub fn log_content(&self) -> Result<Option<String>, crate::Error> {
        let logs_dir = self.logs_dir()?;
        Ok(read_log_content(&logs_dir))
    }
}

const LOG_READ_CHUNK_BYTES: u64 = 64 * 1024;
const MAX_CONTINUATION_LINES: usize = 50;

fn read_log_content(logs_dir: &std::path::Path) -> Option<String> {
    const TARGET_RECORDS: usize = 300;
    const MAX_ROTATED_FILES: usize = 5;

    let log_files = std::iter::once(logs_dir.join("app.log"))
        .chain((1..=MAX_ROTATED_FILES).map(|i| logs_dir.join(format!("app.log.{}", i))));

    let mut records: Vec<String> = Vec::new();

    'files: for log_path in log_files {
        let Ok(lines) = ReverseLines::open(&log_path) else {
            continue;
        };
        let mut continuation = std::collections::VecDeque::new();
        for line in lines {
            if line.is_empty() {
                continue;
            }
            if !is_record_start(&line) {
                continuation.push_back(line);
                if continuation.len() > MAX_CONTINUATION_LINES {
                    continuation.pop_front();
                }
                continue;
            }
            let mut record = line;
            for continued in continuation.drain(..).rev() {
                record.push('\n');
                record.push_str(&continued);
            }
            records.push(record);
            if records.len() >= TARGET_RECORDS {
                break 'files;
            }
        }
    }

    if records.is_empty() {
        return None;
    }

    records.reverse();
    Some(records.join("\n"))
}

fn is_record_start(line: &str) -> bool {
    let bytes = line.as_bytes();
    bytes.len() > 10
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
}

struct ReverseLines {
    file: std::fs::File,
    pos: u64,
    carry: Vec<u8>,
    lines: Vec<String>,
}

impl ReverseLines {
    fn open(path: &std::path::Path) -> std::io::Result<Self> {
        let file = std::fs::File::open(path)?;
        let pos = file.metadata()?.len();
        Ok(Self {
            file,
            pos,
            carry: Vec::new(),
            lines: Vec::new(),
        })
    }

    fn read_previous_chunk(&mut self) -> std::io::Result<()> {
        use std::io::{Read, Seek, SeekFrom};

        let len = self.pos.min(LOG_READ_CHUNK_BYTES);
        self.pos -= len;
        self.file.seek(SeekFrom::Start(self.pos))?;
        let mut chunk = vec![0; len as usize];
        self.file.read_exact(&mut chunk)?;
        chunk.append(&mut self.carry);

        let mut parts = chunk.split(|byte| *byte == b'\n');
        self.carry = parts.next().unwrap_or_default().to_vec();
        self.lines = parts.map(decode_line).collect();
        Ok(())
    }
}

impl Iterator for ReverseLines {
    type Item = String;

    fn next(&mut self) -> Option<String> {
        loop {
            if let Some(line) = self.lines.pop() {
                return Some(line);
            }
            if self.pos == 0 {
                return (!self.carry.is_empty())
                    .then(|| decode_line(&std::mem::take(&mut self.carry)));
            }
            self.read_previous_chunk().ok()?;
        }
    }
}

fn decode_line(bytes: &[u8]) -> String {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    String::from_utf8_lossy(bytes).into_owned()
}

pub trait TracingPluginExt<R: tauri::Runtime> {
    fn tracing(&self) -> Tracing<'_, R, Self>
    where
        Self: tauri::Manager<R> + Sized;
}

impl<R: tauri::Runtime, T: tauri::Manager<R>> TracingPluginExt<R> for T {
    fn tracing(&self) -> Tracing<'_, R, Self>
    where
        Self: Sized,
    {
        Tracing {
            manager: self,
            _runtime: std::marker::PhantomData,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub enum Level {
    #[serde(rename = "TRACE")]
    Trace,
    #[serde(rename = "DEBUG")]
    Debug,
    #[serde(rename = "INFO")]
    Info,
    #[serde(rename = "WARN")]
    Warn,
    #[serde(rename = "ERROR")]
    Error,
}

pub const JS_INIT_SCRIPT: &str = r#"
(function() {
    function describeError(error) {
        return {
            "$error": {
                name: String(error.name || "Error"),
                message: String(error.message || ""),
                stack: typeof error.stack === "string" ? error.stack : null,
            },
        };
    }

    function toLoggable(value) {
        if (value instanceof Error) {
            return describeError(value);
        }
        switch (typeof value) {
            case "string":
                return value;
            case "undefined":
                return "undefined";
            case "bigint":
                return value.toString() + "n";
            case "symbol":
                return value.toString();
            case "function":
                return "[Function " + (value.name || "anonymous") + "]";
        }
        try {
            const seen = new WeakSet();
            const json = JSON.stringify(value, function(_key, item) {
                if (item instanceof Error) {
                    return describeError(item);
                }
                if (typeof item === "bigint") {
                    return item.toString() + "n";
                }
                if (typeof item === "function") {
                    return "[Function " + (item.name || "anonymous") + "]";
                }
                if (typeof item === "object" && item !== null) {
                    if (seen.has(item)) {
                        return "[Circular]";
                    }
                    seen.add(item);
                }
                return item;
            });
            return json === undefined ? String(value) : JSON.parse(json);
        } catch (_) {
            try {
                return String(value);
            } catch (_) {
                return "[Unserializable]";
            }
        }
    }

    function initConsoleOverride() {
        if (typeof window.__TAURI__ === 'undefined' ||
            typeof window.__TAURI__.core === 'undefined' ||
            typeof window.__TAURI__.core.invoke === 'undefined') {
            setTimeout(initConsoleOverride, 10);
            return;
        }

        const originalLog = console.log.bind(console);
        const originalDebug = console.debug.bind(console);
        const originalInfo = console.info.bind(console);
        const originalWarn = console.warn.bind(console);
        const originalError = console.error.bind(console);

        const invoke = window.__TAURI__.core.invoke;
        const log = (level, args) => {
            try {
                Promise.resolve(
                    invoke('plugin:tracing|do_log', { level, data: args.map(toLoggable) })
                ).catch(() => {});
            } catch (_) {}
        };

        console.log = (...args) => { originalLog(...args); log('INFO', args); };
        console.debug = (...args) => { originalDebug(...args); log('DEBUG', args); };
        console.info = (...args) => { originalInfo(...args); log('INFO', args); };
        console.warn = (...args) => { originalWarn(...args); log('WARN', args); };
        console.error = (...args) => { originalError(...args); log('ERROR', args); };
    }

    initConsoleOverride();
})();
"#;

#[cfg(test)]
mod tests {
    use rquickjs::{Context, Runtime};

    #[test]
    fn log_content_keeps_the_latest_records_with_their_continuations() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(
            temp.path().join("app.log.1"),
            "2026-10-01T00:00:00Z INFO older: rotated record\n",
        )
        .unwrap();
        std::fs::write(
            temp.path().join("app.log"),
            "2026-10-01T00:00:04Z INFO recent: latest record\n  latest continuation\n"
                .repeat(2_000),
        )
        .unwrap();

        let content = super::read_log_content(temp.path()).unwrap();

        assert_eq!(content.lines().count(), 600);
        assert!(content.lines().all(|line| line.contains("latest")));
        assert!(content.ends_with("latest continuation"));
    }

    fn run_console_bridge(script: &str) -> serde_json::Value {
        let (_rt, ctx) = setup_runtime();
        ctx.with(|ctx| {
            ctx.eval::<(), _>(
                r#"
                globalThis.window = globalThis;
                globalThis.setTimeout = function(fn) { fn(); };
                globalThis.console = {
                    log: function() {},
                    debug: function() {},
                    info: function() {},
                    warn: function() {},
                    error: function() {}
                };
                globalThis.__invocations = [];
                globalThis.window.__TAURI__ = {
                    core: {
                        invoke: function(command, payload) {
                            globalThis.__invocations.push({ command, payload });
                            return Promise.resolve();
                        }
                    }
                };
            "#,
            )
            .unwrap();
            ctx.eval::<(), _>(super::JS_INIT_SCRIPT).unwrap();
            ctx.eval::<(), _>(script).unwrap();
            let json: String = ctx
                .eval("JSON.stringify(globalThis.__invocations)")
                .unwrap();
            serde_json::from_str(&json).unwrap()
        })
    }

    #[test]
    fn console_bridge_sends_errors_with_name_message_and_stack() {
        let invocations = run_console_bridge(
            r#"
            const error = new TypeError("x is undefined");
            console.error("failed to save", error);
            "#,
        );

        assert_eq!(invocations.as_array().unwrap().len(), 1);
        let call = &invocations[0];
        assert_eq!(call["command"], "plugin:tracing|do_log");
        assert_eq!(call["payload"]["level"], "ERROR");
        assert_eq!(call["payload"]["data"][0], "failed to save");
        let error = &call["payload"]["data"][1]["$error"];
        assert_eq!(error["name"], "TypeError");
        assert_eq!(error["message"], "x is undefined");
        assert!(error["stack"].is_string() || error["stack"].is_null());
    }

    #[test]
    fn console_bridge_serializes_values_json_cannot_carry() {
        let invocations = run_console_bridge(
            r#"
            const node = { name: "root" };
            node.self = node;
            console.warn(undefined, 10n, function handler() {}, node, { inner: new RangeError("bad") });
            console.debug("trace detail");
            "#,
        );

        let calls = invocations.as_array().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0]["payload"]["level"], "WARN");
        assert_eq!(
            calls[0]["payload"]["data"],
            serde_json::json!([
                "undefined",
                "10n",
                "[Function handler]",
                { "name": "root", "self": "[Circular]" },
                { "inner": { "$error": { "name": "RangeError", "message": "bad", "stack": calls[0]["payload"]["data"][4]["inner"]["$error"]["stack"] } } },
            ])
        );
        assert_eq!(calls[1]["payload"]["level"], "DEBUG");
        assert_eq!(
            calls[1]["payload"]["data"],
            serde_json::json!(["trace detail"])
        );
    }

    fn setup_runtime() -> (Runtime, Context) {
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|_ctx| {});
        (runtime, context)
    }

    #[test]
    fn test_js_init_script() {
        let (_rt, ctx) = setup_runtime();
        ctx.with(|ctx| {
            let setup = r#"
                globalThis.window = globalThis;
                globalThis.setTimeout = function(fn, delay) { fn(); };
                
                if (typeof globalThis.console === 'undefined') {
                    globalThis.console = {
                        log: function() {},
                        debug: function() {},
                        info: function() {},
                        warn: function() {},
                        error: function() {}
                    };
                }
                
                globalThis.window.__TAURI__ = {
                    core: {
                        invoke: function() { return Promise.resolve(); }
                    }
                };
            "#;
            ctx.eval::<(), _>(setup).unwrap();
            ctx.eval::<(), _>(super::JS_INIT_SCRIPT).unwrap();

            let console_methods_exist: bool = ctx
                .eval(
                    r#"
                    typeof console !== 'undefined' &&
                    typeof console.log === 'function' &&
                    typeof console.debug === 'function' &&
                    typeof console.info === 'function' &&
                    typeof console.warn === 'function' &&
                    typeof console.error === 'function'
                "#,
                )
                .unwrap();

            assert!(
                console_methods_exist,
                "All console methods should be defined"
            );
        });
    }
}
