"""The mirror layer: artifacts reach graph state, memories do not."""

from __future__ import annotations

import asyncio

from aicopilot.projection import ProjectedComposite
from tests.fakes import RecordingBackend


def _build(
    *,
    artifacts: RecordingBackend,
    memories: RecordingBackend,
    ephemeral: RecordingBackend,
    mirror: RecordingBackend,
) -> ProjectedComposite:
    return ProjectedComposite(
        default=ephemeral,
        routes={"/artifacts/": artifacts, "/memories/": memories},
        mirror_prefixes=("/artifacts/",),
        mirror_backend=mirror,
    )


def test_artifact_write_is_mirrored_with_the_full_path():
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    backend = _build(artifacts=artifacts, memories=memories, ephemeral=ephemeral, mirror=mirror)

    result = backend.write("/artifacts/final_report.md", "# report")

    assert result.error is None
    assert result.path == "/artifacts/final_report.md"
    # Routed backend sees the prefix stripped, then re-anchored at its own
    # root -- `/final_report.md`, not `/artifacts/final_report.md`.
    assert artifacts.files == {"/final_report.md": "# report"}
    # ...but the mirror keeps the full path, which is what the UI renders.
    assert mirror.files == {"/artifacts/final_report.md": "# report"}


def test_memory_write_is_not_mirrored():
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    backend = _build(artifacts=artifacts, memories=memories, ephemeral=ephemeral, mirror=mirror)

    backend.write("/memories/AGENTS.md", "remember this")

    assert memories.files == {"/AGENTS.md": "remember this"}
    assert mirror.files == {}


def test_ephemeral_write_is_not_mirrored():
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    backend = _build(artifacts=artifacts, memories=memories, ephemeral=ephemeral, mirror=mirror)

    backend.write("/large_tool_results/abc", "1.1 MB of plumbing")

    assert ephemeral.files == {"/large_tool_results/abc": "1.1 MB of plumbing"}
    assert mirror.files == {}


def test_failed_write_is_not_mirrored():
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    failing = RecordingBackend(fail_writes=True)
    backend = ProjectedComposite(
        default=ephemeral,
        routes={"/artifacts/": failing, "/memories/": memories},
        mirror_prefixes=("/artifacts/",),
        mirror_backend=mirror,
    )

    result = backend.write("/artifacts/final_report.md", "# report")

    assert result.error == "write refused"
    assert mirror.files == {}


def test_edit_mirrors_the_post_edit_content():
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    # The file must be LONGER than old_string/new_string, otherwise the
    # post-edit content *is* new_string and an implementation that mirrors the
    # argument instead of reading back would pass this test unchanged.
    artifacts.files["/final_report.md"] = "intro\nold draft\noutro\n"
    backend = _build(artifacts=artifacts, memories=memories, ephemeral=ephemeral, mirror=mirror)

    backend.edit("/artifacts/final_report.md", "old draft", "final draft")

    # Not the pre-edit text, and not the old_string/new_string arguments: the
    # surrounding text proves the mirror was fed the whole file.
    assert mirror.files == {"/artifacts/final_report.md": "intro\nfinal draft\noutro\n"}


def test_delete_removes_the_mirror():
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    artifacts.files["/stale.md"] = "gone soon"
    mirror.files["/artifacts/stale.md"] = "gone soon"
    backend = _build(artifacts=artifacts, memories=memories, ephemeral=ephemeral, mirror=mirror)

    backend.delete("/artifacts/stale.md")

    assert mirror.files == {}


def test_awrite_is_mirrored_too():
    """The async path must not bypass the mirror.

    `CompositeBackend` overrides `awrite` separately and it does NOT call
    `write`, so overriding only the sync method would silently drop this.
    `asyncio.run` rather than pytest-asyncio: one async test does not justify
    another dependency and its configuration.
    """
    artifacts, memories, ephemeral, mirror = (RecordingBackend() for _ in range(4))
    backend = _build(artifacts=artifacts, memories=memories, ephemeral=ephemeral, mirror=mirror)

    asyncio.run(backend.awrite("/artifacts/final_report.md", "# report"))

    assert mirror.files == {"/artifacts/final_report.md": "# report"}
