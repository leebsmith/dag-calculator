"""Catalog record business logic: validation, id assignment, and scoping."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException

from app.artifact import load_artifact, load_catalog_registry, validate_component
from app.repositories.catalog_repo import CatalogRepoDep, CatalogRepository
from app.schemas.catalog import CatalogItem


class CatalogValidationError(Exception):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("Invalid catalog component")
        self.errors = errors


def _normalize_component(kind: str, component: dict) -> dict:
    """Apply stored-record invariants that predate the current validator.

    A ranged yeast's cap is the published high. Records written before that rule
    existed can disagree; serve the corrected component without rewriting the
    stored document, so the next clone or save persists the fix.
    """
    if kind != "yeast" or not isinstance(component, dict):
        return component
    low = component.get("attenuation_low_pct")
    high = component.get("attenuation_high_pct")
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return component
    if component.get("attenuation_cap_pct") == high:
        return component
    return {**component, "attenuation_cap_pct": high}


class CatalogService:
    def __init__(self, repo: CatalogRepository) -> None:
        self._repo = repo

    @staticmethod
    def _meta(kind: str) -> dict:
        meta = load_catalog_registry().get(kind)
        if meta is None:
            raise HTTPException(status_code=404, detail="Unknown catalog kind")
        return meta

    def list_items(self, uid: str, kind: str) -> list[CatalogItem]:
        self._meta(kind)
        return [
            CatalogItem(**self._normalize(kind, record))
            for record in self._repo.list_items(uid, kind)
        ]

    def get_item(self, uid: str, kind: str, item_id: str) -> CatalogItem:
        self._meta(kind)
        record = self._repo.get(uid, kind, item_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Catalog item not found")
        return CatalogItem(**self._normalize(kind, record))

    @staticmethod
    def _normalize(kind: str, record: dict) -> dict:
        component = record.get("component")
        if not isinstance(component, dict):
            return record
        normalized = _normalize_component(kind, component)
        if normalized is component:
            return record
        return {**record, "component": normalized}

    def create_item(self, uid: str, kind: str, component: dict) -> CatalogItem:
        meta = self._meta(kind)
        errors = validate_component(kind, component)
        if errors:
            raise CatalogValidationError(errors)
        record = self._repo.create(
            uid,
            kind,
            component,
            meta["id_field"],
            load_artifact().get("schema_version", 2),
        )
        return CatalogItem(**record)

    def delete_item(self, uid: str, kind: str, item_id: str) -> None:
        self._meta(kind)
        if not self._repo.delete(uid, kind, item_id):
            raise HTTPException(status_code=404, detail="Catalog item not found")


def get_catalog_service(repo: CatalogRepoDep) -> CatalogService:
    return CatalogService(repo)


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]
