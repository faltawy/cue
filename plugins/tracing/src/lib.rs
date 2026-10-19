mod commands;
mod console;
mod errors;
mod ext;
mod filter;
pub mod redaction;
mod utils;

pub use errors::*;
pub use ext::*;
pub use filter::{DefaultFilter, LogFilter};
pub use utils::{cleanup_old_daily_logs, make_file_writer};

use tauri::Manager;
use tracing::Subscriber;
use tracing_subscriber::{
    Layer,
    field::RecordFields,
    fmt::{
        self, FormatFields, MakeWriter,
        format::{DefaultFields, Writer},
    },
    prelude::__tracing_subscriber_SubscriberExt,
    registry::LookupSpan,
    util::SubscriberInitExt,
};

use utils::cleanup_legacy_logs;

const PLUGIN_NAME: &str = "tracing";
const WEBVIEW_CONSOLE_TARGET: &str = "anarlog.webview.console";

#[derive(Default)]
struct FileFields(DefaultFields);

impl<'writer> FormatFields<'writer> for FileFields {
    fn format_fields<R: RecordFields>(
        &self,
        writer: Writer<'writer>,
        fields: R,
    ) -> std::fmt::Result {
        self.0.format_fields(writer, fields)
    }
}

fn file_layer<S, W>(writer: W) -> impl Layer<S>
where
    S: Subscriber + for<'span> LookupSpan<'span>,
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    fmt::layer()
        .with_ansi(false)
        .fmt_fields(FileFields::default())
        .with_writer(writer)
}

fn console_layer<S, W>(writer: W) -> impl Layer<S>
where
    S: Subscriber + for<'span> LookupSpan<'span>,
    W: for<'writer> MakeWriter<'writer> + Send + Sync + 'static,
{
    fmt::layer().with_writer(writer)
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .plugin_name(PLUGIN_NAME)
        .events(tauri_specta::collect_events![])
        .commands(tauri_specta::collect_commands![
            commands::logs_dir::<tauri::Wry>,
            commands::do_log::<tauri::Wry>,
            commands::log_content::<tauri::Wry>,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

#[derive(Default)]
pub struct Builder {
    skip_subscriber_init: bool,
}

impl Builder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn skip_subscriber_init(mut self, skip: bool) -> Self {
        self.skip_subscriber_init = skip;
        self
    }

    pub fn build(self) -> tauri::plugin::TauriPlugin<tauri::Wry> {
        let specta_builder = make_specta_builder();
        let skip_subscriber_init = self.skip_subscriber_init;

        tauri::plugin::Builder::new(PLUGIN_NAME)
            .invoke_handler(specta_builder.invoke_handler())
            .js_init_script(JS_INIT_SCRIPT)
            .setup(move |app, _api| {
                specta_builder.mount_events(app);

                cleanup_legacy_logs(app);

                if skip_subscriber_init {
                    return Ok(());
                }

                let (env_filter, default_filter) =
                    LogFilter::from_rust_log(std::env::var("RUST_LOG").ok().as_deref())
                        .into_layers();
                let file_writer = app
                    .tracing()
                    .logs_dir()
                    .map_err(|error| error.to_string())
                    .and_then(|dir| make_file_writer(&dir).map_err(|error| error.to_string()));
                let file_writer = match file_writer {
                    Ok((file_writer, guard)) => {
                        app.manage(guard);
                        Some(file_writer)
                    }
                    Err(error) => {
                        eprintln!("Failed to open app.log: {error}");
                        None
                    }
                };
                let stdout_layer = (cfg!(debug_assertions) || file_writer.is_none())
                    .then(|| console_layer(|| redaction::RedactingWriter::new(std::io::stdout())));

                tracing_subscriber::registry()
                    .with(env_filter)
                    .with(default_filter)
                    .with(stdout_layer)
                    .with(file_writer.map(file_layer))
                    .init();

                Ok(())
            })
            .build()
    }
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    Builder::new().build()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        const OUTPUT_FILE: &str = "./js/bindings.gen.ts";

        make_specta_builder()
            .export(
                specta_typescript::Typescript::default()
                    .formatter(specta_typescript::formatter::prettier)
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                OUTPUT_FILE,
            )
            .unwrap();

        let content = std::fs::read_to_string(OUTPUT_FILE).unwrap();
        std::fs::write(OUTPUT_FILE, format!("// @ts-nocheck\n{content}")).unwrap();
    }

    fn create_mock_app() -> tauri::App<tauri::test::MockRuntime> {
        let mut ctx = tauri::test::mock_context(tauri::test::noop_assets());
        ctx.config_mut().identifier = "com.hyprnote.dev".to_string();
        ctx.config_mut().version = Some("0.0.1".to_string());

        tauri::test::mock_builder().build(ctx).unwrap()
    }

    #[test]
    fn test_log_content_empty() {
        let app = create_mock_app();
        let result = app.tracing().log_content();
        assert!(result.is_ok());
    }

    #[test]
    fn file_layer_writes_plain_text_next_to_an_ansi_console() {
        let console = SharedBuffer::default();
        let file = SharedBuffer::default();
        let subscriber = tracing_subscriber::registry()
            .with(console_layer(console.clone()))
            .with(file_layer(file.clone()));

        tracing::subscriber::with_default(subscriber, || {
            let span = tracing::info_span!("session", anarlog.session.id = "abc123");
            let _guard = span.enter();
            tracing::info!(provider = "soniox", "listen_ws_connected");
        });

        let console = console.contents();
        let file = file.contents();
        assert!(console.contains('\u{1b}'), "{console:?}");
        assert!(
            file.contains("session{anarlog.session.id=\"abc123\"}"),
            "{file:?}"
        );
        assert!(
            file.contains("listen_ws_connected provider=\"soniox\""),
            "{file:?}"
        );
        assert!(!file.contains('\u{1b}'), "{file:?}");
        assert_eq!(file.lines().count(), 1, "{file:?}");
    }

    #[derive(Clone, Default)]
    struct SharedBuffer(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);

    impl SharedBuffer {
        fn contents(&self) -> String {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    impl std::io::Write for SharedBuffer {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl<'writer> MakeWriter<'writer> for SharedBuffer {
        type Writer = SharedBuffer;

        fn make_writer(&'writer self) -> Self::Writer {
            self.clone()
        }
    }
}
