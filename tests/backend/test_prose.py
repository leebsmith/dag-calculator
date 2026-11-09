"""Markdown prose normalization and the report/session enrichers."""

from __future__ import annotations

from app.services import prose


def inline_types(ast: dict) -> list[str]:
    return [node["type"] for node in ast["children"][0]["children"]]


def test_inline_markdown_is_normalized() -> None:
    ast = prose.parse_markdown(
        "Hello **bold** *em* ~~strike~~ `code` [link](https://example.com)."
    )
    assert inline_types(ast) == [
        "text",
        "strong",
        "text",
        "emph",
        "text",
        "strike",
        "text",
        "code",
        "text",
        "link",
        "text",
    ]
    link = ast["children"][0]["children"][9]
    assert link["href"] == "https://example.com"


def test_unsafe_links_keep_their_label_without_a_link() -> None:
    ast = prose.parse_markdown("[bad](javascript:alert(1)) and [good](https://example.com)")
    children = ast["children"][0]["children"]
    assert [child["type"] for child in children].count("link") == 1
    assert children[0] == {"type": "text", "value": "bad"}
    assert children[-1]["href"] == "https://example.com"


def test_images_degrade_to_alt_text() -> None:
    ast = prose.parse_markdown("![alt text](https://example.com/x.png)")
    assert ast["children"][0]["children"] == [{"type": "text", "value": "alt text"}]


def test_raw_html_stays_text() -> None:
    ast = prose.parse_markdown("<script>alert(1)</script>")
    assert ast["children"][0]["children"] == [
        {"type": "text", "value": "<script>alert(1)</script>"}
    ]


def test_gfm_tables_are_normalized() -> None:
    ast = prose.parse_markdown(
        "| Left | Center | Right |\n"
        "| :--- | :----: | ----: |\n"
        "| one | **two** | `3` |\n"
        "| four | five | six |\n"
    )
    table = ast["children"][0]
    assert table["type"] == "table"
    assert table["align"] == ["left", "center", "right"]
    assert len(table["header"]) == 3
    assert table["header"][0] == [{"type": "text", "value": "Left"}]
    assert any(node["type"] == "strong" for node in table["rows"][0][1])
    assert any(node["type"] == "code" for node in table["rows"][0][2])


def test_malformed_tables_stay_paragraphs() -> None:
    ast = prose.parse_markdown("| Header 1 | Header 2 |\n| +++++ | +++++ |\n| One | Two |")
    assert [node["type"] for node in ast["children"]] == ["paragraph"]


def test_table_column_cap_falls_back_to_one_paragraph() -> None:
    columns = [f"h{index}" for index in range(prose.MAX_TABLE_COLUMNS + 1)]
    source = f"| {' | '.join(columns)} |\n| {' | '.join('---' for _ in columns)} |"
    ast = prose.parse_markdown(source)
    assert [node["type"] for node in ast["children"]] == ["paragraph"]


def test_table_row_cap_falls_back_to_one_paragraph() -> None:
    rows = "\n".join(
        f"| {index} | row |" for index in range(prose.MAX_TABLE_ROWS + 1)
    )
    ast = prose.parse_markdown(f"| a | b |\n| --- | --- |\n{rows}")
    assert [node["type"] for node in ast["children"]] == ["paragraph"]


def test_lists_quotes_code_and_rules_are_normalized() -> None:
    ast = prose.parse_markdown(
        "- one\n- two\n\n1. first\n2. second\n\n> quote\n\n```\ncode\n```\n\n---\n"
    )
    kinds = [node["type"] for node in ast["children"]]
    assert kinds == ["list", "list", "quote", "code", "hr"]
    assert ast["children"][0]["ordered"] is False
    assert ast["children"][1]["start"] == 1
    assert ast["children"][3]["block"] is True


def test_empty_input_is_an_empty_document() -> None:
    assert prose.parse_markdown("   ") == {"type": "doc", "children": []}
    assert prose.parse_markdown(None) == {"type": "doc", "children": []}


def test_overlong_source_falls_back_to_one_paragraph() -> None:
    ast = prose.parse_markdown("a" * (prose.MAX_SOURCE_CODE_POINTS + 1))
    assert [node["type"] for node in ast["children"]] == ["paragraph"]
    assert ast["children"][0]["children"][0]["value"].endswith("…")


def test_too_many_nodes_falls_back_to_one_paragraph() -> None:
    ast = prose.parse_markdown("\n\n".join("a" for _ in range(prose.MAX_NODES + 50)))
    assert [node["type"] for node in ast["children"]] == ["paragraph"]


def test_too_much_nesting_falls_back_to_one_paragraph() -> None:
    ast = prose.parse_markdown("> " * 40 + "deep")
    assert [node["type"] for node in ast["children"]] == ["paragraph"]


def test_enrich_bundle_injects_known_prose_cells_only() -> None:
    payload = {
        "formatted_tables": {
            "report.hop_strategy": [{"text": {"text": "**strategy**"}}],
            "batch.process_notes": [
                {"note": {"text": "*note*"}},
                {"note": {"text": "—"}},
            ],
            "batch.brew_checklist": [{"note": {"text": "**check**"}}],
            "batch.boil_hops": [{"name": {"text": "Magnum"}}],
        }
    }

    prose.enrich_bundle(payload)

    assert payload["formatted_tables"]["report.hop_strategy"][0]["text"]["blocks"][
        "children"
    ][0]["type"] == "paragraph"
    assert "blocks" in payload["formatted_tables"]["batch.process_notes"][0]["note"]
    assert "blocks" not in payload["formatted_tables"]["batch.process_notes"][1]["note"]
    assert "blocks" in payload["formatted_tables"]["batch.brew_checklist"][0]["note"]
    assert "blocks" not in payload["formatted_tables"]["batch.boil_hops"][0]["name"]


def test_enrich_session_injects_step_and_overall_notes() -> None:
    session = {
        "notes": "**overall**",
        "steps": {
            "step-1": {"note": "*done*", "skip_reason": "**why**"},
            "step-2": {"note": "  "},
        },
    }

    prose.enrich_session(session)

    assert session["notes_prose"]["children"][0]["type"] == "paragraph"
    assert session["steps"]["step-1"]["note_prose"]["children"][0]["type"] == "paragraph"
    assert session["steps"]["step-1"]["skip_reason_prose"]["children"][0]["type"] == "paragraph"
    assert "note_prose" not in session["steps"]["step-2"]


def test_safe_href_is_http_and_https_only() -> None:
    assert prose.safe_href("https://example.com") == "https://example.com"
    assert prose.safe_href(" http://example.com ") == "http://example.com"
    assert prose.safe_href("javascript:alert(1)") is None
    assert prose.safe_href("//example.com") is None
    assert prose.safe_href("mailto:brew@example.com") is None
    assert prose.safe_href("https://exa mple.com") is None
    assert prose.safe_href(None) is None


def test_prose_digest_is_stable() -> None:
    assert prose.prose_digest() == prose.prose_digest()
    assert len(prose.prose_digest()) == 64
