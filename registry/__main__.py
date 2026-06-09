"""Registry Service — port 10000.

A lightweight FastAPI service that allows agents to self-register and
clients to discover agent endpoints by task name.

Endpoints:
  POST /register          — register an agent
  GET  /discover/{task}   — find an agent that handles the given task
  GET  /agents            — list all registered agents
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [registry] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="A2A Registry", version="1.0.0")

from common.auth import api_key_middleware
app.middleware("http")(api_key_middleware)

# In-memory store: agent_name -> agent info dict
agents: dict[str, dict[str, Any]] = {}


class AgentRegistration(BaseModel):
    agent_name: str
    version: str = "1.0"
    description: str = ""
    tasks: list[str] = []
    endpoint: str
    tags: list[str] = []


@app.post("/register", status_code=200)
async def register(registration: AgentRegistration) -> dict:
    """Register or update an agent."""
    entry = registration.model_dump()
    entry["registered_at"] = datetime.now(timezone.utc).isoformat()
    agents[registration.agent_name] = entry
    logger.info(
        "Registered agent '%s' at %s (tasks=%s)",
        registration.agent_name,
        registration.endpoint,
        registration.tasks,
    )
    return {"status": "ok", "agent_name": registration.agent_name}


@app.get("/discover/{task}")
async def discover(task: str) -> dict:
    """Return the first agent whose task list contains *task*."""
    for agent in agents.values():
        if task in agent.get("tasks", []):
            logger.info("Discovered agent '%s' for task '%s'", agent["agent_name"], task)
            return {
                "agent_name": agent["agent_name"],
                "endpoint": agent["endpoint"],
                "description": agent.get("description", ""),
            }
    raise HTTPException(
        status_code=404,
        detail=f"No agent found for task '{task}'",
    )


@app.get("/agents")
async def list_agents() -> dict:
    """Return all registered agents."""
    return {"agents": list(agents.values())}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "agent_count": len(agents)}

# --- Chat Endpoint (Proxy) ---
from uuid import uuid4
import httpx
import asyncio

class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest) -> dict:
    from a2a.client import A2AClient
    from a2a.types import AgentCard, Message, MessageSendParams as MSP, Part, Role, SendMessageRequest, TextPart
    from common.tracer import push_trace
    
    A2A_API_KEY = os.getenv("A2A_API_KEY", "A2A-SECRET-KEY")
    CUSTOMER_AGENT_URL = "http://localhost:10100"
    
    async with httpx.AsyncClient(timeout=120.0, headers={"X-API-Key": A2A_API_KEY}) as http_client:
        card_url = f"{CUSTOMER_AGENT_URL}/.well-known/agent.json"
        try:
            card_resp = await http_client.get(card_url)
            card_resp.raise_for_status()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not reach Customer Agent: {e}")
            
        agent_card = AgentCard.model_validate(card_resp.json())
        client = A2AClient(httpx_client=http_client, agent_card=agent_card)
        
        trace_id = str(uuid4())
        await push_trace("User", "customer-agent", "ask", req.message, trace_id)
        
        request = SendMessageRequest(
            id=str(uuid4()),
            params=MSP(message=Message(
                role=Role.user,
                parts=[Part(root=TextPart(text=req.message))],
                message_id=str(uuid4()),
                context_id=str(uuid4()),
                metadata={"trace_id": trace_id},
            )),
        )
        
        try:
            response = await client.send_message(request)
        except Exception as e:
            return {"reply": f"Error: Request failed or timed out. Detail: {e}"}
            
        result_text = ""
        if hasattr(response, "root") and hasattr(response.root, "result"):
            result = response.root.result
            if hasattr(result, "artifacts") and result.artifacts:
                for artifact in result.artifacts:
                    for part in artifact.parts:
                        p = part.root if hasattr(part, "root") else part
                        if hasattr(p, "text"):
                            result_text += p.text
            elif hasattr(result, "parts") and result.parts:
                for part in result.parts:
                    p = part.root if hasattr(part, "root") else part
                    if hasattr(p, "text"):
                        result_text += p.text
                        
        await push_trace("customer-agent", "User", "reply", result_text, trace_id)
        return {"reply": result_text or "No text response received."}

# --- Visualizer Endpoints ---

class TraceEvent(BaseModel):
    source: str
    target: str
    action: str
    message: str
    trace_id: str

active_connections: list[WebSocket] = []

@app.websocket("/ws/traces")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

@app.post("/trace")
async def receive_trace(event: TraceEvent):
    """Receive a trace event and broadcast to WS clients."""
    for connection in active_connections.copy():
        try:
            await connection.send_json(event.model_dump())
        except Exception:
            try:
                active_connections.remove(connection)
            except ValueError:
                pass
    return {"status": "ok"}

ui_dir = os.path.join(os.path.dirname(__file__), "ui_dist")
os.makedirs(ui_dir, exist_ok=True)
# Create a dummy index.html if empty so it doesn't fail
if not os.path.exists(os.path.join(ui_dir, "index.html")):
    with open(os.path.join(ui_dir, "index.html"), "w") as f:
        f.write("<html><body>Visualizer building... please refresh later.</body></html>")

app.mount("/dashboard", StaticFiles(directory=ui_dir, html=True), name="dashboard")

if __name__ == "__main__":
    logger.info("Starting Registry on port 10000")
    uvicorn.run(app, host="0.0.0.0", port=10000, log_level="info")