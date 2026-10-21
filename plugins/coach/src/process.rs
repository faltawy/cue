use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use crate::{CoachProvider, Error, Result, access};

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct Endpoint {
    pub url: String,
    pub token: String,
}

const BUN_ENV: &str = "CUE_COACH_BUN";
const SERVER_ENV: &str = "CUE_COACH_SERVER";
const BUN_CANDIDATES: &[&str] = &["/opt/homebrew/bin/bun", "/usr/local/bin/bun"];
const STOP_GRACE: Duration = Duration::from_secs(3);

pub struct Launch {
    pub project: PathBuf,
    pub project_chosen: bool,
    pub db: PathBuf,
    pub port: u16,
    pub model: String,
    pub claude_model: String,
    pub codex_model: String,
    pub provider: CoachProvider,
    pub nudges: bool,
    pub nudge_limit_cents: u32,
    pub mcp_config: Option<PathBuf>,
    pub allow_changes: Vec<String>,
    pub tools_fingerprint: u64,
    pub instructions: Option<PathBuf>,
    pub knowledge: Vec<PathBuf>,
    pub context_fingerprint: u64,
    pub web_access: bool,
    pub protected: Vec<PathBuf>,
}

impl Launch {
    pub fn key(&self) -> String {
        format!(
            "coach:{}:{}:{}:{}:{}:{}:{}:{:x}:{:x}:{}",
            self.project.display(),
            self.provider.as_str(),
            self.model,
            self.claude_model,
            self.codex_model,
            self.nudges,
            self.nudge_limit_cents,
            self.tools_fingerprint,
            self.context_fingerprint,
            self.web_access
        )
    }
}

pub const LLM_KEY: &str = "llm";

pub fn free_port() -> Result<u16> {
    Ok(TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?
        .local_addr()?
        .port())
}

fn bun_path() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os(BUN_ENV) {
        return Ok(PathBuf::from(path));
    }
    let home_bun = std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".bun/bin/bun"));
    BUN_CANDIDATES
        .iter()
        .map(PathBuf::from)
        .chain(home_bun)
        .find(|path| path.is_file())
        .ok_or(Error::NotFound("bun", BUN_ENV))
}

fn server_script() -> Result<PathBuf> {
    let path = std::env::var_os(SERVER_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps/coach/src/main.ts")
        });
    if path.is_file() {
        Ok(path)
    } else {
        Err(Error::NotFound("the coach server script", SERVER_ENV))
    }
}

pub fn server_args(launch: &Launch) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        "--project".into(),
        launch.project.clone().into(),
        "--db".into(),
        launch.db.clone().into(),
        "--port".into(),
        launch.port.to_string().into(),
        "--model".into(),
        launch.model.clone().into(),
        "--provider".into(),
        launch.provider.as_str().into(),
        "--claude-model".into(),
        launch.claude_model.clone().into(),
        "--codex-model".into(),
        launch.codex_model.clone().into(),
        "--nudge-limit".into(),
        format!(
            "{}.{:02}",
            launch.nudge_limit_cents / 100,
            launch.nudge_limit_cents % 100
        )
        .into(),
        "--exit-with-stdin".into(),
    ];
    if !launch.nudges {
        args.push("--no-nudges".into());
    }
    if !launch.project_chosen {
        args.push("--no-project".into());
    }
    if let Some(config) = &launch.mcp_config {
        args.push("--mcp-config".into());
        args.push(config.clone().into());
    }
    if !launch.allow_changes.is_empty() {
        args.push("--allow-changes".into());
        args.push(launch.allow_changes.join(",").into());
    }
    if let Some(instructions) = &launch.instructions {
        args.push("--instructions".into());
        args.push(instructions.clone().into());
    }
    for entry in &launch.knowledge {
        args.push("--knowledge".into());
        args.push(entry.clone().into());
    }
    if launch.web_access {
        args.push("--web".into());
    }
    for dir in &launch.protected {
        args.push("--protect".into());
        args.push(dir.clone().into());
    }
    args
}

pub fn list_connectors_args() -> Vec<OsString> {
    vec!["--list-connectors".into()]
}

pub fn llm_args(port: u16) -> Vec<OsString> {
    vec![
        "--llm-only".into(),
        "--port".into(),
        port.to_string().into(),
        "--exit-with-stdin".into(),
    ]
}

const BUNDLED_COACH: &str = "cue-coach";

