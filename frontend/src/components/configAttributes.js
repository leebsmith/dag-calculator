// Resolve an Alpine component's config from a data attribute.
//
// The CSP build cannot parse `x-data="formBuilder({ schema: [...] })"`, so the
// schema lives on the enclosing scope (an app member or a store member) and the
// template names it: `x-data="formBuilder" data-schema="hopInspectorFields"`.
// A dotted name may cross into `$store`, e.g. `$store.setup.batchIdentityFields`.

export function resolveNamedMember(scope, name) {
  const parts = String(name ?? "")
    .split(".")
    .filter(Boolean);
  if (!scope || parts.length === 0) return null;

  let owner = scope;
  for (let index = 0; index < parts.length; index += 1) {
    if (owner == null) return null;
    const next = owner[parts[index]];
    if (next === undefined) return null;
    if (index === parts.length - 1) {
      return typeof next === "function" ? next.call(owner) : next;
    }
    owner = next;
  }
  return null;
}

export function resolveConfigFromElement(element, attribute) {
  const name = element?.dataset?.[attribute];
  if (!name) return null;
  const parent = element.parentElement;
  if (!parent) return null;
  const scope = globalThis.Alpine?.$data?.(parent);
  if (!scope) return null;
  return resolveNamedMember(scope, name);
}
