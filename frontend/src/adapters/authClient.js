// Session probe: asks the backend whether the signed-in identity is allowlisted.

import { requestJSON } from "./apiClient.js";

export function getSession() {
  return requestJSON("/session");
}
