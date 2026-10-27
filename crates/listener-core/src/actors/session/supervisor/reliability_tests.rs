use std::path::PathBuf;
use std::sync::Arc;

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use ractor::{Actor, ActorProcessingErr, ActorRef, ActorStatus, registry};
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Duration, timeout};
use tokio_tungstenite::{accept_async, tungstenite::Message};

use super::tests::{SessionStopProbe, test_ctx, test_state};
use super::{SessionActor, SessionMsg, children};
use crate::actors::{
    ListenerActor, ListenerAudioResult, ListenerMsg, RecMsg, RecorderActor, SourceActor,
};
use crate::{
    ListenerRuntime, SessionDataEvent, SessionErrorEvent, SessionLifecycleEvent,
    SessionProgressEvent,
};

struct FinalizationGate;

#[ractor::async_trait]
impl Actor for FinalizationGate {
    type Msg = ();
    type State = (Option<oneshot::Sender<()>>, Option<oneshot::Receiver<()>>);
    type Arguments = Self::State;

    async fn pre_start(
        &self,
        _myself: ActorRef<()>,
        args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(args)
    }

    async fn post_stop(
        &self,
        _myself: ActorRef<()>,
        state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        let _ = state.0.take().unwrap().send(());
        let _ = state.1.take().unwrap().await;
        Ok(())
    }
}

async fn record_audio(recorder: &ractor::ActorCell) {
    let recorder: ActorRef<RecMsg> = recorder.clone().into();
    let audio = Arc::from(vec![0.1_f32; crate::actors::SAMPLE_RATE as usize]);
    assert_eq!(
        ractor::call_t!(recorder, RecMsg::AudioSingle, 1000, audio).unwrap(),
        crate::actors::RecorderEnqueueResult::Accepted,
    );
}

#[tokio::test]
async fn next_recorder_runs_while_previous_listener_finalizes() {
    let vault = tempfile::tempdir().unwrap();
    let (supervisor, supervisor_task) = Actor::spawn(None, SessionStopProbe, ()).await.unwrap();
    let mut previous_ctx = test_ctx();
    previous_ctx.app_dir = vault.path().to_path_buf();
    previous_ctx.params.session_id = uuid::Uuid::new_v4().to_string();
    let recorder = children::spawn_recorder(supervisor.get_cell(), &previous_ctx)
        .await
        .unwrap();
    record_audio(&recorder).await;
    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let (listener, listener_task) =
        Actor::spawn(None, FinalizationGate, (Some(entered_tx), Some(release_rx)))
            .await
            .unwrap();
    let mut previous = test_state(previous_ctx);
    previous.recorder_cell = Some(recorder.clone());
    previous.listener_cell = Some(listener.get_cell());
    let shutdown =
        tokio::spawn(
            async move { children::shutdown_children(&mut previous, "session_stop").await },
        );
    timeout(Duration::from_secs(5), entered_rx)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(recorder.get_status(), ActorStatus::Running);

    let mut next_ctx = test_ctx();
    next_ctx.app_dir = vault.path().to_path_buf();
    next_ctx.params.session_id = uuid::Uuid::new_v4().to_string();
    let (next_supervisor, next_supervisor_task) =
        Actor::spawn(None, SessionStopProbe, ()).await.unwrap();
    let next_recorder = children::spawn_recorder(next_supervisor.get_cell(), &next_ctx)
        .await
        .expect("previous finalization must not reserve the next meeting's recorder");
    record_audio(&next_recorder).await;
    release_tx.send(()).unwrap();
    timeout(Duration::from_secs(5), shutdown)
        .await
        .unwrap()
        .unwrap();
    listener_task.await.unwrap();
    assert_eq!(next_recorder.get_status(), ActorStatus::Running);
    record_audio(&next_recorder).await;
    next_recorder
        .stop_and_wait(None, Some(Duration::from_secs(5)))
        .await
        .unwrap();
    assert!(
        vault
            .path()
            .join(&next_ctx.params.session_id)
            .join("audio.mp3")
            .metadata()
            .unwrap()
            .len()
            > 0
    );
    supervisor.stop(None);
    next_supervisor.stop(None);
    supervisor_task.await.unwrap();
    next_supervisor_task.await.unwrap();
}

struct TranscriptRuntime {
    events: mpsc::UnboundedSender<SessionDataEvent>,
}

