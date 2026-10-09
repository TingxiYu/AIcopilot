"""A `CompositeBackend` that also mirrors artifact writes into graph state.

The UI renders artifacts from `stream.values.files` (`frontend/src/App.tsx`).
That channel only ever held files because deepagents' default `StateBackend`
stores them there; once artifacts live in a persistent store they leave it, and
the preview panel would silently render nothing — no error, no exception. This
keeps the projection alive without making state the source of truth: the store
is authoritative, state is a per-run materialised view for the UI.

Inheritance is deliberate. `deepagents` introspects `type(backend)` for method
signatures (`_method_accepts_max_count`, called from
`middleware/filesystem.py`), so a hand-written wrapper would lose the
`max_count` bound on `grep` and log a warning every call. Inheriting keeps the
nine read-only methods identical, signatures and all.

The cost is coupling to `CompositeBackend`. The constraint that bounds it:
override ONLY write/edit/delete and their async twins, always call `super()`
first, mirror only on success, and never touch `CompositeBackend`'s non-public
members.
"""

from __future__ import annotations

from deepagents.backends import CompositeBackend, StateBackend
from deepagents.backends.protocol import (
    BackendProtocol,
    DeleteResult,
    EditResult,
    ReadResult,
    WriteResult,
)
from deepagents.backends.utils import file_data_to_string


class ProjectedComposite(CompositeBackend):
    def __init__(
        self,
        *,
        default: BackendProtocol,
        routes: dict[str, BackendProtocol],
        mirror_prefixes: tuple[str, ...],
        mirror_backend: BackendProtocol | None = None,
    ) -> None:
        super().__init__(default=default, routes=routes)
        self._mirror_prefixes = tuple(mirror_prefixes)
        # Defaults to a private StateBackend so the mirror rides deepagents'
        # own state-writing path (FileData shape + delta reducer) rather than
        # this module reaching into CONFIG_KEY_SEND itself.
        #
        # Precondition: the default StateBackend resolves its config through
        # `get_config()` and so raises outside an active LangGraph run. That is
        # fine because the mirror is only ever written during a run; but a
        # caller instantiating `ProjectedComposite(...)` without passing a
        # `mirror_backend`, outside a graph, will see that error. Inject a fake
        # (as the unit tests do) or instantiate it inside a run.
        self._mirror_backend: BackendProtocol = (
            mirror_backend if mirror_backend is not None else StateBackend()
        )

    # -- mirroring ------------------------------------------------------

    def _mirror(self, path: str, content: str) -> None:
        if path.startswith(self._mirror_prefixes):
            self._mirror_backend.write(path, content)

    async def _amirror(self, path: str, content: str) -> None:
        if path.startswith(self._mirror_prefixes):
            await self._mirror_backend.awrite(path, content)

    def _unmirror(self, path: str) -> None:
        if path.startswith(self._mirror_prefixes):
            self._mirror_backend.delete(path)

    async def _aunmirror(self, path: str) -> None:
        if path.startswith(self._mirror_prefixes):
            await self._mirror_backend.adelete(path)

    def _read_back(self, path: str) -> str | None:
        """Content after an edit, read from the authoritative backend.

        An edit's arguments do not contain the resulting text, so the mirror
        cannot be fed from them.
        """
        result: ReadResult = self.read(path)
        if result.error is not None or result.file_data is None:
            return None
        return file_data_to_string(result.file_data)

    # -- the only six overrides allowed ---------------------------------

    def write(self, file_path: str, content: str) -> WriteResult:
        result = super().write(file_path, content)
        if result.error is None:
            self._mirror(file_path, content)
        return result

    async def awrite(self, file_path: str, content: str) -> WriteResult:
        result = await super().awrite(file_path, content)
        if result.error is None:
            await self._amirror(file_path, content)
        return result

    def edit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        result = super().edit(file_path, old_string, new_string, replace_all)
        if result.error is None:
            content = self._read_back(file_path)
            if content is not None:
                self._mirror(file_path, content)
        return result

    async def aedit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        result = await super().aedit(file_path, old_string, new_string, replace_all)
        if result.error is None:
            read = self.read(file_path)
            if read.error is None and read.file_data is not None:
                await self._amirror(file_path, file_data_to_string(read.file_data))
        return result

    def delete(self, file_path: str) -> DeleteResult:
        result = super().delete(file_path)
        if result.error is None:
            self._unmirror(file_path)
        return result

    async def adelete(self, file_path: str) -> DeleteResult:
        result = await super().adelete(file_path)
        if result.error is None:
            await self._aunmirror(file_path)
        return result
