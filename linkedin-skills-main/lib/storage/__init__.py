"""Storage abstraction package."""
from .store import StorageBackend, LocalFileStore, get_storage

__all__ = ["StorageBackend", "LocalFileStore", "get_storage"]
