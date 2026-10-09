import { useEffect, useId, useMemo, useRef, useState } from "react";
import { App as AntdApp, Button, ConfigProvider, Splitter, theme as antdTheme } from "antd";
import { LayoutOutlined } from "@ant-design/icons";
import { buildArtifacts } from "./lib/artifacts";
import { buildAnswerRows } from "./lib/answerRows";
import { parseCitations } from "./lib/citations";
import { threadTitle } from "./lib/title";
import { autoTitle } from "./lib/summary";
import { CONTENT_WIDTH } from "./config/layout";
import { useThreadStream } from "./hooks/useThreadStream";
import { useBackendReachable } from "./hooks/useBackendReachable";
import { useTheme } from "./hooks/useTheme";
import { useStickToBottom } from "./hooks/useStickToBottom";
import { useThreads } from "./hooks/useThreads";
import { useAnalysis } from "./analysis/useAnalysis";
import type { DatasetRow } from "./analysis/types";
import { buildTaskPresentation, projectResearchTask } from "./research-task";
import { MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, useRightPanel } from "./hooks/useRightPanel";
import { MessageList } from "./components/thread/MessageList";
import { ThreadHeader } from "./components/thread/ThreadHeader";
import { RunIndicator } from "./components/thread/RunIndicator";
import { ScrollToLatest } from "./components/thread/ScrollToLatest";
import { Composer } from "./components/thread/Composer";
import { WelcomeScreen } from "./components/thread/WelcomeScreen";
import { QuickActions } from "./components/thread/QuickActions";
import { QuickPromptCards } from "./components/thread/QuickPromptCards";
import { Sidebar } from "./components/shell/Sidebar";
import { ThemeToggle } from "./components/shell/ThemeToggle";
import { ConnectionBanner } from "./components/shell/ConnectionBanner";
import { InterruptCard } from "./components/cards/InterruptCard";
import { RightPanel } from "./components/panel/RightPanel";

// Deep blue primary with a teal success accent, matching the oklch tokens in
// styles.css. antd derives its own scales from these.
const BRAND = { colorPrimary: "#1565c0", colorInfo: "#1565c0", colorSuccess: "#00796b" };

