// Session probe: asks the backend whether the signed-in identity is allowlisted.
// The client receives the app's JSON seam at construction.

export function createAuthClient({ api }) {
  return {
    getSession() {
      return api.requestJSON("/session");
    },
  };
}
