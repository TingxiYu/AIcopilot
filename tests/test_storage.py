"""The route table is the pluggability contract: prefix in, backend out."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from deepagents.backends import StateBackend, StoreBackend

from aicopilot.projection import ProjectedComposite
from aicopilot.storage import (
    EPHEMERAL,
    MIRROR_PREFIXES,
    PER_THREAD,
    SHARED,
    MissingThreadIdError,
    build_backend,
    namespace_for,
)


def _runtime(thread_id: str | None) -> SimpleNamespace:
    return SimpleNamespace(execution_info=SimpleNamespace(thread_id=thread_id))


def test_artifacts_and_memories_route_to_the_persistent_store():
    routes = dict(build_backend().sorted_routes)

    assert isinstance(routes["/artifacts/"], StoreBackend)
    assert isinstance(routes["/memories/"], StoreBackend)


def test_large_tool_results_stay_ephemeral():
    routes = dict(build_backend().sorted_routes)

    assert isinstance(routes["/large_tool_results/"], StateBackend)


def test_unmatched_paths_stay_ephemeral():
    """Scratch must not accumulate in the database forever."""
    assert isinstance(build_backend().default, StateBackend)


def test_the_assembled_backend_is_the_projected_composite():
    assert isinstance(build_backend(), ProjectedComposite)


def test_only_artifacts_are_mirrored():
    assert MIRROR_PREFIXES == ("/artifacts/",)


def test_memory_namespace_is_shared_across_threads():
    """Same namespace for two different threads — that is what makes memory
    survive a new conversation."""
    factory = namespace_for(SHARED)

    assert factory(_runtime("t1")) == factory(_runtime("t2")) == ("memories",)


def test_thread_namespace_differs_per_thread():
    factory = namespace_for(PER_THREAD)

    assert factory(_runtime("t1")) == ("threads", "t1")
    assert factory(_runtime("t2")) == ("threads", "t2")


def test_missing_thread_id_raises_rather_than_sharing_a_namespace():
    """Falling back to a shared namespace would let two conversations
    overwrite each other's final_report.md."""
    with pytest.raises(MissingThreadIdError):
        namespace_for(PER_THREAD)(_runtime(None))


def test_missing_execution_info_raises_rather_than_crashing():
    with pytest.raises(MissingThreadIdError):
        namespace_for(PER_THREAD)(SimpleNamespace(execution_info=None))


def test_ephemeral_has_no_namespace():
    with pytest.raises(ValueError):
        namespace_for(EPHEMERAL)
