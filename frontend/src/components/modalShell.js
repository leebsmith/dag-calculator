function resolve(value) {
  return typeof value === "function" ? value() : value;
}

function resolveOption(value, fallback) {
  const resolved = resolve(value);
  return resolved === undefined || resolved === null ? fallback : resolved;
}

function shellGetters(props) {
  return {
    get isOpen() {
      return Boolean(this.open);
    },

    get workspace() {
      return props.variant === "workspace";
    },

    get titleText() {
      return resolve(props.title);
    },

    get subtitleText() {
      return resolve(props.subtitle);
    },

    get badgeText() {
      return resolve(props.badge);
    },

    get badgeClassText() {
      return resolve(props.badgeClass);
    },

    get cancelLabelText() {
      return resolve(props.cancelLabel);
    },

    get saveLabelText() {
      return resolve(props.saveLabel);
    },

    get saveShown() {
      return Boolean(props.save) && resolveOption(props.saveVisible, true) !== false;
    },

    get saveDisabledState() {
      return Boolean(resolveOption(props.saveDisabled, false));
    },

    get cancelDisabledState() {
      return Boolean(resolveOption(props.cancelDisabled, false));
    },
  };
}

function shellActions() {
  return {
    syncOpen(value) {
      this.open = Boolean(value);
    },

    cancelAction() {
      this.cancel?.();
    },

    saveAction() {
      this.save?.();
    },

    escapeAction() {
      (this.escape ?? this.cancel)?.();
    },

    backdropAction() {
      (this.backdrop ?? this.cancel)?.();
    },
  };
}

export function modalShell(config = {}) {
  const props = {
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
    ...config,
  };

  return {
    ...props,
    bodyId: `${props.id}-body`,
    overlayId: `${props.id}-overlay`,
    titleId: `${props.id}-title`,
    ...shellGetters(props),
    ...shellActions(),
  };
}
