import { resolveConfigFromElement } from "./configAttributes.js";

function resolve(value) {
  return typeof value === "function" ? value() : value;
}

function resolveOption(value, fallback) {
  const resolved = resolve(value);
  return resolved === undefined || resolved === null ? fallback : resolved;
}

const DEFAULTS = {
  open: false,
  title: "",
  subtitle: null,
  badge: null,
  badgeClass: "badge-info",
  variant: "workspace",
  cancel: null,
  save: null,
  escape: null,
  backdrop: null,
  cancelLabel: "Cancel",
  saveLabel: "Save & Apply",
  saveVisible: null,
  saveDisabled: null,
  cancelDisabled: null,
};

function shellGetters() {
  return {
    get isOpen() {
      return Boolean(this.open);
    },

    get workspace() {
      return this.config?.variant === "workspace";
    },

    get titleText() {
      return resolve(this.config?.title);
    },

    get subtitleText() {
      return resolve(this.config?.subtitle);
    },

    get badgeText() {
      return resolve(this.config?.badge);
    },

    get badgeClassText() {
      return resolve(this.config?.badgeClass);
    },

    get cancelLabelText() {
      return resolve(this.config?.cancelLabel);
    },

    get saveLabelText() {
      return resolve(this.config?.saveLabel);
    },

    get cancelShown() {
      return Boolean(this.config?.cancel);
    },

    get saveShown() {
      return Boolean(this.config?.save) && resolveOption(this.config?.saveVisible, true) !== false;
    },

    get saveDisabledState() {
      return Boolean(resolveOption(this.config?.saveDisabled, false));
    },

    get cancelDisabledState() {
      return Boolean(resolveOption(this.config?.cancelDisabled, false));
    },
  };
}

function shellActions() {
  return {
    init() {
      const supplied = this.config ?? resolveConfigFromElement(this.$el, "shell") ?? {};
      this.config = { ...DEFAULTS, ...supplied };
      const id = this.config.id ?? "modal";
      this.bodyId = `${id}-body`;
      this.overlayId = `${id}-overlay`;
      this.titleId = `${id}-title`;
      this.open = Boolean(this.config.open ?? false);
    },

    syncOpen(value) {
      this.open = Boolean(value);
    },

    cancelAction() {
      this.config?.cancel?.();
    },

    saveAction() {
      this.config?.save?.();
    },

    escapeAction() {
      (this.config?.escape ?? this.config?.cancel)?.();
    },

    backdropAction() {
      (this.config?.backdrop ?? this.config?.cancel)?.();
    },

    focusRef(open, name) {
      if (!open) return;
      this.$nextTick(() => this.$refs?.[name]?.focus?.());
    },
  };
}

export function modalShell(config = null) {
  const data = {
    config,
    open: false,
    bodyId: "",
    overlayId: "",
    titleId: "",
    ...shellActions(),
  };
  return Object.defineProperties(data, Object.getOwnPropertyDescriptors(shellGetters()));
}