impl anlg_storage::StorageRuntime for TranscriptRuntime {
    fn global_base(&self) -> Result<PathBuf, anlg_storage::Error> {
        Ok(std::env::temp_dir())
    }
    fn vault_base(&self) -> Result<PathBuf, anlg_storage::Error> {
        Ok(std::env::temp_dir())
    }
}

impl ListenerRuntime for TranscriptRuntime {
    fn emit_lifecycle(&self, _event: SessionLifecycleEvent) {}
    fn emit_progress(&self, _event: SessionProgressEvent) {}
    fn emit_error(&self, _event: SessionErrorEvent) {}
    fn emit_data(&self, event: SessionDataEvent) {
        let _ = self.events.send(event);
    }
}

fn response(word: &str, is_final: bool) -> Message {
    let raw = serde_json::json!({
        "type": "Results", "start": 0.0, "duration": 1.0,
        "is_final": is_final, "speech_final": is_final, "from_finalize": false,
        "channel_index": [0, 2],
        "channel": {"alternatives": [{"transcript": format!("{word} speech"), "confidence": 1.0,
            "words": [
                {"word": word, "start": 0.0, "end": 0.5, "confidence": 1.0, "speaker": 0},
                {"word": "speech", "start": 0.5, "end": 1.0, "confidence": 1.0, "speaker": 0}
            ]}]},
        "metadata": {"request_id": "test", "model_uuid": "test", "model_info": {"name": "test", "version": "1", "arch": "test"}}
    });
    Message::Text(raw.to_string().into())
}

async fn wait_for_word(events: &mut mpsc::UnboundedReceiver<SessionDataEvent>, word: &str) {
    timeout(Duration::from_secs(10), async {
        while let Some(event) = events.recv().await {
            if let SessionDataEvent::TranscriptDelta { delta, .. } = event
                && delta
                    .new_words
                    .iter()
                    .any(|value| value.text.trim() == word)
            {
                return;
            }
        }
        panic!("transcript event channel closed before {word}");
    })
    .await
    .expect("finalized transcript should resume");
}

