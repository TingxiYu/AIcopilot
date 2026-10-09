// Throwaway capture script: runs one real research task through the same SDK
// version the UI uses, and dumps every chunk to a fixture file.
import { writeFileSync } from "node:fs";
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({ apiUrl: "http://127.0.0.1:2026" });
const thread = await client.threads.create();

const chunks = [];
const stream = client.runs.stream(thread.thread_id, "research", {
  input: {
    messages: [
      { role: "user", content: "What is a genomic prediction model? One paragraph." },
    ],
  },
  streamMode: ["values", "messages", "updates"],
});

for await (const chunk of stream) {
  chunks.push({ event: chunk.event, data: chunk.data });
  if (chunks.length > 4000) break; // safety cap
}

const state = await client.threads.getState(thread.thread_id);
writeFileSync(
  new URL("./research-run.json", import.meta.url),
  JSON.stringify({ threadId: thread.thread_id, chunks, finalValues: state.values }, null, 2),
);
console.log("chunks:", chunks.length);
console.log("state keys:", Object.keys(state.values ?? {}));
