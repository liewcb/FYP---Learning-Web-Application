"""FastAPI dependencies for private persistence infrastructure."""

from functools import lru_cache

from fastapi import HTTPException, status

from .supabase import SupabaseNotConfiguredError, SupabasePersistence


@lru_cache(maxsize=1)
def get_supabase_persistence() -> SupabasePersistence:
    try:
        return SupabasePersistence()
    except SupabaseNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error

