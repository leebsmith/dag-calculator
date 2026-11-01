// Brew-session persistence client over the JSON seam.

import { requestJSON } from "./apiClient.js";

export function listSessions(batchId) {
  const query = batchId ? `?batch_id=${encodeURIComponent(batchId)}` : "";
  return requestJSON(`/brew-sessions${query}`);
}

export function getSession(sessionId) {
  return requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}`);
}

export function createSession(payload) {
  return requestJSON("/brew-sessions", { method: "POST", body: payload });
}

export function patchSession(sessionId, payload) {
  return requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function addObservation(sessionId, observation) {
  return requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}/observations`, {
    method: "POST",
    body: observation,
  });
}

export function patchObservation(sessionId, observationId, payload) {
  return requestJSON(
    `/brew-sessions/${encodeURIComponent(sessionId)}/observations/${encodeURIComponent(
      observationId
    )}`,
    { method: "PATCH", body: payload }
  );
}

export function finalizeSession(sessionId) {
  return requestJSON(`/brew-sessions/${encodeURIComponent(sessionId)}/finalize`, {
    method: "POST",
  });
}
