"""FastAPI application: the JSON seam between the browser and the sealed solvers.

The browser never talks to Firestore directly; it POSTs JSON to these routes and
receives JSON back. The boundary endpoints delegate to the pure service
adapters, which wrap the sealed ``app.core`` solvers.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import JSONResponse

from app.artifact import data_dir
from app.auth.deps import (
    ALLOWED_EMAILS,
    AllowedUser,
    CurrentUser,
    log_allowlist_status,
    session_payload,
)
from app.auth.throttle import RateLimitedError, RateLimitedLlmUser, RateLimitedUser
from app.schemas.batch import (
    BatchPatch,
    BatchRecord,
    DraftPayload,
    FreezePayload,
    ReportRenderPayload,
)
from app.schemas.boundary import (
    BatchSolverRequest,
    BatchSolverResponse,
    HopSolverRequest,
    HopSolverResponse,
    SolverErrorResponse,
    WaterSolverRequest,
    WaterSolverResponse,
)
from app.schemas.brew_session import (
    BrewSession,
    BrewSessionCreate,
    BrewSessionPatch,
    ObservationCreate,
    ObservationPatch,
)
from app.schemas.catalog import CatalogItem, CatalogItemCreate
from app.schemas.ids import validate_doc_id
from app.schemas.import_record import (
    CreateImportRequest,
    ImportRecord,
    UpdateImportRequest,
)
from app.services import (
    SolverServiceError,
    gemini,
    recipe_import,
    solve_batch_request,
    solve_hop_request,
    solve_water_request,
)
from app.services.batch_service import BatchConflictError, BatchServiceDep
from app.services.brew_session_service import BrewSessionServiceDep
from app.services.catalog_service import (
    CatalogServiceDep,
    CatalogValidationError,
)
from app.services.import_service import (
    DuplicateImport,
    ImportConflict,
    ImportNotFound,
    ImportPayloadError,
    ImportServiceDep,
)
from app.services.report_render import (
    RenderedReport,
    ReportSpec,
    ReportSpecError,
    parse_spec,
    report_sections,
)

app = FastAPI(title="dag-calculator backend")
logging.getLogger("app.artifact").info(
    "Resolved artifact data directory: %s", data_dir()
)
log_allowlist_status()


@app.exception_handler(RateLimitedError)
async def _rate_limited_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"code": "RATE_LIMITED", "message": "Rate limit exceeded", "details": {}},
    )


@app.get("/health")
def health() -> dict:
    """Readiness probe. Reports config presence without leaking any secrets."""
    return {"artifact": True, "allowlist_configured": bool(ALLOWED_EMAILS)}


@app.get("/session")
def get_session(user: CurrentUser) -> dict:
    """Report whether the authenticated identity is allowlisted."""
    return session_payload(user)


@app.post("/solve/batch", response_model=BatchSolverResponse)
def solve_batch(req: BatchSolverRequest, _user: RateLimitedUser) -> BatchSolverResponse | JSONResponse:
    """Resolve the batch-sparge boundary (Brent root-finding)."""
    try:
        return solve_batch_request(req)
    except SolverServiceError as exc:
        return JSONResponse(
            status_code=422,
            content=SolverErrorResponse(
                code=exc.code, message=exc.message, details=exc.details
            ).model_dump(),
        )


@app.post("/solve/water", response_model=WaterSolverResponse)
def solve_water(req: WaterSolverRequest, _user: RateLimitedUser) -> WaterSolverResponse | JSONResponse:
    """Resolve the water-chemistry boundary (linear program)."""
    try:
        return solve_water_request(req)
    except SolverServiceError as exc:
        return JSONResponse(
            status_code=422,
            content=SolverErrorResponse(
                code=exc.code, message=exc.message, details=exc.details
            ).model_dump(),
        )

@app.post("/solve/hops", response_model=HopSolverResponse)
def solve_hops(req: HopSolverRequest, _user: RateLimitedUser) -> HopSolverResponse | JSONResponse:
    """Resolve the hop-bitterness boundary (Tinseth + Arrhenius)."""
    try:
        return solve_hop_request(req)
    except SolverServiceError as exc:
        return JSONResponse(
            status_code=422,
            content=SolverErrorResponse(
                code=exc.code, message=exc.message, details=exc.details
            ).model_dump(),
        )


@app.get("/catalog/{kind}", response_model=list[CatalogItem])
def list_catalog_items(kind: str, user: AllowedUser, service: CatalogServiceDep):
    """List the caller's immutable records for one catalog kind."""
    return service.list_items(user["uid"], kind)


