import { alpineScope, resolveNamedMember, resolveReference } from "./configAttributes.js";

// Aliases a value from the enclosing scope under a fixed name, so a shared
// partial can bind one name. The CSP build cannot parse `x-data="{ delta: … }"`;
// this component reads its sources from data attributes and re-resolves them on
// every read, so the parent's reactivity is preserved. Sources resolve through
// the element's *parent* scope: the alias's own bindings must never be a source,
// or a name like `findings` would resolve to the getter it is defining.
//
//   x-data="scopeAlias" data-origin="$store.imports.originOf"
//                       data-origin-arg="$store.recipes.activeId"
//   x-data="scopeAlias" data-delta="origin.delta"
//   x-data="scopeAlias" data-findings="stepFindingItems"

function scopeOf(element) {
  if (!element) return null;
  // The alias's own bindings must never be a source. `editor.html` binds
  // `data-findings="findings"`; resolving through the element itself found this
  // component's `findings` getter and recursed until the stack overflowed.
  return alpineScope(element.parentElement ?? element);
}

export function scopeAlias() {
  return {
    originSource: "",
    originArgSource: "",
    deltaSource: "",
    findingsSource: "",
    fieldSource: "",

    init() {
      const data = this.$el?.dataset ?? {};
      this.originSource = data.origin ?? "";
      this.originArgSource = data.originArg ?? "";
      this.deltaSource = data.delta ?? "";
      this.findingsSource = data.findings ?? "";
      this.fieldSource = data.field ?? "";
    },

    resolve(source, argSource = "") {
      if (!source) return null;
      const scope = scopeOf(this.$el);
      if (!scope) return null;
      if (!argSource) return resolveNamedMember(scope, source);
      const reference = resolveReference(scope, source);
      if (!reference) return null;
      return reference.value.call(reference.owner, resolveNamedMember(scope, argSource));
    },

    get origin() {
      return this.resolve(this.originSource, this.originArgSource);
    },

    get delta() {
      return this.resolve(this.deltaSource);
    },

    get findings() {
      return this.resolve(this.findingsSource) ?? [];
    },

    get field() {
      return this.resolve(this.fieldSource);
    },
  };
}
