use std::path::Path;

use tracing::{Metadata, Subscriber, level_filters::LevelFilter, subscriber::Interest};
use tracing_subscriber::{
    EnvFilter,
    layer::{Context, Layer},
};

const APP_LEVEL: LevelFilter = LevelFilter::INFO;
const DEPENDENCY_LEVEL: LevelFilter = LevelFilter::WARN;
const QUIET_DEPENDENCIES: &[(&str, LevelFilter)] = &[("tantivy", LevelFilter::ERROR)];

pub enum LogFilter {
    Env(EnvFilter),
    Default(DefaultFilter),
}

impl LogFilter {
    pub fn from_rust_log(value: Option<&str>) -> Self {
        let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
            return Self::Default(DefaultFilter);
        };

        match EnvFilter::try_new(value) {
            Ok(filter) => Self::Env(QUIET_DEPENDENCIES.iter().fold(
                filter,
                |filter, (target, level)| {
                    filter.add_directive(
                        format!("{target}={level}")
                            .parse()
                            .expect("valid directive"),
                    )
                },
            )),
            Err(error) => {
                eprintln!("ignoring invalid RUST_LOG {value:?}: {error}");
                Self::Default(DefaultFilter)
            }
        }
    }

    pub fn into_layers(self) -> (Option<EnvFilter>, Option<DefaultFilter>) {
        match self {
            Self::Env(filter) => (Some(filter), None),
            Self::Default(filter) => (None, Some(filter)),
        }
    }
}

pub struct DefaultFilter;

impl DefaultFilter {
    fn allows(&self, metadata: &Metadata<'_>) -> bool {
        default_level(metadata.file(), metadata.target()) >= *metadata.level()
    }
}

impl<S: Subscriber> Layer<S> for DefaultFilter {
    fn register_callsite(&self, metadata: &'static Metadata<'static>) -> Interest {
        if self.allows(metadata) {
            Interest::always()
        } else {
            Interest::never()
        }
    }

    fn enabled(&self, metadata: &Metadata<'_>, _ctx: Context<'_, S>) -> bool {
        self.allows(metadata)
    }

    fn max_level_hint(&self) -> Option<LevelFilter> {
        Some(APP_LEVEL)
    }
}

fn default_level(file: Option<&str>, target: &str) -> LevelFilter {
    if let Some((_, level)) = QUIET_DEPENDENCIES.iter().find(|(name, _)| {
        target == *name
            || target
                .strip_prefix(name)
                .is_some_and(|rest| rest.starts_with("::"))
    }) {
        return *level;
    }

    if is_workspace_source(file) {
        APP_LEVEL
    } else {
        DEPENDENCY_LEVEL
    }
}

fn is_workspace_source(file: Option<&str>) -> bool {
    file.is_some_and(|file| Path::new(file).is_relative())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use tracing_subscriber::{fmt, prelude::*};

    use super::*;

    #[test]
    fn workspace_crates_default_to_info_and_dependencies_to_warn() {
        assert_eq!(
            default_level(Some(file!()), module_path!()),
            LevelFilter::INFO
        );
        assert_eq!(
            default_level(
                Some("crates/listener-core/src/actors/root.rs"),
                "listener_core"
            ),
            LevelFilter::INFO
        );
        assert_eq!(
            default_level(
                Some(
                    "/Users/dev/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/hyper-1.6.0/src/proto/h1/conn.rs"
                ),
                "hyper::proto::h1::conn"
            ),
            LevelFilter::WARN
        );
        assert_eq!(default_level(None, "log"), LevelFilter::WARN);
        assert_eq!(
            default_level(
                Some("/Users/dev/.cargo/registry/src/tantivy-0.24/src/lib.rs"),
                "tantivy::indexer"
            ),
            LevelFilter::ERROR
        );
        assert_eq!(
            default_level(
                Some("/Users/dev/.cargo/registry/src/tantivy-fst/src/lib.rs"),
                "tantivy_fst"
            ),
            LevelFilter::WARN
        );
    }

    #[test]
    fn rust_log_overrides_the_default_only_when_valid() {
        assert!(matches!(
            LogFilter::from_rust_log(None),
            LogFilter::Default(_)
        ));
        assert!(matches!(
            LogFilter::from_rust_log(Some("  ")),
            LogFilter::Default(_)
        ));
        assert!(matches!(
            LogFilter::from_rust_log(Some("listener_core=trace,info")),
            LogFilter::Env(_)
        ));
        assert!(matches!(
            LogFilter::from_rust_log(Some("listener_core=notalevel")),
            LogFilter::Default(_)
        ));
    }

    #[test]
    fn rust_log_keeps_tantivy_quiet() {
        let LogFilter::Env(filter) = LogFilter::from_rust_log(Some("debug")) else {
            panic!("expected RUST_LOG filter");
        };
        let rendered = filter.to_string();
        assert!(rendered.contains("tantivy=error"), "{rendered}");
        assert!(rendered.contains("debug"), "{rendered}");
    }

    #[test]
    fn default_filter_keeps_workspace_info_and_drops_workspace_debug() {
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let writer = {
            let buffer = buffer.clone();
            move || CapturingWriter(buffer.clone())
        };
        let subscriber = tracing_subscriber::registry()
            .with(DefaultFilter)
            .with(fmt::layer().with_ansi(false).with_writer(writer));

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("workspace_info_event");
            tracing::debug!("workspace_debug_event");
        });

        let output = String::from_utf8(buffer.lock().unwrap().clone()).unwrap();
        assert!(output.contains("workspace_info_event"), "{output}");
        assert!(!output.contains("workspace_debug_event"), "{output}");
    }

    struct CapturingWriter(Arc<Mutex<Vec<u8>>>);

    impl std::io::Write for CapturingWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
}
