"""DeepAgents research graph, served by `agentseek-api dev`.

This module is pure deepagents + LangChain — no agentseek dependency. It
mirrors the upstream ``langchain-ai/deepagents/examples/deep_research/agent.py``
with these differences:
- ``init_chat_model`` is called with explicit ``model_provider=...`` so the
  generated app can target OpenAI, Anthropic, or Gemini from the same `.env`.
- The orchestrator and sub-agent constants are wired to cookiecutter
  variables so they can be tuned at scaffold time.
"""

from __future__ import annotations

import os
import warnings
from datetime import datetime

from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain.agents.middleware import TodoListMiddleware
from langchain.chat_models import init_chat_model
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.base import BaseStore
from langgraph.types import Checkpointer

from aicopilot.prompts import (
    RESEARCH_WORKFLOW_INSTRUCTIONS,
    RESEARCHER_INSTRUCTIONS,
    SUBAGENT_DELEGATION_INSTRUCTIONS,
)
from aicopilot.storage import build_backend
from aicopilot.task_guard import SubagentTimeoutMiddleware
from aicopilot.tools import tavily_search, think_tool

load_dotenv()

SUPPORTED_MODEL_PROVIDERS = {
    "openai": "openai",
    "anthropic": "anthropic",
    "google": "google_genai",
    "google_genai": "google_genai",
    "gemini": "google_genai",
}


def _nonempty_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _normalize_provider(provider: str) -> str:
    normalized = provider.strip().replace("-", "_").lower()
    if normalized in SUPPORTED_MODEL_PROVIDERS:
        return SUPPORTED_MODEL_PROVIDERS[normalized]
    supported = ", ".join(sorted({"openai", "anthropic", "google_genai"}))
    raise ValueError(
        f"Unsupported AGENTSEEK_MODEL_PROVIDER={provider!r}. "
        f"Expected one of: {supported}."
    )


def _split_prefixed_model(model_name: str) -> tuple[str | None, str]:
    if ":" not in model_name:
        return None, model_name
    provider_candidate, bare_model = model_name.split(":", maxsplit=1)
    try:
        normalized_provider = _normalize_provider(provider_candidate)
    except ValueError:
        return None, model_name
    return normalized_provider, bare_model


DEFAULT_MODEL_RAW = (
    os.getenv("AGENTSEEK_MODEL")
    or os.getenv("DEEPAGENTS_MODEL")
    or os.getenv("BUB_MODEL")
    or "deepseek-v4-flash"
)
DEFAULT_MODEL_PROVIDER_RAW = os.getenv("AGENTSEEK_MODEL_PROVIDER")
DEFAULT_MODEL_PROVIDER_DEFAULT = "openai"

prefixed_model_provider, DEFAULT_MODEL = _split_prefixed_model(DEFAULT_MODEL_RAW)
if DEFAULT_MODEL_PROVIDER_RAW:
    MODEL_PROVIDER = _normalize_provider(DEFAULT_MODEL_PROVIDER_RAW)
    if prefixed_model_provider and prefixed_model_provider != MODEL_PROVIDER:
        raise ValueError(
            "AGENTSEEK_MODEL provider prefix does not match AGENTSEEK_MODEL_PROVIDER: "
            f"{DEFAULT_MODEL_RAW!r} vs {DEFAULT_MODEL_PROVIDER_RAW!r}."
        )
else:
    MODEL_PROVIDER = prefixed_model_provider or _normalize_provider(DEFAULT_MODEL_PROVIDER_DEFAULT)

# Some OpenAI-compatible gateways can pause for longer than LangChain OpenAI's
# default 120s chunk gap while streaming a large tool-call payload.
_stream_chunk_timeout_env = os.getenv("LANGCHAIN_OPENAI_STREAM_CHUNK_TIMEOUT_S")
STREAM_CHUNK_TIMEOUT_S: float | None = 300.0
if _stream_chunk_timeout_env not in (None, ""):
    try:
        _parsed_timeout = float(_stream_chunk_timeout_env)
    except ValueError:
        warnings.warn(
            "Ignoring invalid LANGCHAIN_OPENAI_STREAM_CHUNK_TIMEOUT_S value; "
            "using the default 300s timeout instead.",
            stacklevel=2,
        )
    else:
        STREAM_CHUNK_TIMEOUT_S = None if _parsed_timeout <= 0 else _parsed_timeout

