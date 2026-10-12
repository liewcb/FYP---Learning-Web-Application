"""Authentication boundary for trusted server-to-server AI operations."""

import os
import secrets
from typing import Annotated

from fastapi import Header, HTTPException, status


def require_internal_token(
    x_internal_token: Annotated[
        str | None,
        Header(alias="X-Internal-Token"),
    ] = None,
) -> None:
    """Reject persistence calls that did not come from the trusted web server."""

    expected_token = os.getenv("AI_SERVICE_INTERNAL_TOKEN", "")
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI_SERVICE_INTERNAL_TOKEN is not configured.",
        )
    if not x_internal_token or not secrets.compare_digest(
        x_internal_token, expected_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service token.",
        )
