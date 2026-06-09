import httpx
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

async def push_trace(source: str, target: str, action: str, message: str, trace_id: Optional[str] = None):
    """Fire and forget trace push to the Registry Web Dashboard."""
    payload = {
        "source": source,
        "target": target,
        "action": action,
        "message": message,
        "trace_id": trace_id or "unknown"
    }
    
    # We don't want to block the main agent flow, so we fire and forget
    async def _send():
        import os
        api_key = os.getenv("A2A_API_KEY", "A2A-SECRET-KEY")
        try:
            async with httpx.AsyncClient(timeout=2.0, headers={"X-API-Key": api_key}) as client:
                await client.post("http://localhost:10000/trace", json=payload)
        except Exception as e:
            # Silently ignore tracer errors to not break the system
            pass

    asyncio.create_task(_send())
