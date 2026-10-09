export type AutosaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; error: unknown };

export interface AutosaverOptions {
  /** Saves the current state. Called with the latest state at save time. */
  save: () => Promise<void>;
  /** Debounce delay after the last change (design.md §9.2: 1 second). */
  delayMs: number;
  onStatus: (status: AutosaveStatus) => void;
  now?: () => Date;
  /** Starts paused, e.g. until the user decides whether to restore a draft. */
  paused?: boolean;
}

export interface Autosaver {
  /** Marks the document as changed and saves after the delay. */
  schedule: () => void;
  /** Saves pending changes now (unless paused). */
  flush: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
}

/**
 * Debounced autosave that never runs two saves at once. Changes made during a save
 * are saved afterwards. A failed save is retried on the next change or flush.
 */
export function createAutosaver({
  save,
  delayMs,
  onStatus,
  now = () => new Date(),
  paused: initiallyPaused = false,
}: AutosaverOptions): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let paused = initiallyPaused;
  let disposed = false;
  let running: Promise<void> | null = null;

  // A function, not inline checks: these flags change while a save is awaited.
  const isActive = () => !paused && !disposed;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const run = async (): Promise<void> => {
    if (running) {
      // A change during the save: it is picked up when the current save ends.
      return running;
    }
    if (!dirty || !isActive()) {
      return;
    }
    dirty = false;
    onStatus({ kind: 'saving' });
    running = (async () => {
      let failed = false;
      try {
        await save();
        onStatus({ kind: 'saved', at: now() });
      } catch (error: unknown) {
        failed = true;
        dirty = true;
        onStatus({ kind: 'error', error });
      } finally {
        running = null;
      }
      if (!failed && dirty && isActive()) {
        startTimer();
      }
    })();
    return running;
  };

  return {
    schedule: () => {
      dirty = true;
      if (isActive()) {
        startTimer();
      }
    },
    flush: async () => {
      clearTimer();
      if (running) {
        await running;
      }
      await run();
    },
    pause: () => {
      paused = true;
      clearTimer();
    },
    resume: () => {
      paused = false;
      if (dirty && !disposed) {
        startTimer();
      }
    },
    dispose: () => {
      disposed = true;
      clearTimer();
    },
  };
}
