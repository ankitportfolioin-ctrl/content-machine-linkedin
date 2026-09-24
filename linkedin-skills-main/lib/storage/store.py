"""Storage abstraction layer for LinkedIn AI Sales & Growth Copilot.

Provides a vendor-neutral storage interface so prospects, CRM pipeline records,
workflow states, and approval cards can be persisted locally or in an external store.
"""
from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional


class StorageBackend(ABC):
    """Abstract base class for all storage adapters."""

    @abstractmethod
    def save_item(self, collection: str, key: str, data: Dict[str, Any]) -> None:
        """Save or overwrite an item by key."""
        pass

    @abstractmethod
    def get_item(self, collection: str, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve an item by key."""
        pass

    @abstractmethod
    def list_items(self, collection: str) -> List[Dict[str, Any]]:
        """List all items in a collection."""
        pass

    @abstractmethod
    def delete_item(self, collection: str, key: str) -> bool:
        """Delete an item by key. Returns True if deleted."""
        pass

    @abstractmethod
    def count_items(self, collection: str) -> int:
        """Count total items in collection."""
        pass


class LocalFileStore(StorageBackend):
    """Local JSON-file based persistent storage.

    Stores collections under a configurable base directory (defaults to `.copilot_data/` or `data/`).
    Safe, atomic file writes.
    """

    def __init__(self, base_dir: Optional[str] = None):
        if not base_dir:
            base_dir = os.getenv("COPILOT_DATA_DIR")
        if not base_dir:
            # Default to workspace root / .copilot_data or repo root / .copilot_data
            workspace_root = Path(__file__).resolve().parents[3]
            if (workspace_root / ".copilot_data").exists():
                base_dir = str(workspace_root / ".copilot_data")
            else:
                repo_root = Path(__file__).resolve().parents[2]
                base_dir = str(repo_root / ".copilot_data")
        self.base_path = Path(base_dir)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _col_path(self, collection: str) -> Path:
        p = self.base_path / collection
        p.mkdir(parents=True, exist_ok=True)
        return p

    def _file_path(self, collection: str, key: str) -> Path:
        # Sanitize filename
        safe_key = "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in key)
        return self._col_path(collection) / f"{safe_key}.json"

    def save_item(self, collection: str, key: str, data: Dict[str, Any]) -> None:
        target = self._file_path(collection, key)
        temp_target = target.with_suffix(".tmp")
        payload = json.dumps(data, indent=2, ensure_ascii=False)
        temp_target.write_text(payload, encoding="utf-8")
        temp_target.replace(target)

    def get_item(self, collection: str, key: str) -> Optional[Dict[str, Any]]:
        target = self._file_path(collection, key)
        if not target.is_file():
            return None
        try:
            return json.loads(target.read_text(encoding="utf-8"))
        except Exception:
            return None

    def list_items(self, collection: str) -> List[Dict[str, Any]]:
        col_dir = self._col_path(collection)
        items: List[Dict[str, Any]] = []
        for file in sorted(col_dir.glob("*.json")):
            try:
                content = json.loads(file.read_text(encoding="utf-8"))
                items.append(content)
            except Exception:
                continue
        return items

    def delete_item(self, collection: str, key: str) -> bool:
        target = self._file_path(collection, key)
        if target.is_file():
            target.unlink()
            return True
        return False

    def count_items(self, collection: str) -> int:
        col_dir = self._col_path(collection)
        return len(list(col_dir.glob("*.json")))

    def clear_collection(self, collection: str) -> int:
        """Utility for test cleanups."""
        col_dir = self._col_path(collection)
        count = 0
        for f in col_dir.glob("*.json"):
            f.unlink()
            count += 1
        return count


# Global default instance cache
_GLOBAL_STORE: Optional[StorageBackend] = None


def get_storage(backend_type: Optional[str] = None, base_dir: Optional[str] = None) -> StorageBackend:
    """Factory helper to obtain a storage backend."""
    global _GLOBAL_STORE
    if base_dir:
        return LocalFileStore(base_dir=base_dir)
    if _GLOBAL_STORE is None:
        b_type = (backend_type or os.getenv("STORAGE_BACKEND") or "local").lower()
        if b_type in ("local", "json", "file"):
            _GLOBAL_STORE = LocalFileStore()
        else:
            # Fallback to local
            _GLOBAL_STORE = LocalFileStore()
    return _GLOBAL_STORE
