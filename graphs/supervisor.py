import os

from deepagents import AsyncSubAgent, create_deep_agent
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    # �� Agent ����Э������� Agent������ʹ��������ǿ��֧�ֹ��ߵ��õ�ģ��
    model=os.environ.get("AGENTSEEK_MODEL", "deepseek-chat"),
    api_key=os.environ["OPENAI_API_KEY"],
    base_url="https://api.deepseek.com/v1",
)

graph = create_deep_agent(
    model=model,
    system_prompt=(
        "You are a supervisor agent for an async-subagent demo. "
        "When the user asks for a long-running research task, you must delegate "
        "to the async subagent named researcher immediately. "
        "After calling start_async_task, return the task_id to the user and stop. "
        "Do not call check_async_task unless the user explicitly asks for progress. "
        "If the user asks to revise the background task, call update_async_task."
    ),
    subagents=[
        AsyncSubAgent(
            name="researcher",
            description=(
                "Use for any long-running background research or async demo task. "
                "This agent intentionally sleeps before returning so the async "
                "behavior is easy to observe."
            ),
            graph_id="researcher",
            # Required: the async subagent launches a run on this Agent Protocol
            # server. Omitting `url` selects ASGI transport, which is only
            # available through a local in-process app and fails with
            # "'NoneType' object is not callable" when served by agentseek-api.
            url=os.environ.get("AGENTSEEK_API_URL", "http://127.0.0.1:2026"),
        )
    ]
)