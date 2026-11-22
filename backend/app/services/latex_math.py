"""A LaTeX subset for markdown math.

The author's LaTeX is the stored fact. This module normalizes a span into a
typed AST that `lib/prose.typ` renders with Typst math content constructors.
Nothing here generates Typst source, and anything outside the subset degrades
to the literal span.
"""

from __future__ import annotations

MAX_MATH_CODE_POINTS = 500
MAX_MATH_NODES = 200
MAX_MATH_DEPTH = 8

_TEXT_COMMANDS = {"text", "mathrm", "textrm", "textup"}
_OPERATOR_CHARS = set("+-=<>/")
_SYMBOL_CHARS = set("()[],.:|")
_SIGN_CHARS = set("+-")

_SYMBOLS: dict[str, tuple[str, str]] = {
    "pm": ("math-op", "±"),
    "mp": ("math-op", "∓"),
    "times": ("math-op", "×"),
    "cdot": ("math-op", "·"),
    "div": ("math-op", "÷"),
    "to": ("math-op", "→"),
    "rightarrow": ("math-op", "→"),
    "leftarrow": ("math-op", "←"),
    "longrightarrow": ("math-op", "⟶"),
    "le": ("math-op", "≤"),
    "leq": ("math-op", "≤"),
    "ge": ("math-op", "≥"),
    "geq": ("math-op", "≥"),
    "ne": ("math-op", "≠"),
    "neq": ("math-op", "≠"),
    "approx": ("math-op", "≈"),
    "equiv": ("math-op", "≡"),
    "degree": ("math-symbol", "°"),
    "circ": ("math-symbol", "°"),
    "alpha": ("math-symbol", "α"),
    "beta": ("math-symbol", "β"),
    "gamma": ("math-symbol", "γ"),
    "delta": ("math-symbol", "δ"),
    "epsilon": ("math-symbol", "ε"),
    "zeta": ("math-symbol", "ζ"),
    "eta": ("math-symbol", "η"),
    "theta": ("math-symbol", "θ"),
    "iota": ("math-symbol", "ι"),
    "kappa": ("math-symbol", "κ"),
    "lambda": ("math-symbol", "λ"),
    "mu": ("math-symbol", "μ"),
    "nu": ("math-symbol", "ν"),
    "xi": ("math-symbol", "ξ"),
    "pi": ("math-symbol", "π"),
    "rho": ("math-symbol", "ρ"),
    "sigma": ("math-symbol", "σ"),
    "tau": ("math-symbol", "τ"),
    "upsilon": ("math-symbol", "υ"),
    "phi": ("math-symbol", "φ"),
    "chi": ("math-symbol", "χ"),
    "psi": ("math-symbol", "ψ"),
    "omega": ("math-symbol", "ω"),
    "Gamma": ("math-symbol", "Γ"),
    "Delta": ("math-symbol", "Δ"),
    "Theta": ("math-symbol", "Θ"),
    "Lambda": ("math-symbol", "Λ"),
    "Xi": ("math-symbol", "Ξ"),
    "Pi": ("math-symbol", "Π"),
    "Sigma": ("math-symbol", "Σ"),
    "Phi": ("math-symbol", "Φ"),
    "Psi": ("math-symbol", "Ψ"),
    "Omega": ("math-symbol", "Ω"),
}

_ESCAPES = {
    "$": "$",
    "%": "%",
    "&": "&",
    "_": "_",
    "#": "#",
    "{": "{",
    "}": "}",
    "\\": "\\",
    " ": " ",
    ",": " ",
    ";": " ",
    ":": " ",
}

_SPACE_COMMANDS = {"quad", "qquad", "enspace", "thinspace"}


class _MathSyntax(Exception):
    """The span is outside the supported subset."""


