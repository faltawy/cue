use std::collections::VecDeque;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use specta::Type;

pub const VERSION: u32 = 1;
pub const MAX_MESSAGE: usize = 768 * 1024;
const LEASE: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum BrowserEventKind {
    Caption,
    Chat,
    Reaction,
    HandRaised,
    ParticipantJoined,
    ParticipantLeft,
    PresentationStarted,
    PresentationEnded,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CaptureAvailability {
    Available,
    Disabled,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BrowserParticipant {
    pub id: String,
    pub name: String,
    pub speaking: bool,
    pub presenting: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BrowserEvent {
    pub id: String,
    pub kind: BrowserEventKind,
    pub timestamp_ms: f64,
    pub participant_id: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct PresentationImage {
    pub timestamp_ms: f64,
    pub jpeg_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BrowserContext {
    pub title: String,
    pub captions: CaptureAvailability,
    pub chat: CaptureAvailability,
    pub participants: Vec<BrowserParticipant>,
    pub events: Vec<BrowserEvent>,
    pub presentation: Option<PresentationImage>,
}

impl BrowserContext {
    fn valid(&self) -> bool {
        self.title.len() <= 512
            && self.participants.len() <= 250
            && self
                .participants
                .iter()
                .all(|p| valid_id(&p.id) && p.name.len() <= 256)
            && self.events.len() <= 200
            && self.events.iter().all(|e| {
                valid_id(&e.id)
                    && e.timestamp_ms.is_finite()
                    && e.timestamp_ms >= 0.0
                    && e.participant_id.as_ref().is_none_or(|id| valid_id(id))
                    && e.text.len() <= 4096
            })
            && self.presentation.as_ref().is_none_or(|image| {
                image.timestamp_ms.is_finite()
                    && image.timestamp_ms >= 0.0
                    && image.jpeg_base64.len() <= 512 * 1024
                    && base64::engine::general_purpose::STANDARD
                        .decode(&image.jpeg_base64)
                        .is_ok_and(|data| {
                            data.starts_with(&[0xff, 0xd8, 0xff]) && data.ends_with(&[0xff, 0xd9])
                        })
            })
    }
}

#[derive(Debug, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BrowserRequest {
    pub version: u32,
    pub request_id: String,
    pub operation: BrowserOperation,
}

#[derive(Debug, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum BrowserOperation {
    Status,
    Attach {
        session_id: String,
        connection_id: String,
        meeting_url: String,
    },
    Snapshot {
        binding_id: String,
        sequence: u32,
        context: BrowserContext,
    },
    Poll {
        binding_id: String,
        after: u32,
    },
    Detach {
        binding_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct PrivateCue {
    pub sequence: u32,
    pub tag: String,
    pub line: String,
}

#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum BrowserFailure {
    InvalidRequest,
    UnsupportedVersion,
    NoActiveMeeting,
    MeetingChanged,
    AlreadyAttached,
    BindingExpired,
    OutOfOrder,
    AppUnavailable,
    Unauthorized,
    InvalidMessage,
}

#[derive(Debug, Serialize, Type)]
pub struct BrowserResponse {
    pub version: u32,
    pub request_id: String,
    pub result: BrowserResult,
}

#[derive(Debug, Serialize, Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BrowserResult {
    Ok { reply: BrowserReply },
    Error { error: BrowserFailure },
}

#[derive(Debug, Serialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BrowserReply {
    Status { active_session_id: Option<String> },
    Attached { binding_id: String },
    Accepted,
    Cues { cues: Vec<PrivateCue> },
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct MeetingBrowserContext {
    pub meeting_url: String,
    pub sequence: u32,
    pub context: BrowserContext,
}

struct Binding {
    id: String,
    session_id: String,
    connection_id: String,
    meeting_url: String,
    touched: Instant,
    snapshot: Option<MeetingBrowserContext>,
    snapshot_at: Instant,
    cues: VecDeque<(Instant, PrivateCue)>,
    cue_sequence: u32,
}

#[derive(Default)]
pub struct BrowserHub {
    binding: Option<Binding>,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
}

fn meet_url(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    let code = url.path().strip_prefix('/')?;
    (url.scheme() == "https"
        && url.host_str() == Some("meet.google.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && code.len() == 12
        && code.bytes().enumerate().all(|(i, c)| {
            if i == 3 || i == 8 {
                c == b'-'
            } else {
                c.is_ascii_lowercase()
            }
        }))
    .then(|| format!("https://meet.google.com/{code}"))
}

impl BrowserHub {
    fn expire(&mut self, active: Option<&str>, now: Instant) {
        if self.binding.as_ref().is_some_and(|b| {
            Some(b.session_id.as_str()) != active || now.duration_since(b.touched) >= LEASE
        }) {
            self.binding = None;
        }
    }

    pub fn handle(&mut self, request: BrowserRequest, active: Option<&str>) -> BrowserResponse {
        let started = Instant::now();
        let run_id = uuid::Uuid::new_v4();
        let log_lifecycle = !matches!(
            &request.operation,
            BrowserOperation::Poll { .. } | BrowserOperation::Snapshot { .. }
        );
        if log_lifecycle {
            tracing::info!(%run_id, "browser_request_started");
        }
        self.expire(active, started);
        let result = if request.version != VERSION {
            Err(BrowserFailure::UnsupportedVersion)
        } else if !valid_id(&request.request_id) {
            Err(BrowserFailure::InvalidRequest)
        } else {
            self.apply(request.operation, active, started)
        };
        if let Err(error) = &result {
            tracing::warn!(%run_id, ?error, duration_ms = started.elapsed().as_millis() as u64, "browser_request_failed");
        }
        if log_lifecycle {
            tracing::info!(%run_id, success = result.is_ok(), duration_ms = started.elapsed().as_millis() as u64, "browser_request_completed");
        }
        BrowserResponse {
            version: VERSION,
            request_id: if valid_id(&request.request_id) {
                request.request_id
            } else {
                String::new()
            },
            result: match result {
                Ok(reply) => BrowserResult::Ok { reply },
                Err(error) => BrowserResult::Error { error },
            },
        }
    }

    fn apply(
        &mut self,
        operation: BrowserOperation,
        active: Option<&str>,
        now: Instant,
    ) -> std::result::Result<BrowserReply, BrowserFailure> {
        match operation {
            BrowserOperation::Status => Ok(BrowserReply::Status {
                active_session_id: active.map(str::to_owned),
            }),
            BrowserOperation::Attach {
                session_id,
                connection_id,
                meeting_url,
            } => {
                let active = active.ok_or(BrowserFailure::NoActiveMeeting)?;
                if session_id != active {
                    return Err(BrowserFailure::MeetingChanged);
                }
                if !valid_id(&connection_id) {
                    return Err(BrowserFailure::InvalidRequest);
                }
                let meeting_url = meet_url(&meeting_url).ok_or(BrowserFailure::InvalidRequest)?;
                if let Some(binding) = &mut self.binding {
                    if binding.connection_id != connection_id || binding.meeting_url != meeting_url
                    {
                        return Err(BrowserFailure::AlreadyAttached);
                    }
                    binding.touched = now;
                    return Ok(BrowserReply::Attached {
                        binding_id: binding.id.clone(),
                    });
                }
                let id = uuid::Uuid::new_v4().to_string();
                self.binding = Some(Binding {
                    id: id.clone(),
                    session_id,
                    connection_id,
                    meeting_url,
                    touched: now,
                    snapshot: None,
                    snapshot_at: now,
                    cues: VecDeque::new(),
                    cue_sequence: 0,
                });
                tracing::info!(binding_id = %id, "browser_meeting_attached");
                Ok(BrowserReply::Attached { binding_id: id })
            }
            BrowserOperation::Snapshot {
                binding_id,
                sequence,
                context,
            } => {
                if !context.valid() {
                    return Err(BrowserFailure::InvalidRequest);
                }
                let binding = self.bound(&binding_id, now)?;
                if sequence == 0
                    || binding
                        .snapshot
                        .as_ref()
                        .is_some_and(|s| sequence <= s.sequence)
                {
                    return Err(BrowserFailure::OutOfOrder);
                }
                binding.snapshot_at = now;
                binding.snapshot = Some(MeetingBrowserContext {
                    meeting_url: binding.meeting_url.clone(),
                    sequence,
                    context,
                });
                Ok(BrowserReply::Accepted)
            }
            BrowserOperation::Poll { binding_id, after } => {
                let binding = self.bound(&binding_id, now)?;
                Ok(BrowserReply::Cues {
                    cues: binding
                        .cues
                        .iter()
                        .filter(|(at, cue)| {
                            now.duration_since(*at) < Duration::from_secs(60)
                                && cue.sequence > after
                        })
                        .map(|(_, cue)| cue.clone())
                        .collect(),
                })
            }
            BrowserOperation::Detach { binding_id } => {
                self.bound(&binding_id, now)?;
                self.binding = None;
                tracing::info!(%binding_id, "browser_meeting_detached");
                Ok(BrowserReply::Accepted)
            }
        }
    }

    fn bound(
        &mut self,
        id: &str,
        now: Instant,
    ) -> std::result::Result<&mut Binding, BrowserFailure> {
        let binding = self
            .binding
            .as_mut()
            .filter(|b| b.id == id)
            .ok_or(BrowserFailure::BindingExpired)?;
        binding.touched = now;
        Ok(binding)
    }

    pub fn context(
        &mut self,
        session_id: &str,
        active: Option<&str>,
    ) -> Option<MeetingBrowserContext> {
        self.expire(active, Instant::now());
        self.binding
            .as_ref()
            .filter(|b| b.session_id == session_id && b.snapshot_at.elapsed() < LEASE)?
            .snapshot
            .clone()
    }

    pub fn nudge(&mut self, session_id: &str, active: Option<&str>, tag: &str, line: &str) {
        self.expire(active, Instant::now());
        if tag.len() > 128 || line.len() > 4096 {
            return;
        }
        if let Some(binding) = self.binding.as_mut().filter(|b| b.session_id == session_id) {
            binding.cue_sequence = binding.cue_sequence.saturating_add(1);
            binding.cues.push_back((
                Instant::now(),
                PrivateCue {
                    sequence: binding.cue_sequence,
                    tag: tag.into(),
                    line: line.into(),
                },
            ));
            while binding.cues.len() > 20 {
                binding.cues.pop_front();
            }
        }
    }
}
