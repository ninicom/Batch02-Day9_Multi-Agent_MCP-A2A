import os
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

A2A_API_KEY = os.getenv("A2A_API_KEY", "A2A-SECRET-KEY")

# Paths that do not require an API Key
EXEMPT_PATHS = [
    "/dashboard", 
    "/ws/traces", 
    "/trace", 
    "/health",
    "/assets",
    "/favicon.svg",
    "/favicon.ico",
    "/api/chat"
]

async def api_key_middleware(request: Request, call_next):
    """Middleware to enforce API key authentication on A2A endpoints."""
    # Allow root/healthcheck paths if necessary, but here we protect everything
    if any(request.url.path.startswith(p) for p in EXEMPT_PATHS):
        return await call_next(request)

    key = request.headers.get("X-API-Key")
    if key != A2A_API_KEY:
        logger.warning("Unauthorized access attempt to %s", request.url.path)
        return JSONResponse(
            status_code=401, 
            content={"detail": "Unauthorized: Invalid or missing API Key"}
        )
    return await call_next(request)
