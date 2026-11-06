// Brew-session persistence client over the JSON seam. The app hands it the
// shared seam at construction.

export function createSessionClient({ api }) {
  return {
    listSessions(batchId) {
      const query = batchId ? `?batch_id=${encodeURIComponent(batchId)}` : "";
      return api.requestJSON(`/brew-sessions${query}`);
    },

    getSession(sessionId) {
      return api.requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}`);
    },

    createSession(payload) {
      return api.requestJSON("/brew-sessions", { method: "POST", body: payload });
    },

    patchSession(sessionId, payload) {
      return api.requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: payload,
      });
    },

    addObservation(sessionId, observation) {
      return api.requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}/observations`, {
        method: "POST",
        body: observation,
      });
    },

    patchObservation(sessionId, observationId, payload) {
      return api.requestJSON(
        `/brew-sessions/${encodeURIComponent(sessionId)}/observations/${encodeURIComponent(
          observationId
        )}`,
        { method: "PATCH", body: payload }
      );
    },

    finalizeSession(sessionId) {
      return api.requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}/finalize`, {
        method: "POST",
      });
    },

    getSessionReport(sessionId, paper = "a4") {
      const query = paper ? `?paper=${encodeURIComponent(paper)}` : "";
      return api.requestBlob(`/brew-sessions/${encodeURIComponent(sessionId)}/report${query}`);
    },
  };
}
