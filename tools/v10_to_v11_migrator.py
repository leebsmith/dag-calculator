"""Migrate data/artifact.json from the v10 JSON AST to v11 Jexl strings."""

from __future__ import annotations

import argparse
import json
import math
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "artifact.json"
DEFAULT_OUTPUT = ROOT / "artifact_v11.json"

BINARY_OPERATORS = {
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    "pow": "^",
    "gt": ">",
    "ge": ">=",
    "lt": "<",
    "le": "<=",
    "eq": "==",
    "ne": "!=",
    "and": "&&",
    "or": "||",
}
DOMAIN_OPERATORS = {
    "gt": ">",
    "gte": ">=",
    "lt": "<",
    "lte": "<=",
    "eq": "==",
    "ne": "!=",
}
REDUCTIONS = {"sum", "weighted_avg", "min", "max", "map", "filter"}
EXPR_REDUCTIONS = {
    "sum": "sum_expr",
    "weighted_avg": "weighted_avg_expr",
    "min": "min_expr",
    "max": "max_expr",
    "map": "map_expr",
    "filter": "filter_expr",
}


def jexl_number(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError(f"Unsupported non-finite number: {value!r}")
    rendered = repr(value)
    if "e" in rendered or "E" in rendered:
        return format(Decimal(rendered), "f")
    return rendered


def jexl_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return json.dumps(value)
    if isinstance(value, float):
        return jexl_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    raise ValueError(f"Unsupported literal: {value!r}")


def require_only(node: dict[str, Any], keys: set[str], path: str) -> None:
    if set(node) != keys:
        raise ValueError(f"{path}: expected keys {sorted(keys)}, got {sorted(node)}")


def simple_field_ref(node: Any, alias: str) -> str | None:
    if not isinstance(node, dict) or set(node) != {"ref"}:
        return None
    ref = node["ref"]
    if not isinstance(ref, str):
        return None
    prefix = f"{alias}."
    if not ref.startswith(prefix):
        return None
    field = ref[len(prefix) :]
    return field if field and "." not in field else None


def translate_ref(node: dict[str, Any], path: str, alias: str | None) -> str:
    require_only(node, {"ref"}, path)
    ref = node["ref"]
    if not isinstance(ref, str):
        raise ValueError(f"{path}: ref must be a string")
    if alias is not None and ref == alias:
        return "row"
    if alias is not None and ref.startswith(alias + "."):
        return "row." + ref[len(alias) + 1 :]
    return ref


def translate_const(node: dict[str, Any], path: str, alias: str | None) -> str:
    require_only(node, {"const"}, path)
    const = node["const"]
    if not isinstance(const, str):
        raise ValueError(f"{path}: const must be a string")
    return f"constants.{const}"


def translate_call(node: dict[str, Any], path: str, alias: str | None) -> str:
    fn = node["call"]
    if not isinstance(fn, str):
        raise ValueError(f"{path}: call must be a string")
    args = node.get("args", [])
    if not isinstance(args, list):
        raise ValueError(f"{path}: call args must be a list")
    rendered = ", ".join(
        translate_expr(arg, f"{path}.args[{index}]", alias) for index, arg in enumerate(args)
    )
    return f"functions.{fn}({rendered})"


def translate_expr(node: Any, path: str, alias: str | None = None) -> str:
    if node is None or isinstance(node, (bool, int, float, str)):
        return jexl_literal(node)
    if not isinstance(node, dict):
        raise ValueError(f"{path}: unsupported expression value {node!r}")
    if "ref" in node:
        return translate_ref(node, path, alias)
    if "const" in node:
        return translate_const(node, path, alias)
    if "call" in node:
        return translate_call(node, path, alias)
    if "op" in node:
        return translate_op(node, path, alias)
    raise ValueError(f"{path}: unknown expression node {sorted(node)}")


def translate_operator_args(node: dict[str, Any], path: str, alias: str | None) -> list[str]:
    args = node.get("args")
    if args is None:
        if "lhs" not in node or "rhs" not in node:
            raise ValueError(f"{path}: operator needs args or lhs/rhs")
        args = [node["lhs"], node["rhs"]]
    if not isinstance(args, list):
        raise ValueError(f"{path}: operator args must be a list")
    return [translate_expr(arg, f"{path}.args[{index}]", alias) for index, arg in enumerate(args)]


def translate_unary(op: str, args: list[str], path: str) -> str:
    require_arity(op, args, 1, path)
    if op == "neg":
        return f"({args[0]} * -1)"
    return f"(!{args[0]})"


def translate_logical(op: str, args: list[str], path: str) -> str:
    if len(args) < 2:
        raise ValueError(f"{path}: {op} needs at least two args")
    symbol = BINARY_OPERATORS[op]
    return "(" + f" {symbol} ".join(args) + ")"


def translate_binary(op: str, args: list[str], path: str) -> str:
    require_arity(op, args, 2, path)
    return f"({args[0]} {BINARY_OPERATORS[op]} {args[1]})"


def translate_op(node: dict[str, Any], path: str, alias: str | None) -> str:
    op = node["op"]
    if op in REDUCTIONS:
        return translate_reduction(node, path, alias)
    args = translate_operator_args(node, path, alias)
    if op == "if":
        require_arity(op, args, 3, path)
        return f"({args[0]} ? {args[1]} : {args[2]})"
    if op in {"neg", "not"}:
        return translate_unary(op, args, path)
    if op in {"and", "or"}:
        return translate_logical(op, args, path)
    if op in BINARY_OPERATORS:
        return translate_binary(op, args, path)
    raise ValueError(f"{path}: unknown operator {op!r}")


def require_arity(op: str, args: list[str], count: int, path: str) -> None:
    if len(args) != count:
        raise ValueError(f"{path}: operator {op!r} needs {count} args, got {len(args)}")


def subject_jexl(node: Any, path: str, alias: str | None) -> str:
    subject = translate_expr(node, path, alias)
    if isinstance(node, dict) and set(node) == {"ref"}:
        return subject
    return f"({subject})"


def translate_where(where: Any, path: str, alias: str) -> str | None:
    if where is None:
        return None
    return translate_expr(where, path, alias)


def reduction_operand(node: dict[str, Any], key: str, path: str, alias: str) -> str:
    operand = node.get(key)
    if operand is None:
        raise ValueError(f"{path}: reduction {node['op']!r} has no {key}")
    return translate_expr(operand, f"{path}.{key}", alias)


def prepare_reduction(
    node: dict[str, Any], path: str, alias: str | None
) -> tuple[str, str, str | None, str]:
    op = node["op"]
    coll = node.get("coll")
    if coll is None:
        raise ValueError(f"{path}: reduction {op!r} has no coll")
    subject = subject_jexl(coll, f"{path}.coll", alias)
    row_alias = node.get("as")
    if not isinstance(row_alias, str):
        raise ValueError(f"{path}: reduction {op!r} has no string as")
    where = translate_where(node.get("where"), f"{path}.where", row_alias)
    where_arg = "null" if where is None else jexl_literal(where)
    return subject, row_alias, where, where_arg


def translate_sum(
    subject: str, row_alias: str, where: str | None, where_arg: str, node: dict[str, Any], path: str
) -> str:
    field = simple_field_ref(node.get("body"), row_alias)
    if field is not None:
        args = [jexl_literal(field)]
        if where is not None:
            args += [jexl_literal(where), "$context"]
        return f"({subject} | sum({', '.join(args)}))"
    body = reduction_operand(node, "body", path, row_alias)
    return f"({subject} | sum_expr({jexl_literal(body)}, {where_arg}, $context))"


def translate_weighted_avg(
    subject: str, row_alias: str, where: str | None, where_arg: str, node: dict[str, Any], path: str
) -> str:
    value_field = simple_field_ref(node.get("value"), row_alias)
    weight_field = simple_field_ref(node.get("weight"), row_alias)
    if value_field is not None and weight_field is not None:
        args = [jexl_literal(value_field), jexl_literal(weight_field)]
        if where is not None:
            args += [jexl_literal(where), "$context"]
        return f"({subject} | weighted_avg({', '.join(args)}))"
    value = reduction_operand(node, "value", path, row_alias)
    weight = reduction_operand(node, "weight", path, row_alias)
    return (
        f"({subject} | weighted_avg_expr({jexl_literal(value)}, "
        f"{jexl_literal(weight)}, {where_arg}, $context))"
    )


def translate_min_max(
    op: str,
    subject: str,
    row_alias: str,
    where: str | None,
    where_arg: str,
    node: dict[str, Any],
    path: str,
) -> str:
    field = simple_field_ref(node.get("value"), row_alias)
    if field is not None:
        args = [jexl_literal(field)]
        if where is not None:
            args += [jexl_literal(where), "$context"]
        return f"({subject} | {op}({', '.join(args)}))"
    value = reduction_operand(node, "value", path, row_alias)
    return f"({subject} | {EXPR_REDUCTIONS[op]}({jexl_literal(value)}, {where_arg}, $context))"


def translate_map_filter(
    op: str, subject: str, row_alias: str, node: dict[str, Any], path: str
) -> str:
    body = reduction_operand(node, "body", path, row_alias)
    return f"({subject} | {EXPR_REDUCTIONS[op]}({jexl_literal(body)}, null, $context))"


def translate_reduction(node: dict[str, Any], path: str, alias: str | None) -> str:
    op = node["op"]
    subject, row_alias, where, where_arg = prepare_reduction(node, path, alias)
    if op == "sum":
        return translate_sum(subject, row_alias, where, where_arg, node, path)
    if op == "weighted_avg":
        return translate_weighted_avg(subject, row_alias, where, where_arg, node, path)
    if op in {"min", "max"}:
        return translate_min_max(op, subject, row_alias, where, where_arg, node, path)
    if op in {"map", "filter"}:
        return translate_map_filter(op, subject, row_alias, node, path)
    raise ValueError(f"{path}: unknown reduction {op!r}")


def translate_domain(domain: Any, path: str) -> str | None:
    if not isinstance(domain, dict):
        raise ValueError(f"{path}: domain must be an object")
    if "codes" in domain:
        require_only(domain, {"codes"}, path)
        return None
    unknown = set(domain) - set(DOMAIN_OPERATORS)
    if unknown:
        raise ValueError(f"{path}: unknown domain operators {sorted(unknown)}")
    parts = []
    for op, symbol in DOMAIN_OPERATORS.items():
        if op in domain:
            bound = translate_expr(domain[op], f"{path}.{op}")
            parts.append(f"$value {symbol} {bound}")
    if not parts:
        raise ValueError(f"{path}: empty domain")
    return " && ".join(parts)


def migrate_node_fields(path: str, node: dict[str, Any], counts: dict[str, int]) -> None:
    for field_name, field in node.get("fields", {}).items():
        if not isinstance(field, dict) or "expr" not in field:
            raise ValueError(f"{path}.fields.{field_name}: missing expr")
        field["expr"] = translate_expr(field["expr"], f"{path}.fields.{field_name}.expr")
        counts["field_expr"] += 1


def migrate_node(node_id: str, node: dict[str, Any], counts: dict[str, int]) -> None:
    path = f"nodes.{node_id}"
    if "expr" in node:
        node["expr"] = translate_expr(node["expr"], f"{path}.expr")
        counts["expr"] += 1
    if "default" in node:
        node["default"] = translate_expr(node["default"], f"{path}.default")
        counts["default"] += 1
    if "domain" in node:
        migrated = translate_domain(node["domain"], f"{path}.domain")
        if migrated is not None:
            node["domain"] = migrated
            counts["domain"] += 1
    migrate_node_fields(path, node, counts)


def migrate_nodes(artifact: dict[str, Any], counts: dict[str, int]) -> None:
    for node_id, node in artifact["nodes"].items():
        migrate_node(node_id, node, counts)


def migrate_functions(artifact: dict[str, Any], counts: dict[str, int]) -> None:
    for fn_id, fn in artifact.get("functions", {}).items():
        fn["body"] = translate_expr(fn["body"], f"functions.{fn_id}.body")
        counts["function_body"] += 1


def migrate_relations(artifact: dict[str, Any], counts: dict[str, int]) -> None:
    for index, relation in enumerate(artifact.get("relations", [])):
        relation["predicate"] = translate_expr(
            relation["predicate"], f"relations[{index}].predicate"
        )
        counts["predicate"] += 1


def migrate_schemas(artifact: dict[str, Any], counts: dict[str, int]) -> None:
    for schema_id, schema in artifact.get("primitive_schemas", {}).items():
        for field_name, field in schema.items():
            if not isinstance(field, dict) or "domain" not in field:
                continue
            field_path = f"primitive_schemas.{schema_id}.{field_name}.domain"
            migrated = translate_domain(field["domain"], field_path)
            if migrated is not None:
                field["domain"] = migrated
                counts["domain"] += 1


def migrate(artifact: dict[str, Any]) -> dict[str, int]:
    if artifact.get("schema_version") != 10:
        raise ValueError(f"expected schema_version 10, got {artifact.get('schema_version')!r}")
    counts = {
        "expr": 0,
        "default": 0,
        "domain": 0,
        "predicate": 0,
        "function_body": 0,
        "field_expr": 0,
    }
    migrate_nodes(artifact, counts)
    migrate_functions(artifact, counts)
    migrate_relations(artifact, counts)
    migrate_schemas(artifact, counts)
    artifact["schema_version"] = 11
    description = artifact.get("meta", {}).get("description")
    if isinstance(description, str):
        artifact["meta"]["description"] = description.replace(
            "schema_version 10", "schema_version 11"
        )
    verify_migrated(artifact)
    return counts


def verify_node(node_id: str, node: dict[str, Any]) -> None:
    path = f"nodes.{node_id}"
    if "expr" in node and not isinstance(node["expr"], str):
        raise ValueError(f"{path}.expr is not a Jexl string")
    if "default" in node and not isinstance(node["default"], str):
        raise ValueError(f"{path}.default is not a Jexl string")
    domain = node.get("domain")
    if domain is not None and not (isinstance(domain, dict) and set(domain) == {"codes"}):
        if not isinstance(domain, str):
            raise ValueError(f"{path}.domain is not a Jexl string")
    for field_name, field in node.get("fields", {}).items():
        if not isinstance(field.get("expr"), str):
            raise ValueError(f"{path}.fields.{field_name}.expr is not a Jexl string")


def verify_nodes(artifact: dict[str, Any]) -> None:
    for node_id, node in artifact["nodes"].items():
        verify_node(node_id, node)


def verify_functions(artifact: dict[str, Any]) -> None:
    for fn_id, fn in artifact.get("functions", {}).items():
        if not isinstance(fn.get("body"), str):
            raise ValueError(f"functions.{fn_id}.body is not a Jexl string")


def verify_relations(artifact: dict[str, Any]) -> None:
    for index, relation in enumerate(artifact.get("relations", [])):
        if not isinstance(relation.get("predicate"), str):
            raise ValueError(f"relations[{index}].predicate is not a Jexl string")


def verify_schemas(artifact: dict[str, Any]) -> None:
    for schema_id, schema in artifact.get("primitive_schemas", {}).items():
        for field_name, field in schema.items():
            if not isinstance(field, dict) or "domain" not in field:
                continue
            if not isinstance(field["domain"], str):
                raise ValueError(
                    f"primitive_schemas.{schema_id}.{field_name}.domain is not a Jexl string"
                )


def verify_migrated(artifact: dict[str, Any]) -> None:
    verify_nodes(artifact)
    verify_functions(artifact)
    verify_relations(artifact)
    verify_schemas(artifact)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    try:
        artifact = json.loads(args.input.read_text(encoding="utf-8"))
        counts = migrate(artifact)
        args.output.write_text(
            json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"migration failed: {error}", file=sys.stderr)
        return 1
    print(f"wrote {args.output}")
    for key, value in counts.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