fn bundled_coach() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let directory = executable.parent()?;
    let target = tauri::utils::platform::target_triple().ok()?;
    bundled_coach_for(directory, &target)
}

fn bundled_coach_for(directory: &Path, target: &str) -> Option<PathBuf> {
    let coach = directory.join(format!("{BUNDLED_COACH}-{target}"));
    coach.is_file().then_some(coach)
}

/// The coach runs the person's own Claude Code when it is new enough, else
/// Cue's copy, downloaded once into `claude_dir`.
pub fn sidecar_command(args: Vec<OsString>, claude_dir: &Path) -> Result<Command> {
    let mut command = match bundled_coach().filter(|_| std::env::var_os(SERVER_ENV).is_none()) {
        Some(coach) => Command::new(coach),
        None => {
            let mut command = Command::new(bun_path()?);
            command.arg(server_script()?);
            command
        }
    };
    command
        .args(args)
        .arg("--claude-dir")
        .arg(claude_dir)
        .arg("--codex-dir")
        .arg(claude_dir.with_file_name("codex"));
    Ok(command)
}

pub struct Sidecar {
    child: Child,
    stdin: Option<ChildStdin>,
    pub port: u16,
    pub key: String,
    pub token: String,
}

impl Sidecar {
    pub fn spawn(mut command: Command, port: u16, key: String) -> Result<Self> {
        let token = access::new_token();
        let mut child = command
            .env(access::TOKEN_ENV, &token)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        tracing::info!(pid = child.id(), port, key, "coach_started");
        forward_output(child.stdout.take(), "stdout");
        forward_output(child.stderr.take(), "stderr");
        let stdin = child.stdin.take();
        Ok(Self {
            child,
            stdin,
            port,
            key,
            token,
        })
    }

