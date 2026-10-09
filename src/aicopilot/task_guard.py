"""Bound `task` subagent calls so the coordinator can finish with partial evidence."""

from __future__ import annotations

import asyncio
import math
from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import ToolCallRequest
from langchain_core.messages import ToolMessage
from langgraph.errors import GraphBubbleUp
from langgraph.types import Command


class SubagentTimeoutMiddleware(AgentMiddleware):
    """Convert a stalled or failed `task` call into a visible error tool result."""

    def __init__(self, timeout_s: float = 600.0) -> None:
        super().__init__()
        if not math.isfinite(timeout_s) or timeout_s <= 0:
            raise ValueError("Subagent timeout must be a positive finite number")
        self.timeout_s = timeout_s

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        if request.tool_call["name"] != "task":
            return await handler(request)

        try:
            return await asyncio.wait_for(handler(request), timeout=self.timeout_s)
        except GraphBubbleUp:
            raise
        except TimeoutError:
            detail = f"子任务超时（{self.timeout_s:g} 秒）"
        except Exception as exc:
            # Never put exception details in the model or browser: providers
            # may include request URLs, credentials, or private tool inputs.
            detail = f"子任务失败（{type(exc).__name__}）"

        return ToolMessage(
            content=(
                f"{detail}。请主 Agent 使用已有的其他子任务结果继续；"
                "如证据不足，在报告中明确标注未完成部分与不确定性，不要无限等待或编造结果。"
            ),
            tool_call_id=request.tool_call["id"],
            status="error",
        )
