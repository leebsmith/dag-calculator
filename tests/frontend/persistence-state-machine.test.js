import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RETRY_DELAYS,
  initialPersistenceState,
  nextRetryDelay,
  reducePersistenceState,
} from "../../frontend/src/store/persistenceStateMachine.js";

test("initial state is idle, clean, and has the default backoff", () => {
  assert.deepEqual(initialPersistenceState(), {
    dirty: false,
    saveState: "idle",
    conflictRemote: null,
    retryAttempt: 0,
    retryDelays: DEFAULT_RETRY_DELAYS,
  });
});

test("EDIT marks the state dirty and SAVE_START moves it to saving", () => {
  const edited = reducePersistenceState(initialPersistenceState(), { type: "EDIT" });
  assert.deepEqual(edited.state, {
    dirty: true,
    saveState: "dirty",
    conflictRemote: null,
    retryAttempt: 0,
    retryDelays: DEFAULT_RETRY_DELAYS,
  });
  assert.deepEqual(edited.effects, []);

  const saving = reducePersistenceState(edited.state, { type: "SAVE_START" });
  assert.equal(saving.state.saveState, "saving");
  assert.equal(saving.state.dirty, true);
});

test("SAVE_SUCCESS clears dirty, conflict, and the retry counter", () => {
  const state = {
    dirty: true,
    saveState: "saving",
    conflictRemote: { id: "remote" },
    retryAttempt: 2,
    retryDelays: DEFAULT_RETRY_DELAYS,
  };
  assert.deepEqual(reducePersistenceState(state, { type: "SAVE_SUCCESS" }), {
    state: {
      dirty: false,
      saveState: "idle",
      conflictRemote: null,
      retryAttempt: 0,
      retryDelays: DEFAULT_RETRY_DELAYS,
    },
    effects: [],
  });
});

test("CONFLICT records the remote snapshot", () => {
  const remote = { id: "b1", updated_at: 2 };
  const result = reducePersistenceState(initialPersistenceState(), {
    type: "CONFLICT",
    remote,
  });
  assert.equal(result.state.saveState, "conflict");
  assert.equal(result.state.conflictRemote, remote);
  assert.equal(result.state.retryAttempt, 0);
});

test("SAVE_FAILURE returns the next backoff delay, then errors", () => {
  let state = initialPersistenceState();
  assert.equal(nextRetryDelay(state), 1000);

  const first = reducePersistenceState(state, { type: "SAVE_FAILURE" });
  state = first.state;
  assert.equal(state.saveState, "saving");
  assert.equal(state.retryAttempt, 1);
  assert.deepEqual(first.effects, [{ type: "RETRY", delay: 1000 }]);

  const second = reducePersistenceState(state, { type: "SAVE_FAILURE" });
  state = second.state;
  assert.equal(state.retryAttempt, 2);
  assert.deepEqual(second.effects, [{ type: "RETRY", delay: 2000 }]);

  const third = reducePersistenceState(state, { type: "SAVE_FAILURE" });
  state = third.state;
  assert.equal(state.retryAttempt, 3);
  assert.deepEqual(third.effects, [{ type: "RETRY", delay: 4000 }]);

  const exhausted = reducePersistenceState(state, { type: "SAVE_FAILURE" });
  assert.equal(exhausted.state.saveState, "error");
  assert.deepEqual(exhausted.effects, []);
  assert.equal(nextRetryDelay(exhausted.state), null);
});

test("SET_RETRY_DELAYS replaces the backoff without mutating the source state", () => {
  const state = initialPersistenceState();
  const result = reducePersistenceState(state, { type: "SET_RETRY_DELAYS", delays: [0] });

  assert.deepEqual(result.state.retryDelays, [0]);
  assert.deepEqual(state.retryDelays, DEFAULT_RETRY_DELAYS);
});

test("RESET returns an idle clean state while preserving the backoff", () => {
  const state = {
    dirty: true,
    saveState: "conflict",
    conflictRemote: { id: "remote" },
    retryAttempt: 2,
    retryDelays: [0, 0],
  };
  assert.deepEqual(reducePersistenceState(state, { type: "RESET" }), {
    state: {
      dirty: false,
      saveState: "idle",
      conflictRemote: null,
      retryAttempt: 0,
      retryDelays: [0, 0],
    },
    effects: [],
  });
});

test("unknown actions preserve the exact state object", () => {
  const state = initialPersistenceState();
  assert.deepEqual(reducePersistenceState(state, { type: "UNKNOWN" }), {
    state,
    effects: [],
  });
});