@app.get("/catalog/{kind}/{item_id}", response_model=CatalogItem)
def get_catalog_item(kind: str, item_id: str, user: AllowedUser, service: CatalogServiceDep):
    """Load one catalog record owned by the caller."""
    validate_doc_id(item_id)
    return service.get_item(user["uid"], kind, item_id)


@app.post("/catalog/{kind}", response_model=CatalogItem, status_code=201)
def create_catalog_item(
    kind: str,
    payload: CatalogItemCreate,
    user: AllowedUser,
    service: CatalogServiceDep,
):
    """Validate a component, assign an id, and store it immutably."""
    try:
        return service.create_item(user["uid"], kind, payload.component)
    except CatalogValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION",
                "message": str(exc),
                "details": {"errors": exc.errors},
            },
        )


@app.delete("/catalog/{kind}/{item_id}", status_code=204)
def delete_catalog_item(kind: str, item_id: str, user: AllowedUser, service: CatalogServiceDep):
    """Permanently delete one of the caller's catalog records."""
    validate_doc_id(item_id)
    service.delete_item(user["uid"], kind, item_id)


@app.get("/batches", response_model=list[BatchRecord])
def list_batches(user: AllowedUser, service: BatchServiceDep):
    """List the caller's batches (drafts and frozen)."""
    return service.list_batches(user["uid"])


