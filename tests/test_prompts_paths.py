"""Artifacts must live under /artifacts/ for the router to reach them.

Routing is by prefix. A root-level `/final_report.md` has no prefix to match,
so it would fall to the default (ephemeral) backend and stop persisting.
"""

from __future__ import annotations

import re

from aicopilot.prompts import (
    RESEARCHER_INSTRUCTIONS,
    RESEARCH_WORKFLOW_INSTRUCTIONS,
)

ALL_INSTRUCTIONS = RESEARCH_WORKFLOW_INSTRUCTIONS + "\n" + RESEARCHER_INSTRUCTIONS

ARTIFACT_FILENAMES = ("final_report.md", "research_request.md")
ARTIFACTS_PREFIX = "/artifacts/"

# Every path-like token in the instructions that names one of the artifacts,
# whatever directory it is written under. Deliberately broader than
# `/artifacts/...`: the point is to *find* the bare-root and doubled-prefix
# forms, not to assume they are gone.
#
# The leading segment is non-greedy (`+?`) on purpose. With a greedy group the
# match would slide right and re-anchor on the *inner* `/artifacts/final_report.md`
# of a doubled prefix, silently hiding exactly the case this test exists for.
ARTIFACT_PATH_PATTERN = re.compile(
    r"(?:/[\w.-]+)+?/(" + "|".join(ARTIFACT_FILENAMES) + r")"
)


def test_artifacts_are_written_under_the_artifacts_prefix():
    assert "/artifacts/final_report.md" in ALL_INSTRUCTIONS
    assert "/artifacts/research_request.md" in ALL_INSTRUCTIONS


def test_no_bare_root_level_artifact_paths_remain():
    """Every artifact path in the instructions must be *exactly* one prefix deep.

    Enumerates the paths that actually appear and asserts a property of each,
    rather than stripping the good forms and re-checking. A strip-and-check
    passes a doubled prefix (`/artifacts/artifacts/final_report.md`) after the
    strip removes the inner match; asserting on the found token does not.
    """
    found = ARTIFACT_PATH_PATTERN.findall(ALL_INSTRUCTIONS)
    assert found, "no artifact paths found in the instructions at all"

    for filename in ARTIFACT_FILENAMES:
        assert filename in found, f"expected an artifact path ending in {filename}"

    for token in ARTIFACT_PATH_PATTERN.finditer(ALL_INSTRUCTIONS):
        path = token.group(0)
        assert path.startswith(ARTIFACTS_PREFIX), (
            f"{path!r} does not start with {ARTIFACTS_PREFIX!r}; a root-level "
            "path has no prefix for the router to match and stops persisting."
        )
        # `str.count` is WRONG here: '/artifacts/artifacts/' overlaps at its
        # shared '/' so `"/artifacts/artifacts/x".count("/artifacts/") == 1`
        # and a doubled prefix would slip through. Strip the one legitimate
        # prefix and assert no prefix remains in the remainder.
        remainder = path[len(ARTIFACTS_PREFIX) :]
        assert "/" not in remainder, (
            f"{path!r} has extra path segments after {ARTIFACTS_PREFIX!r} "
            "(a doubled prefix is not what the router matches)."
        )


def test_research_prompt_requires_only_final_user_facing_answer_and_verified_sources():
    instructions = RESEARCH_WORKFLOW_INSTRUCTIONS.lower()
    assert "final assistant message" in instructions
    assert "never narrate" in instructions
    assert "peer-reviewed" in instructions
    assert "do not invent" in instructions
    assert "example.com" not in ALL_INSTRUCTIONS
