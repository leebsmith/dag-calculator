import { resolveConfigFromElement } from "./configAttributes.js";

// Data-table config holder. The CSP build cannot parse inline object literals,
// so the table names its config on the enclosing scope:
// `x-data="tableConfig" data-config="gristTableConfig"`.
export function tableConfig(config = null) {
  return {
    config,
    init() {
      if (!this.config) {
        this.config = resolveConfigFromElement(this.$el, "config") ?? {};
      }
    },
  };
}