class _Parser:
    def __init__(self, source: str) -> None:
        self.source = source
        self.index = 0
        self.nodes = 0

    def parse(self) -> list[dict]:
        children = self.sequence(0, script=False)
        if self.index < len(self.source):
            raise _MathSyntax("unbalanced brace")
        return children

    def sequence(self, depth: int, script: bool) -> list[dict]:
        if depth > MAX_MATH_DEPTH:
            raise _MathSyntax("nesting depth exceeded")
        nodes: list[dict] = []
        while True:
            self.skip_space()
            if self.index >= len(self.source):
                if depth:
                    raise _MathSyntax("unclosed brace")
                return nodes
            char = self.source[self.index]
            if char == "}":
                if not depth:
                    raise _MathSyntax("unbalanced brace")
                self.index += 1
                return nodes
            if char in "_^":
                self.index += 1
                self.attach(nodes, subscript=char == "_", depth=depth)
                continue
            for node in self.atom(depth, script):
                self.append(nodes, node)

    def atom(self, depth: int, script: bool) -> list[dict]:
        char = self.source[self.index]
        if char == "{":
            self.index += 1
            children = self.sequence(depth + 1, script)
            if not children:
                raise _MathSyntax("empty group")
            return [self.node("math-group", children=children)]
        if char == "\\":
            return [self.command()]
        self.index += 1
        return [self.char_node(char, script)]

    def command(self) -> dict:
        self.index += 1
        start = self.index
        while self.index < len(self.source) and self.source[self.index].isalpha():
            self.index += 1
        name = self.source[start : self.index]
        if not name:
            return self.escaped_char()
        if name in _TEXT_COMMANDS:
            return self.text(self.braced_text())
        if name in _SPACE_COMMANDS:
            return self.text(" ")
        symbol = _SYMBOLS.get(name)
        if symbol is None:
            raise _MathSyntax(f"unknown command {name}")
        kind, char = symbol
        return self.node(kind, char=char)

    def escaped_char(self) -> dict:
        if self.index >= len(self.source):
            raise _MathSyntax("dangling backslash")
        escaped = self.source[self.index]
        self.index += 1
        if escaped not in _ESCAPES:
            raise _MathSyntax(f"unknown escape {escaped}")
        return self.text(_ESCAPES[escaped])

    def braced_text(self) -> str:
        self.skip_space()
        if self.index >= len(self.source) or self.source[self.index] != "{":
            raise _MathSyntax("text command needs braces")
        self.index += 1
        out: list[str] = []
        while self.index < len(self.source):
            char = self.source[self.index]
            if char == "}":
                self.index += 1
                return "".join(out)
            if char == "{":
                raise _MathSyntax("nested text braces")
            if char == "\\":
                self.index += 1
                if self.index >= len(self.source):
                    raise _MathSyntax("dangling backslash")
                escaped = self.source[self.index]
                self.index += 1
                out.append(_ESCAPES.get(escaped, escaped))
                continue
            out.append(char)
            self.index += 1
        raise _MathSyntax("unclosed text")

    def attach(self, nodes: list[dict], subscript: bool, depth: int) -> None:
        if not nodes:
            raise _MathSyntax("attachment without a base")
        children = self.argument(depth)
        slot = "sub" if subscript else "sup"
        last = nodes[-1]
        if last["type"] == "math-attach" and slot not in last:
            last[slot] = children
            return
        base = [nodes.pop()]
        self.append(nodes, self.node("math-attach", base=base, **{slot: children}))

    def argument(self, depth: int) -> list[dict]:
        self.skip_space()
        if self.index >= len(self.source):
            raise _MathSyntax("dangling attachment")
        children = self.atom(depth + 1, script=True)
        if not children:
            raise _MathSyntax("empty attachment")
        return children

    def char_node(self, char: str, script: bool) -> dict:
        if char.isalnum():
            return self.text(char)
        if char in _SYMBOL_CHARS:
            return self.node("math-symbol", char=char)
        if char in _SIGN_CHARS and script:
            return self.node("math-symbol", char=char)
        if char in _OPERATOR_CHARS:
            return self.node("math-op", char=char)
        raise _MathSyntax(f"unsupported character {char}")

    def skip_space(self) -> None:
        while self.index < len(self.source) and self.source[self.index] in " \t":
            self.index += 1
        if self.index < len(self.source) and self.source[self.index] == "\n":
            raise _MathSyntax("newline in math")

    def append(self, nodes: list[dict], node: dict) -> None:
        if node["type"] == "text" and nodes and nodes[-1]["type"] == "text":
            nodes[-1]["value"] += node["value"]
            return
        self.spend()
        nodes.append(node)

    def text(self, value: str) -> dict:
        return {"type": "text", "value": value}

    def node(self, kind: str, **fields: object) -> dict:
        return {"type": kind, **fields}

    def spend(self) -> None:
        self.nodes += 1
        if self.nodes > MAX_MATH_NODES:
            raise _MathSyntax("node count exceeded")


def parse_math(source: object) -> dict | None:
    """Normalize a math span into a math AST, or None when it is unsupported."""
    if not isinstance(source, str):
        return None
    text = source.strip()
    if not text or len(text) > MAX_MATH_CODE_POINTS:
        return None
    try:
        children = _Parser(text).parse()
    except _MathSyntax:
        return None
    if not children:
        return None
    return {"type": "math", "children": children}
