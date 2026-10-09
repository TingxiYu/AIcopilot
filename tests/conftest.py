"""Environment for importing `aicopilot.agent` in tests.

`agent.py` builds its model at import time via `init_chat_model`, so importing
it needs a provider and a key. Fake ones are enough: constructing a chat model
performs no network I/O. These are assigned (not `setdefault`-ed) so the tests
are deterministic regardless of the developer's shell, and they are set here
because `conftest.py` runs before any test module imports the package.
"""

import os

os.environ["AGENTSEEK_MODEL_PROVIDER"] = "openai"
os.environ["AGENTSEEK_MODEL"] = "test-model"
os.environ["OPENAI_API_KEY"] = "test-key"