async fn wait_for_listener(
    session_id: &str,
    previous_id: Option<ractor::ActorId>,
) -> ActorRef<ListenerMsg> {
    timeout(Duration::from_secs(15), async {
        loop {
            if let Some(actor) = registry::where_is(ListenerActor::name(session_id))
                && actor.get_status() == ActorStatus::Running
                && Some(actor.get_id()) != previous_id
            {
                return actor.into();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("listener should connect automatically")
}

async fn send_audio(
    listener: &ActorRef<ListenerMsg>,
    captured_samples: &std::sync::atomic::AtomicU64,
) {
    captured_samples.fetch_add(16_000, std::sync::atomic::Ordering::SeqCst);
    let audio = Bytes::from(
        1000_i16
            .to_le_bytes()
            .repeat(crate::actors::SAMPLE_RATE as usize),
    );
    assert_eq!(
        ractor::call_t!(listener, ListenerMsg::AudioDual, 1000, audio.clone(), audio).unwrap(),
        ListenerAudioResult::Accepted
    );
}

#[derive(Clone, Copy)]
enum StreamFailure {
    Silent,
    Unfinalized,
    RepeatedFinal,
}

#[tokio::test]
async fn live_words_resume_after_stalled_streams_without_restarting_recorder() {
    for failure in [
        StreamFailure::Silent,
        StreamFailure::Unfinalized,
        StreamFailure::RepeatedFinal,
    ] {
        let socket = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = socket.local_addr().unwrap();
        let server = tokio::spawn(async move {
            for connection in 0..2 {
                let (stream, _) = socket.accept().await.unwrap();
                let mut ws = accept_async(stream).await.unwrap();
                let mut first_audio = true;
                while let Some(Ok(message)) = ws.next().await {
                    match message {
                        Message::Binary(_) => {
                            if first_audio || connection == 1 {
                                ws.send(response(
                                    if connection == 0 { "before" } else { "after" },
                                    true,
                                ))
                                .await
                                .unwrap();
                                first_audio = false;
                            } else {
                                let update = match failure {
                                    StreamFailure::Silent => None,
                                    StreamFailure::Unfinalized => {
                                        Some(response("unfinished", false))
                                    }
                                    StreamFailure::RepeatedFinal => Some(response("before", true)),
                                };
                                if let Some(update) = update
                                    && ws.send(update).await.is_err()
                                {
                                    break;
                                }
                            }
                        }
                        Message::Text(text) if text.contains("Finalize") => {
                            let _ = ws.close(None).await;
                            break;
                        }
                        _ => {}
                    }
                }
            }
        });
        let vault = tempfile::tempdir().unwrap();
        let (events_tx, mut events) = mpsc::unbounded_channel();
        let mut ctx = test_ctx();
        ctx.runtime = Arc::new(TranscriptRuntime { events: events_tx });
        ctx.app_dir = vault.path().to_path_buf();
        ctx.params.session_id = uuid::Uuid::new_v4().to_string();
        ctx.params.base_url = format!("http://{address}/v1");
        ctx.params.model = "nova-3".to_string();
        let session_id = ctx.params.session_id.clone();
        let captured_samples = ctx.captured_samples.clone();
        let (supervisor, supervisor_task) = Actor::spawn(None, SessionActor, ctx).await.unwrap();
        let listener = wait_for_listener(&session_id, None).await;
        let recorder = registry::where_is(RecorderActor::name(&session_id)).unwrap();
        let source = registry::where_is(SourceActor::name(&session_id)).unwrap();
        record_audio(&recorder).await;
        send_audio(&listener, &captured_samples).await;
        wait_for_word(&mut events, "before").await;

        match failure {
            StreamFailure::Unfinalized => {
                for _ in 0..89 {
                    send_audio(&listener, &captured_samples).await;
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            }
            StreamFailure::Silent => {
                tokio::time::sleep(Duration::from_secs(30)).await;
                for _ in 0..4 {
                    send_audio(&listener, &captured_samples).await;
                }
            }
            StreamFailure::RepeatedFinal => {
                for _ in 0..5 {
                    send_audio(&listener, &captured_samples).await;
                    tokio::time::sleep(Duration::from_secs(6)).await;
                }
            }
        }
        // The first finalized response resets the audio count for the stalled period.
        send_audio(&listener, &captured_samples).await;
        let recovered = wait_for_listener(&session_id, Some(listener.get_id())).await;
        assert_eq!(
            registry::where_is(RecorderActor::name(&session_id))
                .unwrap()
                .get_id(),
            recorder.get_id()
        );
        assert_eq!(
            registry::where_is(SourceActor::name(&session_id))
                .unwrap()
                .get_id(),
            source.get_id()
        );
        assert_eq!(recorder.get_status(), ActorStatus::Running);
        record_audio(&recorder).await;
        send_audio(&recovered, &captured_samples).await;
        wait_for_word(&mut events, "after").await;
        supervisor.cast(SessionMsg::Shutdown).unwrap();
        timeout(Duration::from_secs(10), supervisor_task)
            .await
            .unwrap()
            .unwrap();
        timeout(Duration::from_secs(5), server)
            .await
            .unwrap()
            .unwrap();
        assert!(
            vault
                .path()
                .join(&session_id)
                .join("audio.mp3")
                .metadata()
                .unwrap()
                .len()
                > 0
        );
    }
}

struct LiveCapture;

impl anlg_audio::AudioProvider for LiveCapture {
    fn open_capture(
        &self,
        config: anlg_audio::CaptureConfig,
    ) -> Result<anlg_audio::CaptureStream, anlg_audio::Error> {
        let chunk = config.chunk_size;
        let period = Duration::from_secs_f64(chunk as f64 / config.sample_rate as f64);
        Ok(anlg_audio::CaptureStream::new(
            futures_util::stream::unfold(0_usize, move |frame| async move {
                tokio::time::sleep(period).await;
                let samples: Arc<[f32]> = (0..chunk)
                    .map(|i| ((frame * chunk + i) as f32 * 0.05).sin() * 0.3)
                    .collect();
                Some((
                    Ok(anlg_audio::CaptureFrame {
                        raw_mic: samples.clone(),
                        raw_speaker: samples,
                        aec_mic: None,
                    }),
                    frame + 1,
                ))
            }),
        ))
    }
    fn open_speaker_capture(
        &self,
        _sample_rate: u32,
        _chunk_size: usize,
    ) -> Result<anlg_audio::CaptureStream, anlg_audio::Error> {
        unimplemented!()
    }
    fn open_mic_capture(
        &self,
        _device: Option<String>,
        _sample_rate: u32,
        _chunk_size: usize,
    ) -> Result<anlg_audio::CaptureStream, anlg_audio::Error> {
        unimplemented!()
    }
    fn default_device_name(&self) -> String {
        "test".to_string()
    }
    fn list_mic_devices(&self) -> Vec<String> {
        vec![]
    }
    fn play_silence(&self) -> std::sync::mpsc::Sender<()> {
        std::sync::mpsc::channel().0
    }
    fn play_bytes(&self, _bytes: &'static [u8]) -> std::sync::mpsc::Sender<()> {
        std::sync::mpsc::channel().0
    }
    fn probe_mic(&self, _device: Option<String>) -> Result<(), anlg_audio::Error> {
        Ok(())
    }
    fn probe_speaker(&self) -> Result<(), anlg_audio::Error> {
        Ok(())
    }
}

async fn wait_for_audio(received: &std::sync::atomic::AtomicUsize, at_least: usize) {
    while received.load(std::sync::atomic::Ordering::SeqCst) < at_least {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

// Captured audio has to reach the provider once the handshake completes, and again after the
// provider drops the stream mid-meeting and the session reconnects.
#[tokio::test]
async fn captured_audio_reaches_the_provider_after_connecting_and_reconnecting() {
    use std::sync::atomic::{AtomicUsize, Ordering};

    let socket = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = socket.local_addr().unwrap();
    let received = [Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0))];
    let server_received = received.clone();
    let server = tokio::spawn(async move {
        for (connection, received) in server_received.iter().enumerate() {
            let (stream, _) = socket.accept().await.unwrap();
            tokio::time::sleep(Duration::from_secs(3)).await;
            let mut ws = accept_async(stream).await.unwrap();
            while let Some(Ok(message)) = ws.next().await {
                if !matches!(message, Message::Binary(_)) {
                    continue;
                }
                let count = received.fetch_add(1, Ordering::SeqCst) + 1;
                if count % 8 == 0 && ws.send(response("heard", true)).await.is_err() {
                    break;
                }
                if connection == 0 && count == 60 {
                    let _ = ws.close(None).await;
                    break;
                }
            }
        }
    });
    let vault = tempfile::tempdir().unwrap();
    let mut ctx = test_ctx();
    ctx.audio = Arc::new(LiveCapture);
    ctx.app_dir = vault.path().to_path_buf();
    ctx.params.session_id = uuid::Uuid::new_v4().to_string();
    ctx.params.base_url = format!("http://{address}/v1");
    ctx.params.model = "nova-3".to_string();
    let session_id = ctx.params.session_id.clone();
    let (supervisor, supervisor_task) = Actor::spawn(None, SessionActor, ctx).await.unwrap();

    timeout(Duration::from_secs(20), wait_for_audio(&received[0], 60))
        .await
        .expect("audio should stream after the first connect");
    timeout(Duration::from_secs(30), wait_for_audio(&received[1], 80))
        .await
        .expect("audio should stream again after reconnecting");
    let listener = wait_for_listener(&session_id, None).await;
    assert_eq!(listener.get_status(), ActorStatus::Running);

    supervisor.cast(SessionMsg::Shutdown).unwrap();
    timeout(Duration::from_secs(10), supervisor_task)
        .await
        .unwrap()
        .unwrap();
    server.abort();
}

async fn wait_for_listener_registration(session_id: &str, registered: bool) {
    while registry::where_is(ListenerActor::name(session_id)).is_some() != registered {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[tokio::test]
async fn stopping_during_a_hung_provider_handshake_is_prompt() {
    let socket = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = socket.local_addr().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let mut ctx = test_ctx();
    ctx.app_dir = vault.path().to_path_buf();
    ctx.params.session_id = uuid::Uuid::new_v4().to_string();
    ctx.params.base_url = format!("http://{address}/v1");
    ctx.params.model = "nova-3".to_string();
    let session_id = ctx.params.session_id.clone();
    let (supervisor, supervisor_task) = Actor::spawn(None, SessionActor, ctx).await.unwrap();
    timeout(
        Duration::from_secs(5),
        wait_for_listener_registration(&session_id, true),
    )
    .await
    .expect("the listener should be connecting");

    supervisor.cast(SessionMsg::Shutdown).unwrap();

    timeout(Duration::from_secs(2), supervisor_task)
        .await
        .expect("stopping must not wait for the provider handshake")
        .unwrap();
    timeout(
        Duration::from_secs(2),
        wait_for_listener_registration(&session_id, false),
    )
    .await
    .expect("the abandoned handshake should release the listener");
    drop(socket);
}
