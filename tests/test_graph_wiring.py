"""The factory shape is what lets agentseek deliver the persistent store.

`agentseek_api/services/langgraph_service.py:_coerce_graph` returns an
already-compiled `Pregel` unchanged, so a module-level compiled graph never
receives the store. Only a callable does.
"""

from __future__ import annotations

import inspect

import pytest

from aicopilot import agent as agent_module
from aicopilot.projection import ProjectedComposite
from aicopilot.task_guard import SubagentTimeoutMiddleware

# Returned by the spy so a test can prove `build_graph` passes the result
# through instead of swallowing it.
SENTINEL_GRAPH = object()


@pytest.fixture
def spied(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Capture the kwargs `build_graph` hands to `create_deep_agent`."""
    captured: dict = {}

    def spy(**kwargs):
        captured.update(kwargs)
        return SENTINEL_GRAPH

    monkeypatch.setattr(agent_module, "create_deep_agent", spy)
    return captured


def test_checkpointer_can_be_passed_positionally():
    """`run_executor.py` calls `build_graph(checkpointer, store=store)`."""
    params = inspect.signature(agent_module.build_graph).parameters

    assert params["checkpointer"].kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
    assert params["store"].kind in (
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
        inspect.Parameter.KEYWORD_ONLY,
    )


def test_build_graph_passes_the_graph_through(spied):
    assert agent_module.build_graph() is SENTINEL_GRAPH


def test_backend_is_injected(spied):
    agent_module.build_graph()

    assert isinstance(spied["backend"], ProjectedComposite)


def test_memory_is_wired(spied):
    """Without `memory=`, deepagents installs no MemoryMiddleware and
    `/memories/` becomes a route nothing ever writes to."""
    agent_module.build_graph()

    assert spied["memory"] == ["/memories/AGENTS.md"]


def test_subagent_timeout_guard_is_wired(spied):
    agent_module.build_graph()
    assert any(isinstance(item, SubagentTimeoutMiddleware) for item in spied["middleware"])


def test_store_is_forwarded(spied):
    sentinel = object()

    agent_module.build_graph(store=sentinel)

    assert spied["store"] is sentinel


def test_checkpointer_is_forwarded(spied):
    sentinel = object()

    agent_module.build_graph(sentinel)

    assert spied["checkpointer"] is sentinel