MAX_CONCURRENT_RESEARCH_UNITS = 8
MAX_RESEARCHER_ITERATIONS = 5
SUBAGENT_TIMEOUT_S = 600.0
_subagent_timeout_env = os.getenv("AICOPILOT_SUBAGENT_TIMEOUT_S")
if _subagent_timeout_env not in (None, ""):
    try:
        SUBAGENT_TIMEOUT_S = float(_subagent_timeout_env)
        if not 0 < SUBAGENT_TIMEOUT_S < float("inf"):
            raise ValueError("timeout must be positive and finite")
    except ValueError:
        warnings.warn(
            "Ignoring invalid AICOPILOT_SUBAGENT_TIMEOUT_S; using 600s.",
            stacklevel=2,
        )
        SUBAGENT_TIMEOUT_S = 600.0

current_date = datetime.now().strftime("%Y-%m-%d")

INSTRUCTIONS = (
    RESEARCH_WORKFLOW_INSTRUCTIONS
    + "\n\n"
    + "=" * 80
    + "\n\n"
    + SUBAGENT_DELEGATION_INSTRUCTIONS.format(
        max_concurrent_research_units=MAX_CONCURRENT_RESEARCH_UNITS,
        max_researcher_iterations=MAX_RESEARCHER_ITERATIONS,
    )
)

research_sub_agent = {
    "name": "research-agent",
    "description": (
        "Delegate research to the sub-agent researcher. "
        "Only give this researcher one topic at a time."
    ),
    "system_prompt": RESEARCHER_INSTRUCTIONS.format(date=current_date),
    "tools": [tavily_search, think_tool],
}

MODEL_INIT_KWARGS: dict[str, object] = {
    "model": DEFAULT_MODEL,
    "model_provider": MODEL_PROVIDER,
}
if MODEL_PROVIDER == "openai":
    if _nonempty_env("OPENAI_API_KEY"):
        MODEL_INIT_KWARGS["api_key"] = _nonempty_env("OPENAI_API_KEY")
    if _nonempty_env("OPENAI_API_BASE"):
        MODEL_INIT_KWARGS["base_url"] = _nonempty_env("OPENAI_API_BASE")
    MODEL_INIT_KWARGS["stream_chunk_timeout"] = STREAM_CHUNK_TIMEOUT_S
elif MODEL_PROVIDER == "anthropic":
    if _nonempty_env("ANTHROPIC_API_KEY"):
        MODEL_INIT_KWARGS["api_key"] = _nonempty_env("ANTHROPIC_API_KEY")
    if _nonempty_env("ANTHROPIC_API_URL"):
        MODEL_INIT_KWARGS["base_url"] = _nonempty_env("ANTHROPIC_API_URL")
elif MODEL_PROVIDER == "google_genai":
    if _nonempty_env("GOOGLE_API_KEY"):
        MODEL_INIT_KWARGS["api_key"] = _nonempty_env("GOOGLE_API_KEY")
    if _nonempty_env("GOOGLE_API_BASE"):
        MODEL_INIT_KWARGS["base_url"] = _nonempty_env("GOOGLE_API_BASE")

# Module-level on purpose, unlike `build_backend()` inside the factory below.
# Model construction is expensive and needs provider credentials, so it is done
# once at import time; the backend, by contrast, has to be rebuilt per call
# because the serving layer scopes the store to the requesting user. Moving this
# into `build_graph` would re-init the client on every run — do not.
model = init_chat_model(**MODEL_INIT_KWARGS)

MEMORY_SOURCES = ["/memories/AGENTS.md"]
"""Long-term memory paths, read from the storage backend into every run's
system prompt. Without a `memory=` argument deepagents installs no
`MemoryMiddleware`, and the `/memories/` route would have no writer."""


def build_graph(
    checkpointer: Checkpointer | None = None,
    *,
    store: BaseStore | None = None,
) -> CompiledStateGraph:
    """Build the research graph.

    Exported as a factory rather than a module-level compiled graph on purpose.
    The serving layer constructs a per-user scoped persistent store on every
    run and passes it as `store=`, but only to callables: `_coerce_graph` in
    `agentseek_api/services/langgraph_service.py` returns an already-compiled
    `Pregel` unchanged, silently dropping the store. See
    `docs/superpowers/specs/2026-09-19-pluggable-storage-design.md` §1.

    `checkpointer` is positional-or-keyword on purpose: the serving layer calls
    `build_graph(checkpointer, store=store)` positionally from
    `agentseek_api/services/run_executor.py`. Making it keyword-only breaks that
    call site.
    """
    return create_deep_agent(
        model=model,
        tools=[tavily_search, think_tool],
        system_prompt=INSTRUCTIONS,
        subagents=[research_sub_agent],
        middleware=[TodoListMiddleware(), SubagentTimeoutMiddleware(SUBAGENT_TIMEOUT_S)],
        backend=build_backend(),
        memory=MEMORY_SOURCES,
        checkpointer=checkpointer,
        store=store,
    )
