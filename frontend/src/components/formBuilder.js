function readPath(source, path) {
  if (!path) return undefined;
  return path.split(".").reduce((value, key) => (value == null ? value : value[key]), source);
}

function writePath(source, path, value) {
  const keys = path.split(".");
  const leaf = keys.pop();
  const target = keys.reduce((node, key) => {
    if (node[key] == null || typeof node[key] !== "object") node[key] = {};
    return node[key];
  }, source);
  target[leaf] = value;
}

function resolve(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function coerce(field, value) {
  if (field.type !== "number") return value;
  if (value === "" || value == null) return field.nullable ? null : "";
  return Number(value);
}

function presentationGetters(source) {
  return {
    get label() {
      return resolve(source.label, this.context);
    },

    get hint() {
      return resolve(source.hint, this.context);
    },

    get options() {
      return resolve(source.options, this.context) || [];
    },

    get hints() {
      return (resolve(source.hints, this.context) || []).map((hint, index) => ({
        ...hint,
        id: `${source.id}-hint-${index}`,
        text: resolve(hint.text, this.context),
        when:
          typeof hint.when === "function"
            ? Boolean(hint.when(this.context))
            : hint.when !== false,
      }));
    },

    get hintId() {
      return `${source.id}-hint`;
    },

    get attrs() {
      const resolved = resolve(source.attrs, this.context) || {};
      const reserved = new Set([
        "id",
        "type",
        "value",
        "class",
        "name",
        "checked",
        "selected",
        "readonly",
        "disabled",
        "required",
      ]);
      return Object.fromEntries(
        Object.entries(resolved).filter(([key]) => !reserved.has(key))
      );
    },

    get describedBy() {
      const ids = [];
      if (this.hint) ids.push(this.hintId);
      for (const hint of this.hints) if (hint.when) ids.push(hint.id);
      return ids.length ? ids.join(" ") : null;
    },

    get visible() {
      return typeof source.when === "function"
        ? Boolean(source.when(this.context))
        : source.visible !== false;
    },
  };
}

function decorationGetters(source) {
  return {
    get min() {
      return resolve(source.min, this.context);
    },

    get max() {
      return resolve(source.max, this.context);
    },

    get step() {
      return resolve(source.step, this.context);
    },

    get badge() {
      return resolve(source.badge, this.context) || null;
    },

    get reset() {
      const reset = resolve(source.reset, this.context);
      return reset ? { show: reset.show !== false, ...reset } : null;
    },

    get actions() {
      return resolve(source.actions, this.context) || [];
    },

    get labelClass() {
      return resolve(source.labelClass, this.context) || "form-label";
    },

    get controlClass() {
      return resolve(source.controlClass, this.context) || null;
    },

    get readout() {
      return resolve(source.readout, this.context);
    },

    get warning() {
      return resolve(source.warning, this.context);
    },
  };
}

function valueGetters(source, component) {
  return {
    get context() {
      return {
        model: this._model === undefined ? component.model : this._model,
        index: this._index,
        key: this._key,
        row: this._row,
      };
    },

    get commitMode() {
      return source.commit === "change" || source.lazy ? "change" : "input";
    },

    get value() {
      if (!this.visible) return "";
      const context = this.context;
      const raw = source.read
        ? source.read(context)
        : readPath(context.model, source.modelKey);
      const value = raw === undefined ? source.default : raw;
      return source.format ? source.format(value, context) : value;
    },

    set value(next) {
      this.commit(next);
    },

    get draftValue() {
      if (source.draft?.read) return source.draft.read(this.context);
      return this._draft === undefined ? this.value : this._draft;
    },
  };
}

function actions(source, component) {
  return {
    setDraft(raw) {
      if (source.draft?.write) source.draft.write(raw, this.context);
      else this._draft = raw;
      source.onDraft?.(this, raw, this.context);
    },

    clearDraft() {
      if (source.draft?.clear) source.draft.clear(this.context);
      this._draft = undefined;
    },

    commit(raw) {
      const context = this.context;
      const next = raw === undefined ? this.draftValue : raw;
      const parsed = source.parse ? source.parse(next, context) : next;
      const value = coerce(source, parsed);

      this.clearDraft();

      if (source.write) {
        source.write(value, context);
        return value;
      }

      if (component.onChange) {
        component.onChange(this, value, context);
        return value;
      }

      if (source.modelKey && context.model) {
        writePath(context.model, source.modelKey, value);
      }

      return value;
    },

    toggle(option) {
      const current = Array.isArray(this.value) ? this.value : [];
      const next = current.includes(option)
        ? current.filter((value) => value !== option)
        : [...current, option];
      this.commit(next);
    },
  };
}

function repeatGetters(source, component) {
  return {
    get rowClass() {
      return resolve(source.rowClass, this.context);
    },

    get cellClass() {
      return resolve(source.cellClass, this.context);
    },

    get add() {
      return resolve(source.add, this.context) || null;
    },

    get remove() {
      return resolve(source.remove, this.context) || null;
    },

    get rows() {
      const items = resolve(source.items, this.context) || [];
      const schema = resolve(source.schema, this.context) || [];
      const rowClass = resolve(source.rowClass, this.context);
      const cellClass = resolve(source.cellClass, this.context);
      const remove = resolve(source.remove, this.context) || null;

      return items.map((item, index) => {
        const key = source.key ? source.key(item, index) : index;
        return {
          key,
          index,
          model: item,
          rowClass,
          cellClass,
          remove,
          fields: schema.map((child) =>
            createField(
              { ...child, id: `${child.id}-${index}` },
              component,
              { model: item, index, key, row: item }
            )
          ),
        };
      });
    },
  };
}

function createField(source, component, context = {}) {
  const field = {
    ...source,
    _draft: undefined,
    _model: context.model,
    _index: context.index ?? source.index ?? null,
    _key: context.key ?? source.key ?? source.id,
    _row: context.row ?? source.row ?? null,
    ...actions(source, component),
  };

  return Object.defineProperties(
    field,
    {
      ...Object.getOwnPropertyDescriptors(presentationGetters(source)),
      ...Object.getOwnPropertyDescriptors(decorationGetters(source)),
      ...Object.getOwnPropertyDescriptors(repeatGetters(source, component)),
      ...Object.getOwnPropertyDescriptors(valueGetters(source, component)),
    }
  );
}

export function formBuilder({ schema = [], model = null, onChange = null } = {}) {
  return {
    schema,
    model,
    onChange,
    fields: [],

    init() {
      this.fields = this.buildFields();
    },

    setModel(nextModel) {
      if (this.model === nextModel) return;
      this.model = nextModel;
      for (const field of this.fields) field.clearDraft();
    },

    buildFields() {
      return this.schema.map((field) => createField(field, this));
    },
  };
}