export default function App() {
  const {
    stream,
    threadId,
    selectThread,
    subagentsByCallId,
    messages,
    apiUrl,
    connectionError,
    isConnecting,
    submit,
  } = useThreadStream();

  // The only consumer of the theme hook, and the reason `.dark` ever reaches
  // <html> (styles.css keys its whole dark token block off that class, and this
  // project has no `@custom-variant dark`). The toggle below it is the control
  // for the same state, and ConfigProvider below carries it into antd.
  const { theme, toggle } = useTheme();

  // §5.4. `false` means the address itself does not answer; `null` means the
  // check is still in flight and nothing should be claimed yet. `retry` exists
  // so a user who starts their backend a moment later is not left with a
  // disabled UI and no way out but a reload.
  const { reachable, retry } = useBackendReachable(apiUrl);

  const threads = useThreads(apiUrl, threadId);
  // Every analysis tool, instantiated. The shell reads only `runtime.view`
  // (rendered by the preview panel) and `hasAnyResult` (the auto-open rule) —
  // it never names a tool, so adding GWAS or a population PCA is a registry
  // entry and nothing here changes.
  const analysis = useAnalysis();
  const unboundScope = useId();

  // Recomputed per render, as before the remodel: it is a pure walk over the
  // handful of virtual files a run produces, and `stream.values` is a fresh
  // object each render, so a `useMemo` keyed on it would never cache anyway.
  const artifacts = buildArtifacts(stream.values?.files);
  const artifactPaths = artifacts.map((artifact) => artifact.path);

  const title = threadTitle(messages);
  const report = artifacts.find((artifact) => artifact.name === "final_report.md") ?? artifacts[0];
  const citations = report ? parseCitations(report.content) : [];
  const rows = useMemo(
    () => buildAnswerRows(messages, report?.name === "final_report.md" ? report.content : undefined, stream.isLoading),
    [messages, report?.content, report?.name, stream.isLoading],
  );

  // Dataset rows are contributed only by registered analyses. Agent files are
  // ResearchTask artifacts and remain available through the artifact tabs;
  // treating reports or markdown files as datasets would corrupt both models.
  const datasetRows: DatasetRow[] = analysis.entries.flatMap(
    (entry) => entry.runtime.datasets ?? [],
  );

  // M2 compatibility boundary: existing stabilized conversation, registry and
  // artifact projections are composed into one read-only ResearchTask model.
  // An unbound conversation still needs a render-stable scope, but this local
  // compatibility ID makes no durability claim; authoritative IDs belong to a
  // future backend task manifest.
  const conversationScope = threadId ?? `ephemeral:${unboundScope}`;
  const analysisTasks = analysis.entries.flatMap((entry) => entry.runtime.tasks ?? []);
  const researchTask = projectResearchTask({
    conversationId: conversationScope,
    messages,
    todos: stream.values?.todos ?? [],
    subagentsByCallId,
    artifacts,
    analysisTasks,
    isRunning: stream.isLoading,
    hasInterrupt: Boolean(stream.interrupt),
    error: stream.error,
    isConnectionError: connectionError,
  });
  const taskPresentation = buildTaskPresentation(researchTask);

  const right = useRightPanel({
    hasArtifacts: artifacts.length > 0,
    hasToolResult: analysis.hasAnyResult,
  });

  // Seed for the composer. Bumped with a fresh key when "continue in a new
  // conversation" opens a new thread carrying the previous question, which
  // re-mounts the composer so it picks the value up.
  const [composerSeed, setComposerSeed] = useState({ text: "", seq: 0 });

  // §4.5.3. The dependency list is the content signal: `rows` is identity-stable
  // between value-equal rebuilds (see `stabilizeMessages`), and `running` covers
  // the tail of a run where the indicator appears without a new row.
  //
  // The ref comes from the hook and is handed straight to the scroll container —
  // a second local ref assigned to the same DOM node is unnecessary, since the
  // hook's `scrollToBottom` and its listener both close over this one.
  const { ref: scrollRef, pinned, scrollToBottom } = useStickToBottom<HTMLDivElement>([
    rows,
    stream.isLoading,
  ]);

  // `reachable === false` is the health-probe verdict and covers the cold-load
  // case; `connectionError` covers a request that failed (the probe may still
  // have been in flight). Either way the user sees the address.
  const unreachable = reachable === false || connectionError;
  const connecting = isConnecting || reachable === null;

  // §5.4. The column DEGRADES; it does not get replaced. An earlier revision
  // swapped the whole thing out when the backend was unreachable, which
  // unmounted the composer and left the user with a banner and nowhere to type
  // the question they came to ask — a worse answer to the spec than the blank
  // screen it was meant to fix. Everything below stays mounted in every state;
  // only the banner appears and the composer's send is refused.
  const detail = stream.error ? String(stream.error) : "后端未通过健康检查";
  const interrupt = stream.interrupt;

  // Keyed on RENDERABLE content, not on the raw message count. A brand-new
  // thread can already hold messages that project to no rows at all — an AI
  // message whose content has not arrived yet, say — and keying on the count
  // would then render an empty conversation pane with no bubbles in it instead
  // of the welcome screen.
  const showWelcome = rows.length === 0;

  // Auto-title, once per completed run.
  //
  // Edge-triggered on the running flag rather than fired on every render: the
  // title should be derived when a conversation SETTLES, not while it is still
  // streaming, or the sidebar would rewrite itself token by token.
  const wasRunning = useRef(false);
  useEffect(() => {
    const justFinished = wasRunning.current && !stream.isLoading;
    wasRunning.current = stream.isLoading;
    if (!justFinished || !threadId) return;

    const derived = autoTitle({ messages, report: report?.content });
    if (derived !== "") void threads.setAutoTitle(threadId, derived);
    // `threads.setAutoTitle` is stable (useCallback over stable deps), so this
    // does not re-fire per render; the ref guard makes it once per run anyway.
  }, [stream.isLoading, threadId, messages, report, threads.setAutoTitle]);

  const conversation = (
    // `h-full` + `overflow-hidden` are load-bearing, not decoration. The antd
    // Splitter panel is `overflow: auto`, so a conversation grid that is free to
    // grow past it makes the PANEL the scroll container — and then the messages
    // scroll the composer out of view along with them. Pinning the grid to the
    // panel's height hands the scrolling to the 1fr row below, which keeps the
    // footer out of the scroll entirely.
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_1fr_auto] overflow-hidden">
      {/* No header at all on an empty session. `threadTitle` falls back to
          "(空会话)" for a thread with no messages, which reads as a real title
          sitting above a welcome screen that has nothing to say yet — the
          sidebar still uses that fallback as a label, but this page should
          show no title text whatsoever. */}
      {showWelcome ? null : <ThreadHeader title={title} citationCount={citations.length} />}

      {unreachable ? (
        <ConnectionBanner url={apiUrl} detail={detail} onRetry={retry} />
      ) : connecting ? (
        // Not yet failed, merely not answered. Once messages exist the column
        // shows real content and the inline banner below is the right place for
        // a mid-run error, so this only covers the pre-first-response window.
        <ConnectionBanner url={apiUrl} />
      ) : null}

      <div className="relative min-h-0">
        <div ref={scrollRef} className="h-full overflow-auto" data-testid="conversation-scroll">
          {showWelcome ? (
            // One centred group: heading, subtitle, feature buttons and the
            // suggestion cards together, vertically and horizontally centred in
            // the space above the composer. The composer is deliberately NOT
            // part of this group — it is pinned in the footer below, so it is
            // present from the first paint and never moves when the welcome
            // content changes height.
            <div
              className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-8"
              data-testid="welcome-zone"
            >
              <WelcomeScreen />
              <div className={`${CONTENT_WIDTH} flex flex-col gap-3`}>
                <QuickActions
                  blocked={unreachable}
                  onUploadData={() => right.open("result")}
                  onRunGs={() => right.open("result")}
                  onViewResults={() => right.open("report")}
                />
                {/* Config-driven: adding a prompt is a change to QUICK_PROMPTS
                    alone, never to this page. */}
                <QuickPromptCards
                  blocked={unreachable}
                  onPick={(prompt) =>
                    submit({ messages: [{ type: "human", content: prompt }] }, { streamSubgraphs: true })
                  }
                />
              </div>
            </div>
          ) : (
            <MessageList
              rows={rows}
              running={stream.isLoading}
              artifactPaths={artifactPaths}
              onOpenArtifact={(_path, tab) => right.open(tab)}
            />
          )}
        </div>
        <ScrollToLatest show={!pinned} onClick={scrollToBottom} />
      </div>

      <div>
        {/* Suppressed while `unreachable`: the failure is already named in the
            top banner, and showing the same string twice adds nothing. */}
        {stream.error && !unreachable ? (
          <p
            className="border-t px-4 py-2 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--danger)" }}
            role="alert"
          >
            {String(stream.error)}
          </p>
        ) : null}
        {stream.isLoading ? (
          <div className={`${CONTENT_WIDTH} px-4 pt-2`}>
            <RunIndicator running />
          </div>
        ) : null}
        {/* Adjacent to the composer on purpose: the banner is at the top of the
            column, and a user typing at the bottom would not connect a disabled
            send button to an explanation three rows up. */}
        {unreachable ? (
          <p className={`${CONTENT_WIDTH} px-4 pt-2 text-xs`} style={{ color: "var(--muted)" }}>
            后端不可达，暂时无法发送。已输入的内容会保留。
          </p>
        ) : null}

        {/* Everything below shares one width band, so the composer, the cards
            and the messages above stay aligned however wide the window gets. */}
        <div className={`${CONTENT_WIDTH} px-4`}>
          {/* A paused run outranks everything else in the column: it is the one
              thing here that is waiting on the reader. */}
          {interrupt ? (
            <div className="pb-2">
              <InterruptCard
                value={interrupt.value}
                disabled={unreachable}
                // Resuming rides the SAME submit the composer uses, with a
                // `command.resume` payload — a second channel into the run
                // would be a second thing to keep in sync with the stream.
                onResume={(resume) => void submit(null, { command: { resume } })}
              />
            </div>
          ) : null}

          <Composer
            // Re-mounted only when a new seed arrives, so an ordinary re-render
            // never disturbs the draft the user is typing.
            key={composerSeed.seq}
            initialValue={composerSeed.text}
            // A run in flight turns the action button into Stop; an interrupt
            // waiting on the user is a third state — nothing to send and
            // nothing to stop — so it keeps the send button but inert.
            running={stream.isLoading}
            onStop={() => void stream.stop()}
            disabled={Boolean(interrupt)}
            blocked={unreachable}
            onSubmit={(text) =>
              // Belt and braces: the backend already emits subgraph namespaces
              // without this flag, but the flag is an option of submit(), not of
              // the hook, so nothing sends it today. If the backend ever gates
              // subagent events on it, the subagent card would otherwise degrade
              // silently.
              submit({ messages: [{ type: "human", content: text }] }, { streamSubgraphs: true })
            }
          />
        </div>

        {/* The only way back once the panel has been dismissed: a new artifact
            deliberately no longer auto-opens it, so there has to be a control
            that always does. Ctrl+B is wired to the same state. */}
        <div className={`${CONTENT_WIDTH} flex justify-end px-4`}>
          <Button
            type="text"
            size="small"
            icon={<LayoutOutlined />}
            onClick={() => (right.show ? right.close() : right.open())}
            aria-label={right.show ? "收起预览面板" : "展开预览面板"}
          >
            {right.show ? "收起预览" : "展开预览"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: BRAND,
      }}
    >
      <div className="h-full">
        {/* Nested Splitter: outer = [ everything | preview ], inner = [ sidebar
            | conversation ].

            The preview panel is genuinely unmounted when hidden — the whole
            `Splitter.Panel` disappears, per the requirement. That is safe
            because it is the LAST panel: the sidebar/conversation panel keeps
            index 0 and its React identity across the toggle, so the column is
            not remounted and the user keeps their scroll position and their
            unsent draft. (What is NOT safe is swapping the outer Splitter
            itself in and out — that changes the tree shape and remounts
            everything below it.) `app-smoke.test.tsx` pins the draft surviving
            a toggle. */}
        <Splitter style={{ height: "100%" }} onResize={right.onWidthChange}>
          <Splitter.Panel>
            <Splitter style={{ height: "100%" }}>
              <Splitter.Panel defaultSize={260} min={260} max={320}>
                <Sidebar
                  activeId={threadId}
                  // Sidebar sends "" for "new thread"; coerce to undefined —
                  // useStream treats an empty string as a real (invalid) thread
                  // id, not as absent. `selectThread` also drops `?thread=` so
                  // the action is visible in the URL and a refresh does not
                  // restore the thread just left (§5.3).
                  onSelect={(id) => selectThread(id || undefined)}
                  newThreadBlocked={unreachable}
                  threads={threads.threads}
                  query={threads.query}
                  onQueryChange={threads.setQuery}
                  onRename={threads.rename}
                  onPin={threads.setPinned}
                  onContinueInNew={async (id) => {
                    // Carry the previous question into a fresh conversation.
                    // There is no fork API to call, so this is the honest
                    // version of "continue": the same question, a new thread.
                    const question = await threads.lastQuestionIn(id);
                    selectThread(undefined);
                    setComposerSeed((current) => ({ text: question, seq: current.seq + 1 }));
                  }}
                  onArchive={threads.archive}
                  onDelete={async (id) => {
                    await threads.remove(id);
                    // The open thread no longer exists; leaving `?thread=`
                    // pointing at it would make a refresh resurrect a deleted
                    // conversation's id.
                    if (threadId === id) selectThread(undefined);
                  }}
                  footer={<ThemeToggle theme={theme} onToggle={toggle} />}
                />
              </Splitter.Panel>
              <Splitter.Panel min={520}>{conversation}</Splitter.Panel>
            </Splitter>
          </Splitter.Panel>

          {right.show ? (
            <Splitter.Panel size={right.width} min={MIN_PANEL_WIDTH} max={MAX_PANEL_WIDTH}>
              <RightPanel
                tab={right.tab}
                onTabChange={right.setTab}
                onClose={right.close}
                task={taskPresentation}
                messageCount={rows.length}
                citations={citations}
                files={stream.values?.files}
                analysis={analysis.entries}
                activeToolId={analysis.activeId}
                onActiveToolChange={analysis.setActiveId}
                datasetRows={datasetRows}
              />
            </Splitter.Panel>
          ) : null}
        </Splitter>
      </div>
    </ConfigProvider>
  );
}
