// Boundary seam: which side realizes a boundary for this app instance.
//
// Production passes no `boundaries` map, so every binding is solved over HTTP
// by `boundaryRunner` (see `BOUNDARY_URLS`). Tests inject a provider map and
// the engine resolves synchronously instead. The two paths never mix: a map
// means in-process resolution, its absence means the server is the only host.

export function resolveBoundarySeam(options = {}) {
  const boundaries = options.boundaries ?? null;
  return { boundaries: boundaries ?? {}, remote: boundaries === null };
}