@app.put("/batches/{batch_id}", response_model=BatchRecord)
def upsert_batch(
    batch_id: str,
    payload: DraftPayload,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Idempotently create-or-update a draft (client-owned id)."""
    validate_doc_id(batch_id)
    try:
        return service.upsert_draft(user["uid"], batch_id, payload)
    except BatchConflictError as exc:
        return JSONResponse(
            status_code=409,
            content={
                "code": "CONFLICT",
                "message": str(exc),
                "details": {"reason": exc.reason, "current": exc.current.model_dump()},
            },
        )


@app.patch("/batches/{batch_id}", response_model=BatchRecord)
def patch_batch(
    batch_id: str,
    payload: BatchPatch,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Rename a batch and/or move it to trash (partial metadata update)."""
    validate_doc_id(batch_id)
    if payload.name is not None:
        service.rename_batch(user["uid"], batch_id, payload.name)
    if payload.trashed is not None:
        service.set_trashed(user["uid"], batch_id, payload.trashed)
    return service.get_batch(user["uid"], batch_id)


@app.delete("/batches/{batch_id}", status_code=204)
def delete_batch(
    batch_id: str,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Permanently delete a batch owned by the caller."""
    validate_doc_id(batch_id)
    service.delete_batch(user["uid"], batch_id)


@app.post("/batches/{batch_id}/freeze", response_model=BatchRecord, status_code=201)
def freeze_batch(
    batch_id: str,
    payload: FreezePayload,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Snapshot a draft's full valuation into an immutable frozen batch."""
    validate_doc_id(batch_id)
    return service.freeze_batch(user["uid"], batch_id, payload)


@app.get("/batches/{batch_id}/report-bundle")
def get_report_bundle(
    batch_id: str,
    user: AllowedUser,
    service: BatchServiceDep,
) -> dict:
    """Download the immutable bundle written beside a frozen batch."""
    validate_doc_id(batch_id)
    return service.report_bundle(user["uid"], batch_id)


@app.post("/batches/{batch_id}/report-bundle")
def preview_report_bundle(
    batch_id: str,
    payload: FreezePayload,
    user: AllowedUser,
    service: BatchServiceDep,
) -> dict:
    """Assemble a draft's bundle for download without freezing the batch."""
    validate_doc_id(batch_id)
    return service.preview_report_bundle(user["uid"], batch_id, payload)


def _report_spec(
    *, doc_kind: str, fmt: str, sections: str, paper: str, page: int
) -> ReportSpec:
    try:
        return parse_spec(
            doc_kind=doc_kind, fmt=fmt, sections=sections, paper=paper, page=page
        )
    except ReportSpecError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _report_response(rendered: RenderedReport) -> Response:
    headers = {
        "Content-Length": str(len(rendered.data)),
        "X-Report-Sections": ",".join(rendered.sections),
        "X-Report-Pages": str(rendered.pages),
    }
    if rendered.key is not None:
        headers["ETag"] = f'"{rendered.key}"'
    return Response(
        content=rendered.data, media_type=rendered.media_type, headers=headers
    )


@app.get(
    "/report/sections",
    tags=["report"],
    summary="List the registered report sections",
)
def list_report_sections(user: AllowedUser) -> dict:
    """The sections a report can be assembled from, in canonical order."""
    return {"sections": report_sections()}


@app.get(
    "/batches/{batch_id}/report",
    tags=["report"],
    summary="Render a frozen batch's report",
    response_class=Response,
    responses={
        200: {
            "description": "The rendered report",
            "content": {"application/pdf": {}, "image/png": {}},
        },
        404: {"description": "Batch not found"},
        409: {"description": "Draft batch, or a frozen batch without a stored bundle"},
        422: {"description": "Unknown section, bad spec value, or an empty selection"},
        503: {"description": "Typst is missing or not the pinned version"},
    },
)
def get_report(
    batch_id: str,
    user: AllowedUser,
    service: BatchServiceDep,
    doc_kind: str = "recipe",
    sections: str = "",
    paper: str = "auto",
    page: int = 1,
    fmt: str = Query("pdf", alias="format"),
) -> Response:
    """Render the stored bundle of a frozen batch."""
    validate_doc_id(batch_id)
    spec = _report_spec(
        doc_kind=doc_kind, fmt=fmt, sections=sections, paper=paper, page=page
    )
    return _report_response(service.render_report(user["uid"], batch_id, spec))


@app.post(
    "/batches/{batch_id}/report",
    tags=["report"],
    summary="Render a draft's posted bundle",
    response_class=Response,
    responses={
        200: {
            "description": "The rendered report",
            "content": {"application/pdf": {}, "image/png": {}},
        },
        404: {"description": "Batch not found"},
        409: {"description": "The batch is frozen; render its stored bundle instead"},
        422: {"description": "Rejected bundle, or a bad spec value"},
        503: {"description": "Typst is missing or not the pinned version"},
    },
)
def preview_report(
    batch_id: str,
    payload: ReportRenderPayload,
    user: AllowedUser,
    service: BatchServiceDep,
    doc_kind: str = "recipe",
    sections: str = "",
    paper: str = "auto",
    page: int = 1,
    fmt: str = Query("pdf", alias="format"),
) -> Response:
    """Render a draft's posted bundle without persisting it."""
    validate_doc_id(batch_id)
    spec = _report_spec(
        doc_kind=doc_kind, fmt=fmt, sections=sections, paper=paper, page=page
    )
    return _report_response(
        service.render_preview(user["uid"], batch_id, payload.bundle, spec)
    )


# --- Recipe imports ---------------------------------------------------------


def _import_error(status: int, code: str, message: str, details: dict | None = None):
    return JSONResponse(
        status_code=status,
        content={"code": code, "message": message, "details": details or {}},
    )


@app.post("/imports", response_model=ImportRecord, status_code=201)
def create_import(
    request: CreateImportRequest,
    user: RateLimitedLlmUser,
    service: ImportServiceDep,
):
    """Transcribe one uploaded document into an import record."""
    try:
        return service.create(user["uid"], request)
    except DuplicateImport as exc:
        return _import_error(
            409,
            "IMPORT_DUPLICATE",
            "this document has already been imported",
            {"import_id": exc.import_id},
        )
    except ImportPayloadError as exc:
        return _import_error(422, "IMPORT_PAYLOAD", str(exc))
    except recipe_import.AmbiguousDocument as exc:
        return _import_error(
            422,
            "IMPORT_AMBIGUOUS",
            str(exc),
            {"titles": exc.titles},
        )
    except recipe_import.NoRecipeFound as exc:
        return _import_error(422, "IMPORT_NO_RECIPE", str(exc))
    except recipe_import.ExtractionContractError as exc:
        return _import_error(422, "IMPORT_CONTRACT", str(exc))
    except gemini.GeminiUnavailable as exc:
        return _import_error(503, "IMPORT_NOT_CONFIGURED", str(exc))
    except gemini.GeminiError as exc:
        return _import_error(502, "IMPORT_UPSTREAM_FAILED", str(exc))


@app.get("/imports", response_model=list[ImportRecord])
def list_imports(user: AllowedUser, service: ImportServiceDep):
    """List the caller's import records, newest first."""
    return service.list(user["uid"])


@app.get("/imports/{import_id}", response_model=ImportRecord)
def get_import(import_id: str, user: AllowedUser, service: ImportServiceDep):
    """Open one import record (resume)."""
    validate_doc_id(import_id)
    try:
        return service.get(user["uid"], import_id)
    except ImportNotFound:
        raise HTTPException(status_code=404, detail="Import not found") from None


@app.patch("/imports/{import_id}", response_model=ImportRecord)
def patch_import(
    import_id: str,
    request: UpdateImportRequest,
    user: AllowedUser,
    service: ImportServiceDep,
):
    """Update the identity, ledger or status of an uncommitted record."""
    validate_doc_id(import_id)
    try:
        return service.update(user["uid"], import_id, request)
    except ImportNotFound:
        raise HTTPException(status_code=404, detail="Import not found") from None
    except ImportConflict as exc:
        return _import_error(409, "IMPORT_CONFLICT", str(exc), {"reason": exc.reason})


@app.delete("/imports/{import_id}", status_code=204)
def delete_import(import_id: str, user: AllowedUser, service: ImportServiceDep):
    """Delete an uncommitted record. A committed one is a batch's audit trail."""
    validate_doc_id(import_id)
    try:
        service.delete(user["uid"], import_id)
    except ImportNotFound:
        raise HTTPException(status_code=404, detail="Import not found") from None
    except ImportConflict as exc:
        return _import_error(409, "IMPORT_CONFLICT", str(exc), {"reason": exc.reason})


@app.get("/brew-sessions", response_model=list[BrewSession])
def list_brew_sessions(
    user: AllowedUser,
    service: BrewSessionServiceDep,
    batch_id: str | None = Query(default=None),
):
    """List the caller's brew sessions, optionally for one frozen batch."""
    return service.list_sessions(user["uid"], batch_id)


@app.post("/brew-sessions", response_model=BrewSession, status_code=201)
def create_brew_session(
    payload: BrewSessionCreate,
    user: AllowedUser,
    service: BrewSessionServiceDep,
):
    """Create an execution log from a frozen batch and its checklist snapshot."""
    validate_doc_id(payload.batch_id)
    return service.create_session(user["uid"], payload)


@app.get("/brew-sessions/{session_id}/report")
def get_brew_session_report(
    session_id: str,
    user: AllowedUser,
    service: BrewSessionServiceDep,
    paper: str = Query(default="a4"),
):
    """Render the Brew Sheet for a session."""
    validate_doc_id(session_id)
    rendered = service.render_session_report(user["uid"], session_id, paper)
    return Response(
        content=rendered.data,
        media_type=rendered.media_type,
        headers={
            "Content-Disposition": f'inline; filename="brew-session-{session_id}.pdf"'
        },
    )


@app.get("/brew-sessions/{session_id}", response_model=BrewSession)
def get_brew_session(session_id: str, user: AllowedUser, service: BrewSessionServiceDep):
    """Load one brew session owned by the caller."""
    validate_doc_id(session_id)
    return service.get_session(user["uid"], session_id)


@app.patch("/brew-sessions/{session_id}", response_model=BrewSession)
def patch_brew_session(
    session_id: str,
    payload: BrewSessionPatch,
    user: AllowedUser,
    service: BrewSessionServiceDep,
):
    """Update status, steps or notes on an open session."""
    validate_doc_id(session_id)
    return service.patch_session(user["uid"], session_id, payload)


@app.post("/brew-sessions/{session_id}/observations", response_model=BrewSession)
def add_brew_observation(
    session_id: str,
    payload: ObservationCreate,
    user: AllowedUser,
    service: BrewSessionServiceDep,
):
    """Append one observation to an open session."""
    validate_doc_id(session_id)
    return service.add_observation(user["uid"], session_id, payload)


@app.patch("/brew-sessions/{session_id}/observations/{observation_id}", response_model=BrewSession)
def patch_brew_observation(
    session_id: str,
    observation_id: str,
    payload: ObservationPatch,
    user: AllowedUser,
    service: BrewSessionServiceDep,
):
    """Correct, annotate or void one observation while the session is open."""
    validate_doc_id(session_id)
    validate_doc_id(observation_id)
    return service.patch_observation(user["uid"], session_id, observation_id, payload)


@app.post("/brew-sessions/{session_id}/finalize", response_model=BrewSession)
def finalize_brew_session(
    session_id: str, user: AllowedUser, service: BrewSessionServiceDep
):
    """Seal a session; later changes are append-only corrections."""
    validate_doc_id(session_id)
    return service.finalize_session(user["uid"], session_id)


@app.get("/batches/{batch_id}", response_model=BatchRecord)
def get_batch(
    batch_id: str,
    user: AllowedUser,
    service: BatchServiceDep,
):
    """Load a batch (draft or frozen) owned by the caller."""
    validate_doc_id(batch_id)
    return service.get_batch(user["uid"], batch_id)
