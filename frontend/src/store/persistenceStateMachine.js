// Pure persistence state transitions. The manager owns I/O, timers, and the
// active batch; this reducer only maps (state, action) -> (state, effects).

export const DEFAULT_RETRY_DELAYS = Object.freeze([1000, 2000, 4000]);

export function initialPersistenceState(retryDelays = DEFAULT_RETRY_DELAYS) {
  return {
    dirty: false,
    saveState: "idle",
    conflictRemote: null,
    retryAttempt: 0,
    retryDelays,
  };
}

export function nextRetryDelay(state) {
  if (state.retryAttempt >= state.retryDelays.length) return null;
  return state.retryDelays[state.retryAttempt];
}

function saveFailure(state) {
  const delay = nextRetryDelay(state);
  if (delay == null) {
    return {
      state: { ...state, saveState: "error" },
      effects: [],
    };
  }
  return {
    state: {
      ...state,
      saveState: "saving",
      retryAttempt: state.retryAttempt + 1,
    },
    effects: [{ type: "RETRY", delay }],
  };
}

export function reducePersistenceState(state, action) {
  switch (action.type) {
    case "RESET":
      return {
        state: initialPersistenceState(state.retryDelays),
        effects: [],
      };
    case "EDIT":
      return {
        state: { ...state, dirty: true, saveState: "dirty" },
        effects: [{ type: "SCHEDULE_SAVE", delay: action.delay ?? 400 }],
      };
    case "TIMER_FIRED":
      return {
        state: { ...state, saveState: "saving" },
        effects: [{ type: "SAVE" }],
      };
    case "SAVE_REQUESTED":
      return {
        state: { ...state, saveState: "saving" },
        effects: [{ type: "SAVE" }],
      };
    case "SAVE_SUCCESS":
      return {
        state: {
          ...state,
          dirty: false,
          saveState: "idle",
          conflictRemote: null,
          retryAttempt: 0,
        },
        effects: [],
      };
    case "CONFLICT":
      return {
        state: {
          ...state,
          saveState: "conflict",
          conflictRemote: action.remote ?? null,
          retryAttempt: 0,
        },
        effects: [],
      };
    case "SAVE_FAILURE":
      return saveFailure(state);
    case "SET_RETRY_DELAYS":
      return {
        state: { ...state, retryDelays: action.delays ?? DEFAULT_RETRY_DELAYS },
        effects: [],
      };
    default:
      return { state, effects: [] };
  }
}
