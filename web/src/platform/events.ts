// TS counterpart of libs/event.c + platform/legacy_coroutines.cpp: the
// original runs game logic as real coroutines (add_task spawns a stack-
// switched fiber; task_wait_event(E_SOMETHING) blocks that fiber mid-
// function until a matching message arrives) dispatched through a
// message-code-keyed tree (T_EVENT_ROOT/T_EVENT_POINT in event.h).
//
// JS has no fiber/stack-switching primitive, so this port keeps the
// *observable* semantics (a task suspends at its wait point and resumes
// exactly there when the event fires) via async/await instead: a "task" is
// just an async function, and waitForEvent() returns a Promise that
// resolves the next time sendMessage() fires that event code — the same
// blocking-call shape task_wait_event() has from the calling code's point
// of view, verified against real call sites (game/menu.c, game/chargen.c):
// `task_wait_event(E_TIMER)` to wait a tick, `task_wait_event(E_KEYBOARD)`
// to wait for a keypress, etc.

export interface EventMessage {
  code: number;
  data?: unknown;
}

type Listener = (msg: EventMessage) => void;

const listeners = new Map<number, Set<Listener>>();

// Real event codes this port cares about so far (game/globals.h's E_*
// constants use a shared numbering space across many more devices/signals
// than this port implements yet — only declare what's actually wired).
export const E_TIMER = 12;
export const E_KEYBOARD = 10;
export const E_MOUSE = 11;

function on(code: number, listener: Listener): () => void {
  let set = listeners.get(code);
  if (!set) {
    set = new Set();
    listeners.set(code, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

// send_message(): dispatches to every task currently blocked on this event
// code. Real event.c walks a tree and lets individual T_EVENT_POINT entries
// veto/stop propagation (nezavora/nezavirat); no consumer of this port's
// kernel needs that yet, so every listener always receives the message.
export function sendMessage(code: number, data?: unknown): void {
  const set = listeners.get(code);
  if (!set || set.size === 0) return;
  for (const listener of [...set]) listener({ code, data });
}

// task_wait_event(): resolves the next time sendMessage(code) fires. Only
// ever resolves once — call it again (typically in a loop, matching the
// original's `while (...) task_wait_event(E_TIMER);` idiom) to wait again.
export function waitForEvent(code: number): Promise<EventMessage> {
  return new Promise((resolve) => {
    const off = on(code, (msg) => {
      off();
      resolve(msg);
    });
  });
}

export interface TaskHandle {
  readonly id: number;
  // term_task(): asks the task to wind down. Real term_task() just flips a
  // flag the task's own loop is expected to check (`while (running) {...}`)
  // — it doesn't forcibly unwind the coroutine's stack (that's
  // shut_down_task(), unused by any real call site this port has ported).
  // isTerminated() on the context passed into the task body is that same
  // flag; a task's own loop must check it to actually stop.
  terminate(): void;
}

export interface TaskContext {
  readonly id: number;
  isTerminated(): boolean;
}

let nextTaskId = 1;

// add_task(): the real signature takes a DOS stack size (first arg) since
// it allocates a real machine stack for the fiber — meaningless once the
// "stack" is just a JS async function's own call frames, so it's dropped
// here. Task bodies receive a TaskContext instead of reading a module-level
// "am I still running" flag, since concurrent tasks in this port are
// ordinary interleaved microtasks, not switched stacks with implicit
// "current task" state.
export function addTask(fn: (ctx: TaskContext) => Promise<void>): TaskHandle {
  const id = nextTaskId++;
  const state = { terminated: false };
  const ctx: TaskContext = { id, isTerminated: () => state.terminated };
  void fn(ctx);
  return {
    id,
    terminate: () => {
      state.terminated = true;
    },
  };
}

interface TimerEntry {
  remainingTicks: number;
  readonly intervalTicks: number;
  readonly repeat: boolean;
  readonly callback: () => void;
}

let timers: TimerEntry[] = [];

// Real timer ticks are driven by a hardware interrupt at a fixed rate
// (timer() in event.c, wired through do_events()'s per-frame pump); this
// port's equivalent is pumpTick(), meant to be called once per animation
// frame (or a fixed-rate loop) from platform wiring — see
// dungeon-view.ts's per-tick door-swing animation (A3) for the first real
// consumer.
export function setTimer(ticks: number, callback: () => void, repeat = false): () => void {
  const entry: TimerEntry = { remainingTicks: ticks, intervalTicks: ticks, repeat, callback };
  timers.push(entry);
  return () => {
    timers = timers.filter((t) => t !== entry);
  };
}

// task_wait_event(E_TIMER) sugar for "pause this task for N ticks".
export function waitTicks(ticks: number): Promise<void> {
  return new Promise((resolve) => setTimer(ticks, resolve));
}

// do_events()'s per-frame responsibility this port models: step every
// timer by one tick, firing (and re-arming, if repeating) any that reach
// zero, then broadcast E_TIMER once for every task blocked on a bare
// "next tick" wait.
export function pumpTick(): void {
  const due = timers.filter((t) => --t.remainingTicks <= 0);
  timers = timers.filter((t) => t.remainingTicks > 0 || t.repeat);
  for (const t of due) {
    t.callback();
    if (t.repeat) t.remainingTicks = t.intervalTicks;
  }
  sendMessage(E_TIMER);
}

// Test-only: real event.c has no such reset (the process just exits), but
// this module's listener/timer maps are otherwise module-global state that
// leaks across test cases without one.
export function resetEventsForTesting(): void {
  listeners.clear();
  timers = [];
  nextTaskId = 1;
}
