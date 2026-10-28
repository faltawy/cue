export enum DictationPhase {
  Idle = "idle",
  Starting = "starting",
  Recording = "recording",
  Transcribing = "transcribing",
}

export enum DictationErrorCode {
  NoSpeech = "no_speech",
  CaptureInterrupted = "capture_interrupted",
}

export class DictationError extends Error {
  constructor(
    readonly code: DictationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DictationError";
  }
}

export class DictationController {
  private phase: DictationPhase = DictationPhase.Idle;
  private cancelled = false;
  private released = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private operation: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: {
      start: () => Promise<void>;
      stop: () => Promise<string>;
      cancel: () => Promise<void>;
      transcribe: (path: string) => Promise<string>;
      insert: (text: string) => Promise<void>;
      discard: (path: string) => Promise<void>;
      onPhase: (phase: DictationPhase) => void;
      onTranscript: (text: string) => void;
      onError: (error: unknown) => void;
      handsFree: boolean;
    },
  ) {}

  press() {
    if (this.phase === DictationPhase.Idle) {
      this.cancelled = false;
      this.released = false;
      this.setPhase(DictationPhase.Starting);
      this.operation = this.start();
    } else if (
      this.dependencies.handsFree &&
      this.phase !== DictationPhase.Transcribing
    ) {
      void this.release(true);
    }
    return this.operation;
  }

  release(force = false) {
    if (this.dependencies.handsFree && !force) return this.operation;
    if (this.phase === DictationPhase.Starting) this.released = true;
    if (this.phase === DictationPhase.Recording) {
      clearTimeout(this.timer);
      this.setPhase(DictationPhase.Transcribing);
      this.operation = this.finish();
    }
    return this.operation;
  }

  async cancel() {
    this.cancelled = true;
    clearTimeout(this.timer);
    if (this.phase === DictationPhase.Recording) {
      // Keep the controller busy until this recording has relinquished the mic.
      this.setPhase(DictationPhase.Starting);
      this.operation = this.dependencies
        .cancel()
        .catch(this.dependencies.onError)
        .finally(() => this.setPhase(DictationPhase.Idle));
    }
    await this.operation;
  }

  private setPhase(phase: DictationPhase) {
    this.phase = phase;
    this.dependencies.onPhase(phase);
  }

  private async start() {
    try {
      await this.dependencies.start();
      if (this.cancelled) {
        await this.dependencies.cancel();
        this.setPhase(DictationPhase.Idle);
        return;
      }
      this.setPhase(DictationPhase.Recording);
      this.timer = setTimeout(() => this.release(true), 300_000);
      if (this.released) {
        clearTimeout(this.timer);
        this.setPhase(DictationPhase.Transcribing);
        await this.finish();
      }
    } catch (error) {
      // A rejected start never owns the recorder (chat may already be using it).
      if (!this.cancelled) this.dependencies.onError(error);
      this.setPhase(DictationPhase.Idle);
    }
  }

  private async finish() {
    let path: string | undefined;
    try {
      path = await this.dependencies.stop();
      if (this.cancelled) return;
      const text = (await this.dependencies.transcribe(path)).trim();
      if (this.cancelled) return;
      if (!text)
        throw new DictationError(
          DictationErrorCode.NoSpeech,
          "No speech detected. Please try again.",
        );
      this.dependencies.onTranscript(text);
      await this.dependencies.insert(text);
    } catch (error) {
      if (!this.cancelled) this.dependencies.onError(error);
    } finally {
      if (path) {
        await this.dependencies.discard(path).catch(this.dependencies.onError);
      }
      this.setPhase(DictationPhase.Idle);
    }
  }
}