    pub fn endpoint(&self) -> Endpoint {
        Endpoint {
            url: self.base_url(),
            token: self.token.clone(),
        }
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn wait_ready(&mut self, timeout: Duration) -> Result<()> {
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, self.port));
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(status) = self.child.try_wait()? {
                return Err(Error::Exited(status));
            }
            if TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok() {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(Error::StartTimeout(timeout.as_secs()));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    pub fn stop(&mut self) -> Result<ExitStatus> {
        drop(self.stdin.take());
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if let Some(status) = self.child.try_wait()? {
                tracing::info!(%status, "coach_stopped");
                return Ok(status);
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        tracing::warn!(pid = self.child.id(), "coach_stop_timeout_killing");
        self.child.kill()?;
        Ok(self.child.wait()?)
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            tracing::error!(%error, "coach_stop_failed");
        }
    }
}

fn forward_output(stream: Option<impl Read + Send + 'static>, name: &'static str) {
    let Some(stream) = stream else { return };
    std::thread::spawn(move || {
        for line in BufReader::new(stream)
            .lines()
            .map_while(std::result::Result::ok)
        {
            tracing::info!(target: "coach", stream = name, "{line}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_coach_uses_tauri_external_binary_target_suffix() {
        let directory = tempfile::tempdir().unwrap();
        let coach = directory.path().join("cue-coach-aarch64-apple-darwin");
        std::fs::write(&coach, "sidecar").unwrap();
        assert!(coach.is_file());

        assert_eq!(
            bundled_coach_for(directory.path(), "aarch64-apple-darwin"),
            Some(coach)
        );
    }

    fn sh(script: &str) -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", script]);
        command
    }

    #[test]
    fn server_args_carry_project_db_port_model_nudge_limit_and_stdin_exit() {
        let launch = Launch {
            project: "/work/project".into(),
            project_chosen: true,
            db: "/data/app.db".into(),
            port: 4747,
            model: "opus".into(),
            claude_model: "opus".into(),
            codex_model: String::new(),
            provider: CoachProvider::Claude,
            nudges: true,
            nudge_limit_cents: 105,
            mcp_config: None,
            allow_changes: Vec::new(),
            tools_fingerprint: 0,
            instructions: None,
            knowledge: Vec::new(),
            context_fingerprint: 0,
            web_access: false,
            protected: Vec::new(),
        };
        let args: Vec<String> = server_args(&launch)
            .into_iter()
            .map(|arg| arg.into_string().unwrap())
            .collect();
        assert_eq!(
            args,
            [
                "--project",
                "/work/project",
                "--db",
                "/data/app.db",
                "--port",
                "4747",
                "--model",
                "opus",
                "--provider",
                "claude",
                "--claude-model",
                "opus",
                "--codex-model",
                "",
                "--nudge-limit",
                "1.05",
                "--exit-with-stdin"
            ]
        );
    }

    #[test]
    fn switching_provider_changes_the_running_process_and_routes_its_model() {
        let claude = launch("/p", "sonnet", true, 1);
        let codex = Launch {
            provider: CoachProvider::Codex,
            model: "".into(),
            ..launch("/p", "sonnet", true, 1)
        };
        let args = server_args(&codex);
        assert!(args.windows(2).any(|pair| pair == ["--provider", "codex"]));
        assert!(args.windows(2).any(|pair| pair == ["--model", ""]));
        assert!(
            server_args(&claude)
                .windows(2)
                .any(|pair| pair == ["--model", "sonnet"])
        );
        assert_ne!(codex.key(), claude.key());
        assert_ne!(
            Launch {
                provider: CoachProvider::Codex,
                model: "".into(),
                claude_model: "opus".into(),
                ..launch("/p", "sonnet", true, 1)
            }
            .key(),
            codex.key()
        );
        assert_ne!(
            Launch {
                codex_model: "gpt-6.1-sol".into(),
                ..launch("/p", "sonnet", true, 1)
            }
            .key(),
            claude.key()
        );

        assert!(
            args.windows(2)
                .any(|pair| pair == ["--claude-model", "sonnet"])
        );
        assert!(args.windows(2).any(|pair| pair == ["--codex-model", ""]));
    }

    #[test]
    fn nudges_off_adds_no_nudges_and_changes_the_key() {
        let off = launch("/p", "sonnet", false, 1);
        let args: Vec<String> = server_args(&off)
            .into_iter()
            .map(|arg| arg.into_string().unwrap())
            .collect();
        assert_eq!(
            args[args.len() - 4..],
            ["--nudge-limit", "0.50", "--exit-with-stdin", "--no-nudges"]
        );
        assert!(
            !server_args(&launch("/p", "sonnet", true, 1))
                .iter()
                .any(|arg| arg == "--no-nudges")
        );
        assert_ne!(off.key(), launch("/p", "sonnet", true, 1).key());
        assert_ne!(
            Launch {
                nudge_limit_cents: 200,
                ..launch("/p", "sonnet", true, 1)
            }
            .key(),
            launch("/p", "sonnet", true, 1).key()
        );
    }

    #[test]
    fn configured_tools_are_passed_after_the_base_args() {
        let with_tools = Launch {
            mcp_config: Some("/tmp/coach/mcp.json".into()),
            allow_changes: vec!["clients".into(), "notes".into()],
            ..launch("/p", "sonnet", true, 1)
        };
        let args: Vec<String> = server_args(&with_tools)
            .into_iter()
            .map(|arg| arg.into_string().unwrap())
            .collect();
        assert_eq!(
            args[args.len() - 4..],
            [
                "--mcp-config",
                "/tmp/coach/mcp.json",
                "--allow-changes",
                "clients,notes"
            ]
        );
        assert!(
            !server_args(&launch("/p", "sonnet", true, 1))
                .iter()
                .any(|arg| arg == "--mcp-config" || arg == "--allow-changes")
        );
    }

    #[test]
    fn llm_args_start_the_model_only_server() {
        let args: Vec<String> = llm_args(5151)
            .into_iter()
            .map(|arg| arg.into_string().unwrap())
            .collect();
        assert_eq!(args, ["--llm-only", "--port", "5151", "--exit-with-stdin"]);
    }

    fn launch(project: &str, model: &'static str, nudges: bool, port: u16) -> Launch {
        Launch {
            project: project.into(),
            project_chosen: true,
            db: "/db".into(),
            port,
            model: model.into(),
            claude_model: model.into(),
            codex_model: String::new(),
            provider: CoachProvider::Claude,
            nudges,
            nudge_limit_cents: 50,
            mcp_config: None,
            allow_changes: Vec::new(),
            tools_fingerprint: 0,
            instructions: None,
            knowledge: Vec::new(),
            context_fingerprint: 0,
            web_access: false,
            protected: Vec::new(),
        }
    }

    #[test]
    fn each_protected_folder_is_passed_to_the_coach() {
        let guarded = Launch {
            protected: vec!["/data/app".into(), "/tmp/coach-mcp".into()],
            ..launch("/p", "sonnet", true, 1)
        };
        let args: Vec<String> = server_args(&guarded)
            .into_iter()
            .map(|arg| arg.into_string().unwrap())
            .collect();
        assert!(
            args.ends_with(&[
                "--protect".into(),
                "/data/app".into(),
                "--protect".into(),
                "/tmp/coach-mcp".into()
            ]),
            "{args:?}"
        );
    }

    #[test]
    fn web_access_is_passed_only_when_on_and_changes_the_key() {
        let on = Launch {
            web_access: true,
            ..launch("/p", "sonnet", true, 1)
        };
        assert_eq!(server_args(&on).last().unwrap(), "--web");
        assert!(
            !server_args(&launch("/p", "sonnet", true, 1))
                .iter()
                .any(|arg| arg == "--web")
        );
        assert_ne!(on.key(), launch("/p", "sonnet", true, 1).key());
    }

    #[test]
    fn instructions_and_each_knowledge_path_are_passed_when_set() {
        let with_context = Launch {
            instructions: Some("/tmp/coach/instructions.md".into()),
            knowledge: vec!["/work/kb".into(), "/work/pricing.md".into()],
            ..launch("/p", "sonnet", true, 1)
        };
        let args: Vec<String> = server_args(&with_context)
            .into_iter()
            .map(|arg| arg.into_string().unwrap())
            .collect();
        assert_eq!(
            args[args.len() - 6..],
            [
                "--instructions",
                "/tmp/coach/instructions.md",
                "--knowledge",
                "/work/kb",
                "--knowledge",
                "/work/pricing.md"
            ]
        );
        assert!(
            !server_args(&launch("/p", "sonnet", true, 1))
                .iter()
                .any(|arg| arg == "--instructions" || arg == "--knowledge")
        );
    }

    #[test]
    fn the_key_changes_with_project_model_or_nudges_but_not_port() {
        let base = launch("/p", "sonnet", true, 1).key();
        assert_eq!(launch("/p", "sonnet", true, 2).key(), base);
        assert_ne!(launch("/q", "sonnet", true, 1).key(), base);
        assert_ne!(launch("/p", "haiku", true, 1).key(), base);
        assert_ne!(launch("/p", "sonnet", false, 1).key(), base);
        assert_ne!(
            Launch {
                tools_fingerprint: 7,
                ..launch("/p", "sonnet", true, 1)
            }
            .key(),
            base
        );
        assert_ne!(
            Launch {
                context_fingerprint: 7,
                ..launch("/p", "sonnet", true, 1)
            }
            .key(),
            base
        );
    }

    #[test]
    fn ready_once_the_port_accepts_connections() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let mut sidecar = Sidecar::spawn(sh("sleep 5"), port, "test".into()).unwrap();

        sidecar.wait_ready(Duration::from_secs(2)).unwrap();
        assert!(sidecar.is_running());
    }

    #[test]
    fn a_coach_that_exits_while_starting_is_reported_not_waited_out() {
        let port = free_port().unwrap();
        let mut sidecar = Sidecar::spawn(sh("exit 3"), port, "test".into()).unwrap();

        let started = Instant::now();
        let error = sidecar.wait_ready(Duration::from_secs(10)).unwrap_err();

        assert!(matches!(error, Error::Exited(status) if status.code() == Some(3)));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn each_sidecar_gets_its_own_launch_secret_through_the_environment() {
        let dir = tempfile::tempdir().unwrap();
        let seen = dir.path().join("token");
        let script = format!(
            "printf %s \"${}\" > '{}'",
            access::TOKEN_ENV,
            seen.display()
        );
        let mut first = Sidecar::spawn(sh(&script), free_port().unwrap(), "test".into()).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while first.is_running() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(std::fs::read_to_string(&seen).unwrap(), first.token);
        assert_eq!(first.token.len(), 64);

        let second = Sidecar::spawn(sh("true"), free_port().unwrap(), "test".into()).unwrap();
        assert_ne!(second.token, first.token);
        assert_eq!(second.endpoint().token, second.token);
    }

    #[test]
    fn stop_closes_stdin_so_the_coach_exits_on_its_own() {
        let port = free_port().unwrap();
        let mut sidecar = Sidecar::spawn(Command::new("cat"), port, "test".into()).unwrap();
        assert!(sidecar.is_running());

        let status = sidecar.stop().unwrap();

        assert!(
            status.success(),
            "cat should exit 0 on EOF, not be killed: {status}"
        );
    }
}
