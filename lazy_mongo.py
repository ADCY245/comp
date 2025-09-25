"""Thread- and fork-safe lazy initialiser for the global MongoDB client.
Each gunicorn worker will call ``get_db`` the first time it needs the
connection; the underlying MongoClient is created exactly once per
process (thanks to functools.lru_cache).
"""
from functools import lru_cache
import os
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError

DB_NAME = os.getenv("DB_NAME", "moneda_db")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")


@lru_cache(maxsize=1)
def _get_client() -> MongoClient:  # type: ignore[name-defined]
    """Create and cache a MongoClient with sensible timeouts."""
    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        maxPoolSize=20,
    )
    # Perform a quick ping so we fail fast if the DB is unreachable
    try:
        client.admin.command("ping")
    except ServerSelectionTimeoutError as exc:
        # Clear the cache so a subsequent call can retry
        _get_client.cache_clear()  # type: ignore[attr-defined]
        raise RuntimeError(f"MongoDB not reachable: {exc}") from exc
    return client


def get_db():
    """Return the lazily-initialised database object."""
    client = _get_client()
    return client[DB_NAME]
