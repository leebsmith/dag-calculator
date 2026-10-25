"""Canonical JSON serialization shared by fingerprints and content hashes.

The byte form matches the JavaScript engine's ``canonicalize`` (see
``frontend/src/engine/boundary.js``), so a hash produced here can be checked by
the browser and vice versa.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def js_float_to_string(x: float) -> str:
    """Format a float the way ECMAScript ``Number::toString`` / ``JSON.stringify`` does.

    * shortest round-trip digits (CPython's ``repr`` already gives these),
    * integral doubles lose their ``.0`` suffix,
    * scientific notation only when the decimal exponent is ``<= -6`` or ``>= 21``,
    * ``-0`` and non-finite values collapse to ``0`` / ``null`` respectively.
    """
    if x != x or x in (float("inf"), float("-inf")):
        return "null"
    if x == 0.0:
        return "0"

    sign = "-" if x < 0 else ""
    ax = abs(x)

    mant, sep, exp = repr(ax).partition("e")
    e = int(exp) if sep else 0
    point = mant.find(".")
    if point == -1:
        digits = mant
        frac_len = 0
    else:
        digits = mant[:point] + mant[point + 1 :]
        frac_len = len(mant) - point - 1
    exp10 = e - frac_len

    stripped = digits.lstrip("0")
    digits = stripped.rstrip("0")
    exp10 += len(stripped) - len(digits)

    k = len(digits)
    n = exp10 + k

    if k <= n <= 21:
        body = digits + "0" * (n - k)
    elif 0 < n <= 21:
        body = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        body = "0." + "0" * (-n) + digits
    else:
        exponent = n - 1
        body = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + (
            "+" if exponent >= 0 else "-"
        ) + str(abs(exponent))
    return sign + body


def canonicalize(obj: Any) -> str:
    """Serialize a ``model_dump(mode="json")`` structure as compact JS-compatible JSON."""
    if obj is None:
        return "null"
    if obj is True:
        return "true"
    if obj is False:
        return "false"
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False)
    if isinstance(obj, float):
        return js_float_to_string(obj)
    if isinstance(obj, int):
        return str(obj)
    if isinstance(obj, (list, tuple)):
        return "[" + ",".join(canonicalize(v) for v in obj) + "]"
    if isinstance(obj, dict):
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + canonicalize(v)
            for k, v in sorted(obj.items(), key=lambda kv: kv[0])
        ) + "}"
    raise TypeError(f"Unsupported type in fingerprint: {type(obj)!r}")


def sha256_canonical(obj: Any) -> str:
    """Prefixed SHA-256 of the canonical form: ``sha256:<hex>``."""
    digest = hashlib.sha256(canonicalize(obj).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"
