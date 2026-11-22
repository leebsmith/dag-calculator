"""The LaTeX subset behind inline math prose."""

from __future__ import annotations

from app.services import latex_math
from app.services.latex_math import parse_math


def children(source: str) -> list[dict]:
    ast = parse_math(source)
    assert ast is not None, source
    return ast["children"]


def test_chemical_formula_is_upright_text_with_a_subscript() -> None:
    assert children(r"\text{CaCl}_2") == [
        {
            "type": "math-attach",
            "base": [{"type": "text", "value": "CaCl"}],
            "sub": [{"type": "text", "value": "2"}],
        }
    ]


def test_bare_letters_run_together_as_upright_text() -> None:
    assert children("NaCl") == [{"type": "text", "value": "NaCl"}]


def test_a_charge_keeps_its_sign_unspaced() -> None:
    [attach] = children(r"SO_4^{2-}")
    assert attach["sub"] == [{"type": "text", "value": "4"}]
    assert attach["sup"] == [
        {
            "type": "math-group",
            "children": [
                {"type": "text", "value": "2"},
                {"type": "math-symbol", "char": "-"},
            ],
        }
    ]


def test_operators_and_greek_are_semantic() -> None:
    assert children(r"\alpha + \beta = 2") == [
        {"type": "math-symbol", "char": "α"},
        {"type": "math-op", "char": "+"},
        {"type": "math-symbol", "char": "β"},
        {"type": "math-op", "char": "="},
        {"type": "text", "value": "2"},
    ]


def test_a_text_command_keeps_its_characters() -> None:
    assert children(r"\text{a\}b} + 10\ \text{g}") == [
        {"type": "text", "value": "a}b"},
        {"type": "math-op", "char": "+"},
        {"type": "text", "value": "10 g"},
    ]


def test_brace_groups_bind_as_one_base() -> None:
    [attach] = children("{a+b}_2")
    assert attach["base"] == [
        {
            "type": "math-group",
            "children": [
                {"type": "text", "value": "a"},
                {"type": "math-op", "char": "+"},
                {"type": "text", "value": "b"},
            ],
        }
    ]


def test_superscript_and_subscript_share_one_attachment() -> None:
    [attach] = children("x_2^3")
    assert attach["sub"] == [{"type": "text", "value": "2"}]
    assert attach["sup"] == [{"type": "text", "value": "3"}]


def test_unsupported_syntax_returns_none() -> None:
    assert parse_math(r"\frac{1}{2}") is None
    assert parse_math(r"\sqrt{x}") is None
    assert parse_math(r"_2") is None
    assert parse_math("{x") is None
    assert parse_math("x}") is None
    assert parse_math("{}") is None
    assert parse_math("a\nb") is None
    assert parse_math("a % b") is None
    assert parse_math("\\") is None
    assert parse_math("") is None
    assert parse_math("   ") is None
    assert parse_math(None) is None


def test_the_source_length_cap_returns_none() -> None:
    allowed = "a" * latex_math.MAX_MATH_CODE_POINTS
    assert parse_math(allowed) is not None
    assert parse_math("a" * (latex_math.MAX_MATH_CODE_POINTS + 1)) is None


def test_the_node_cap_returns_none() -> None:
    spaced = "+".join("a" for _ in range(latex_math.MAX_MATH_NODES))
    assert parse_math(spaced) is None


def test_the_nesting_cap_returns_none() -> None:
    deep = "{" * latex_math.MAX_MATH_DEPTH + "x" + "}" * latex_math.MAX_MATH_DEPTH
    assert parse_math(deep) is not None
    deeper = "{" * (latex_math.MAX_MATH_DEPTH + 1) + "x" + "}" * (
        latex_math.MAX_MATH_DEPTH + 1
    )
    assert parse_math(deeper) is None
