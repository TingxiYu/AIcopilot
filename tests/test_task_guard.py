"""A stalled research subagent must return control to the coordinator."""

import asyncio
from types import SimpleNamespace

from langchain_core.messages import ToolMessage

from aicopilot.task_guard import SubagentTimeoutMiddleware


def request(name="task"):
    return SimpleNamespace(tool_call={"id": "task-1", "name": name, "args": {}})


def test_task_timeout_returns_error_tool_message():
    guard = SubagentTimeoutMiddleware(timeout_s=0.01)

    async def stalled(_request):
        await asyncio.sleep(1)

    result = asyncio.run(guard.awrap_tool_call(request(), stalled))
    assert isinstance(result, ToolMessage)
    assert result.tool_call_id == "task-1"
    assert result.status == "error"
    assert "超时" in result.content
    assert "已有" in result.content


def test_task_exception_returns_error_without_leaking_details():
    guard = SubagentTimeoutMiddleware(timeout_s=1)

    async def broken(_request):
        raise RuntimeError("private token 123")

    result = asyncio.run(guard.awrap_tool_call(request(), broken))
    assert result.status == "error"
    assert "private token" not in result.content
    assert "RuntimeError" in result.content


def test_other_tools_and_successful_task_pass_through():
    guard = SubagentTimeoutMiddleware(timeout_s=1)

    async def success(_request):
        return ToolMessage("findings", tool_call_id="task-1")

    expected = asyncio.run(success(request()))
    assert asyncio.run(guard.awrap_tool_call(request(), success)) == expected
    assert asyncio.run(guard.awrap_tool_call(request("write_todos"), success)) == expected


def test_parallel_sibling_can_succeed_when_one_task_times_out():
    guard = SubagentTimeoutMiddleware(timeout_s=0.01)

    async def stalled(_request):
        await asyncio.sleep(1)

    async def succeeded(_request):
        return ToolMessage("verified findings", tool_call_id="task-1")

    async def run_both():
        return await asyncio.gather(
            guard.awrap_tool_call(request(), stalled),
            guard.awrap_tool_call(request(), succeeded),
        )

    failed, passed = asyncio.run(run_both())
    assert failed.status == "error"
    assert passed.content == "verified findings"
    assert passed.status == "success"
