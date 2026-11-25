import { afterEach, describe, expect, it } from 'vitest';
import { addTask, pumpTick, resetEventsForTesting, sendMessage, setTimer, waitForEvent, waitTicks, E_KEYBOARD, E_TIMER } from './events';

afterEach(() => {
  resetEventsForTesting();
});

describe('waitForEvent / sendMessage', () => {
  it('resolves the next matching sendMessage, carrying its data', async () => {
    const promise = waitForEvent(E_KEYBOARD);
    sendMessage(E_KEYBOARD, { key: 'Enter' });
    const msg = await promise;
    expect(msg).toEqual({ code: E_KEYBOARD, data: { key: 'Enter' } });
  });

  it('only resolves once per call — a second wait needs a second sendMessage', async () => {
    const first = waitForEvent(E_TIMER);
    sendMessage(E_TIMER);
    await first;

    const second = waitForEvent(E_TIMER);
    let resolved = false;
    void second.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    sendMessage(E_TIMER);
    await second;
    expect(resolved).toBe(true);
  });

  it('delivers to every task blocked on the same code, matching the real event tree fanning out to every listener', async () => {
    const a = waitForEvent(E_MOUSE_TEST_CODE);
    const b = waitForEvent(E_MOUSE_TEST_CODE);
    sendMessage(E_MOUSE_TEST_CODE, 42);
    expect(await a).toEqual({ code: E_MOUSE_TEST_CODE, data: 42 });
    expect(await b).toEqual({ code: E_MOUSE_TEST_CODE, data: 42 });
  });

  it('sendMessage with no listeners is a no-op, not an error', () => {
    expect(() => sendMessage(999)).not.toThrow();
  });
});

const E_MOUSE_TEST_CODE = 11;

describe('addTask', () => {
  it('runs the task body immediately and matches real add_task/task_wait_event\'s blocking-call idiom', async () => {
    const seen: string[] = [];
    addTask(async () => {
      seen.push('start');
      await waitForEvent(E_TIMER);
      seen.push('resumed');
    });
    await Promise.resolve();
    expect(seen).toEqual(['start']);
    sendMessage(E_TIMER);
    await Promise.resolve();
    expect(seen).toEqual(['start', 'resumed']);
  });

  it('terminate() flips isTerminated(), matching term_task()\'s cooperative flag (not a forced stop)', async () => {
    const seen: string[] = [];
    const handle = addTask(async (ctx) => {
      while (!ctx.isTerminated()) {
        seen.push('tick');
        await waitForEvent(E_TIMER);
      }
      seen.push('stopped');
    });

    sendMessage(E_TIMER);
    await Promise.resolve();
    expect(seen).toEqual(['tick', 'tick']);

    handle.terminate();
    sendMessage(E_TIMER);
    await Promise.resolve();
    // loop condition re-checked after the wait resolves, so one more tick
    // before it actually exits — cooperative, not forced.
    expect(seen).toEqual(['tick', 'tick', 'stopped']);
  });

  it('assigns increasing ids', () => {
    const a = addTask(async () => {});
    const b = addTask(async () => {});
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe('timers', () => {
  it('setTimer fires its callback after the given number of ticks, not before', () => {
    let fired = 0;
    setTimer(3, () => {
      fired++;
    });
    pumpTick();
    pumpTick();
    expect(fired).toBe(0);
    pumpTick();
    expect(fired).toBe(1);
  });

  it('repeat re-arms the timer at the same interval instead of firing once', () => {
    let fired = 0;
    setTimer(2, () => {
      fired++;
    }, true);
    pumpTick();
    pumpTick();
    expect(fired).toBe(1);
    pumpTick();
    pumpTick();
    expect(fired).toBe(2);
  });

  it('the cancel function returned by setTimer stops it from firing', () => {
    let fired = 0;
    const cancel = setTimer(2, () => {
      fired++;
    });
    cancel();
    pumpTick();
    pumpTick();
    pumpTick();
    expect(fired).toBe(0);
  });

  it('waitTicks resolves after exactly that many pumpTick calls', async () => {
    let resolved = false;
    void waitTicks(2).then(() => {
      resolved = true;
    });
    pumpTick();
    expect(resolved).toBe(false);
    pumpTick();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('pumpTick broadcasts E_TIMER to any task waiting on a bare tick', async () => {
    let resumed = false;
    void waitForEvent(E_TIMER).then(() => {
      resumed = true;
    });
    pumpTick();
    await Promise.resolve();
    expect(resumed).toBe(true);
  });
});
