"""Test doubles for the storage layer.

`RecordingBackend` implements only the methods these tests exercise. The
protocol's remaining methods raise `NotImplementedError` by default, which is
the documented contract for a partially-implemented backend.
"""

from __future__ import annotations

from deepagents.backends.protocol import (
    BackendProtocol,
    DeleteResult,
    EditResult,
    ReadResult,
    WriteResult,
)
from deepagents.backends.utils import create_file_data


class RecordingBackend(BackendProtocol):
    """An in-memory backend that records the mutations it is asked to make.

    Paths are normalised with a leading `/` before being stored. That is the
    absolute form `BackendProtocol` documents, and it is what
    a routed backend actually receives: `CompositeBackend` strips the route
    prefix and re-anchors the result at the backend's root
    (`deepagents.backends.composite._route_for_path`), so
    `/artifacts/final_report.md` arrives here as `/final_report.md`.
    """

    def __init__(self, *, fail_writes: bool = False) -> None:
        self.files: dict[str, str] = {}
        self.calls: list[tuple[str, str]] = []
        self.fail_writes = fail_writes

    @staticmethod
    def _key(file_path: str) -> str:
        return file_path if file_path.startswith("/") else f"/{file_path}"

    def write(self, file_path: str, content: str) -> WriteResult:
        self.calls.append(("write", file_path))
        if self.fail_writes:
            return WriteResult(error="write refused")
        self.files[self._key(file_path)] = content
        return WriteResult(path=file_path)

    async def awrite(self, file_path: str, content: str) -> WriteResult:
        self.calls.append(("awrite", file_path))
        if self.fail_writes:
            return WriteResult(error="write refused")
        self.files[self._key(file_path)] = content
        return WriteResult(path=file_path)

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        content = self.files.get(self._key(file_path))
        if content is None:
            return ReadResult(error=f"File not found: {file_path}")
        return ReadResult(file_data=create_file_data(content))

    def edit(
        self, file_path: str, old_string: str, new_string: str, replace_all: bool = False
    ) -> EditResult:
        self.calls.append(("edit", file_path))
        key = self._key(file_path)
        current = self.files.get(key)
        if current is None or old_string not in current:
            return EditResult(error="string not found")
        count = current.count(old_string) if replace_all else 1
        self.files[key] = (
            current.replace(old_string, new_string)
            if replace_all
            else current.replace(old_string, new_string, 1)
        )
        return EditResult(path=file_path, occurrences=count)

    async def aedit(
        self, file_path: str, old_string: str, new_string: str, replace_all: bool = False
    ) -> EditResult:
        self.calls.append(("aedit", file_path))
        key = self._key(file_path)
        current = self.files.get(key)
        if current is None or old_string not in current:
            return EditResult(error="string not found")
        self.files[key] = current.replace(old_string, new_string, 1)
        return EditResult(path=file_path, occurrences=1)

    def delete(self, file_path: str) -> DeleteResult:
        self.calls.append(("delete", file_path))
        key = self._key(file_path)
        if key not in self.files:
            return DeleteResult(error="not found")
        del self.files[key]
        return DeleteResult(path=file_path)

    async def adelete(self, file_path: str) -> DeleteResult:
        self.calls.append(("adelete", file_path))
        key = self._key(file_path)
        if key not in self.files:
            return DeleteResult(error="not found")
        del self.files[key]
        return DeleteResult(path=file_path)
