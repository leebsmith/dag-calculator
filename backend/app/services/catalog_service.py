"""Catalog record business logic: validation, id assignment, and scoping."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException

from app.artifact import load_artifact, load_catalogs, validate_component
from app.repositories.catalog_repo import CatalogRepoDep, CatalogRepository
from app.schemas.catalog import CatalogItem


class CatalogValidationError(Exception):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("Invalid catalog component")
        self.errors = errors


class CatalogService:
    def __init__(self, repo: CatalogRepository) -> None:
        self._repo = repo

    @staticmethod
    def _meta(kind: str) -> dict:
        meta = load_catalogs().get(kind)
        if meta is None:
            raise HTTPException(status_code=404, detail="Unknown catalog kind")
        return meta

    def list_items(self, uid: str, kind: str) -> list[CatalogItem]:
        self._meta(kind)
        return [CatalogItem(**record) for record in self._repo.list_items(uid, kind)]

    def get_item(self, uid: str, kind: str, item_id: str) -> CatalogItem:
        self._meta(kind)
        record = self._repo.get(uid, kind, item_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Catalog item not found")
        return CatalogItem(**record)

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
