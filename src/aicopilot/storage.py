"""Where the agent's files live, and how to change that.

`ROUTES` is the whole pluggability contract: a path prefix maps to a target,
and the target decides which backend serves it. To add a backend, write a
class implementing `BackendProtocol` and add one row here.

Scope decisions (see the design doc):
- Artifacts persist per conversation, so two conversations cannot overwrite
  each other's `final_report.md`.
- `/memories/` is shared across a user's conversations — that is what makes it
  memory rather than a note.
- Everything else, including deepagents' multi-megabyte `/large_tool_results/`
  spills and ordinary scratch, stays in graph state and dies with the thread.
  Never make the default persistent: the store never shrinks.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from deepagents.backends import StateBackend, StoreBackend
from deepagents.backends.protocol import BackendProtocol

from aicopilot.projection import ProjectedComposite

SHARED = "shared"  # across every conversation of one user
PER_THREAD = "per_thread"  # scoped to a single conversation
EPHEMERAL = "ephemeral"  # graph state only; dies with the thread

ROUTES: tuple[tuple[str, str], ...] = (
    ("/artifacts/", PER_THREAD),
    ("/memories/", SHARED),
    ("/large_tool_results/", EPHEMERAL),
)

# Only artifacts are projected into graph state for the UI. `/memories/` is the
# model's own scratch, not a deliverable; `/large_tool_results/` is plumbing (a
# real run produced three of them, ~1.1 MB total).
MIRROR_PREFIXES: tuple[str, ...] = ("/artifacts/",)


class MissingThreadIdError(RuntimeError):
    """A per-thread path was touched outside a checkpointed run."""


def _thread_id(runtime: Any) -> str:
    info = getattr(runtime, "execution_info", None)
    thread_id = getattr(info, "thread_id", None)
    if not thread_id:
        msg = (
            "A per-thread path was accessed without a thread id. Refusing to "
            "fall back to a shared namespace: two conversations would then "
            "overwrite each other's artifacts."
        )
        raise MissingThreadIdError(msg)
    return thread_id


def namespace_for(target: str) -> Callable[[Any], tuple[str, ...]]:
    """Return the store namespace factory for a route target.

    The user dimension is not handled here: the serving layer already wraps the
    store in a per-user scoped proxy before handing it to the graph.
    """
    if target == SHARED:
        return lambda _runtime: ("memories",)
    if target == PER_THREAD:
        return lambda runtime: ("threads", _thread_id(runtime))
    msg = f"{target!r} is not store-backed, so it has no namespace."
    raise ValueError(msg)


def _make(target: str) -> BackendProtocol:
    if target == EPHEMERAL:
        return StateBackend()
    return StoreBackend(namespace=namespace_for(target))


def build_backend() -> BackendProtocol:
    """Assemble the backend for one run.

    Rebuilt on every call on purpose: the store is scoped to the requesting
    user by the serving layer, so caching a backend instance across runs would
    reuse one user's store for another's requests.
    """
    return ProjectedComposite(
        default=StateBackend(),
        routes={prefix: _make(target) for prefix, target in ROUTES},
        mirror_prefixes=MIRROR_PREFIXES,
    )
