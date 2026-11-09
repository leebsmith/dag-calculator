// Advisory markdown validation exposed to templates. The validator owns a
// bounded cache; templates only ask for the issue list or a boolean.

import { createProseValidator } from "../markdown/validate.js";
import { requireObservability } from "../observability.js";

export function createProseValidation({
  observability = requireObservability(null, "createProseValidation"),
} = {}) {
  const validator = createProseValidator({ reportError: observability.reportError });

  return {
    proseIssues(value) {
      return validator.validate(value).issues;
    },
  };
}

export const KEYS = ["proseIssues"];
