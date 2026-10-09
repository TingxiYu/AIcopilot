import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildArtifacts } from "../../lib/artifacts";
import { parseCitations } from "../../lib/citations";

export function ArtifactPanel({
  files,
  initialPath,
}: {
  files: unknown;
  /**
   * Artifact to open first. The preview panel gives each artifact beyond the
   * primary report its own tab, and each of those tabs must land on its OWN
   * artifact — without this they would all fall back to the first one and two
   * tabs would show the same document.
   */
  initialPath?: string;
}) {
  const artifacts = buildArtifacts(files);
  const [selected, setSelected] = useState<string | null>(initialPath ?? null);
  const active = artifacts.find((a) => a.path === selected) ?? artifacts[0];

  if (artifacts.length === 0) {
    return (
      <p className="p-3 text-sm" style={{ color: "var(--muted)" }}>
        研究进行中，报告完成后会出现在这里。
      </p>
    );
  }

  const citations = active ? parseCitations(active.content) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="border-b" style={{ borderColor: "var(--border)" }}>
        {artifacts.map((artifact) => (
          <li key={artifact.path}>
            <button
              type="button"
              onClick={() => setSelected(artifact.path)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-mono"
              style={{ background: artifact.path === active?.path ? "var(--panel-2)" : undefined }}
            >
              <span>{artifact.path === active?.path ? "▾" : "▸"}</span>
              <span>{artifact.name}</span>
              <span className="ml-auto" style={{ color: "var(--muted)" }}>{artifact.lines} 行</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-h-0 flex-1 overflow-auto p-3 prose">
        {active ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown>
        ) : null}
      </div>

      {citations.length > 0 ? (
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-1 text-xs uppercase" style={{ color: "var(--muted)" }}>
            引用来源 · {citations.length}
          </h2>
          <ol className="flex flex-col gap-1 text-xs">
            {citations.map((citation) => (
              <li key={citation.n} className="truncate">
                <a href={citation.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  [{citation.n}] {citation.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
