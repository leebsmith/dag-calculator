function readPath(source, path) {
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

function resolve(value, model) {
  return typeof value === "function" ? value(model) : value;
}

function coerce(field, value) {
  if (field.type !== "number") return value;
  if (value === "" || value == null) return field.nullable ? null : "";
  return Number(value);
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
      this.model = nextModel;
    },

    buildFields() {
      const component = this;

      return this.schema.map((field) => ({
        ...field,

        get label() {
          return resolve(field.label, component.model);
        },

        get hint() {
          return resolve(field.hint, component.model);
        },

        get options() {
          return resolve(field.options, component.model) || [];
        },

        get visible() {
          return typeof field.when === "function" ? field.when(component.model) : field.visible !== false;
        },

        get value() {
          const value = readPath(component.model, field.modelKey);
          return value === undefined ? field.default : value;
        },

        set value(next) {
          const value = coerce(field, next);

          if (component.onChange) {
            component.onChange(field, value);
            return;
          }

          if (component.model) writePath(component.model, field.modelKey, value);
        },
      }));
    },
  };
}
