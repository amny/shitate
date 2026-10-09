import { createAutosaver } from './autosaver';
import type { AutosaveStatus } from './autosaver';

function setup(options: { paused?: boolean; save?: () => Promise<void> } = {}) {
  const statuses: AutosaveStatus['kind'][] = [];
  const save = vi.fn(options.save ?? (() => Promise.resolve()));
  const autosaver = createAutosaver({
    save,
    delayMs: 1000,
    onStatus: (status) => statuses.push(status.kind),
    now: () => new Date('2026-10-04T10:00:00Z'),
    ...(options.paused === undefined ? {} : { paused: options.paused }),
  });
  return { autosaver, save, statuses };
}

describe('createAutosaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves once, 1 second after the last change', async () => {
    const { autosaver, save, statuses } = setup();
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['saving', 'saved']);
  });

  it('flush saves pending changes immediately and does nothing when clean', async () => {
    const { autosaver, save } = setup();
    await autosaver.flush();
    expect(save).not.toHaveBeenCalled();
    autosaver.schedule();
    await autosaver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not save while paused and saves after resume', async () => {
    const { autosaver, save } = setup({ paused: true });
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(5000);
    await autosaver.flush();
    expect(save).not.toHaveBeenCalled();
    autosaver.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('pause cancels a scheduled save', async () => {
    const { autosaver, save } = setup();
    autosaver.schedule();
    autosaver.pause();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it('never runs two saves at once and saves changes made during a save', async () => {
    let finish: () => void = () => undefined;
    const { autosaver, save } = setup({
      save: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('reports a failure and retries on the next change', async () => {
    let fail = true;
    const { autosaver, save, statuses } = setup({
      save: () => (fail ? Promise.reject(new Error('quota')) : Promise.resolve()),
    });
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses).toEqual(['saving', 'error']);

    // No retry loop on its own.
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    fail = false;
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual(['saving', 'error', 'saving', 'saved']);
  });

  it('flush retries after a failure', async () => {
    let fail = true;
    const { autosaver, save } = setup({
      save: () => (fail ? Promise.reject(new Error('quota')) : Promise.resolve()),
    });
    autosaver.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    fail = false;
    await autosaver.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('stops after dispose', async () => {
    const { autosaver, save } = setup();
    autosaver.schedule();
    autosaver.dispose();
    await vi.advanceTimersByTimeAsync(2000);
    await autosaver.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
