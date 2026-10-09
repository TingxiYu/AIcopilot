import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Client } from "@langchain/langgraph-sdk";

// npm hoists a single 1.8.10 copy to the top level, so the nested path only
// exists if the graph ever de-hoists. Accept either, but assert on whichever
// copy the app actually imports.
const require_ = createRequire(join(process.cwd(), "package.json"));
const SDK_DIR = dirname(require_.resolve("@langchain/langgraph-sdk/package.json"));

describe("stream path guard", () => {
  it("resolves to the langgraph-sdk inside the pinned @langchain/react", () => {
    // @langchain/react@0.3.5 depends on exactly 1.8.10; if this drifts, the
    // app silently switches to the v2 transport.
    const reactPkg = JSON.parse(
      readFileSync(require_.resolve("@langchain/react/package.json"), "utf8"),
    );
    expect(reactPkg.dependencies["@langchain/langgraph-sdk"]).toBe("1.8.10");
  });

  it("uses the classic /runs/stream transport, not the v2 /stream/events stub", () => {
    const pkg = JSON.parse(readFileSync(join(SDK_DIR, "package.json"), "utf8"));
    expect(pkg.version).toBe("1.8.10");

    // The v2 controller only exists in langgraph-sdk >= 1.10 and drives
    // POST /threads/{id}/stream/events, which agentseek-api answers with an
    // empty stream — the UI would render nothing and log no error.
    expect(existsSync(join(SDK_DIR, "dist/client/stream"))).toBe(false);

    const client = readFileSync(join(SDK_DIR, "dist/client.js"), "utf8");
    expect(client).toContain("/runs/stream");
    expect(client).not.toContain("/stream/events");
  });
});

const API_URL = process.env.AICOPILOT_API_URL ?? "http://127.0.0.1:2026";

describe("backend contract", () => {
  it("streams an assistant reply through the same call the UI makes", async () => {
    const client = new Client({ apiUrl: API_URL });

    let threadId: string;
    try {
      threadId = (await client.threads.create()).thread_id;
    } catch {
      throw new Error(`后端不可达：${API_URL}。先启动 agentseek-api 再跑本测试。`);
    }

    const stream = client.runs.stream(threadId, "research", {
      input: { messages: [{ role: "user", content: "Reply with the single word: ok" }] },
      streamMode: ["messages"],
    });

    let receivedText = false;
    for await (const chunk of stream) {
      // `streamMode: ["messages"]` yields `messages/partial` and
      // `messages/complete` -- there is no bare `messages` event.
      if (chunk.event === "messages/partial" || chunk.event === "messages/complete") {
        const payload = Array.isArray(chunk.data) ? chunk.data : [chunk.data];
        for (const message of payload as { type?: string; content?: unknown }[]) {
          if (message.type === "ai" && typeof message.content === "string" && message.content.length > 0) {
            receivedText = true;
          }
        }
      }
      if (receivedText) break;
    }

    expect(receivedText).toBe(true);
  }, 180_000);
});
