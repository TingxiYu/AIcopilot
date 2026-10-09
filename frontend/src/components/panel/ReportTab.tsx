import { useRef } from "react";
import { Empty } from "antd";
import { ArtifactPanel } from "../artifacts/ArtifactPanel";
import { buildArtifacts } from "../../lib/artifacts";
import { extractHeadings } from "../../lib/outline";

/**
 * Report preview: the artifact markdown, plus a document outline.
 *
 * `ArtifactPanel` is reused rather than reimplemented. It already renders the
 * markdown, the citation list and its own artifact switcher — which is how
 * "switch tabs to preview different artifacts" is satisfied without an
 * unbounded tab strip — and it carries its own tests.
 *
 * The outline scrolls by POSITION, not by id. react-markdown emits plain
 * `h1`-`h4` elements with no anchors, and injecting ids would mean either
 * replacing the renderer or post-processing its DOM. `extractHeadings` returns
 * headings in document order, so the n-th outline entry and the n-th rendered
 * heading are the same heading, and scrolling to it needs nothing from the
 * renderer.
 */
export function ReportTab({ files, initialPath }: { files: unknown; initialPath?: string }) {
  const container = useRef<HTMLDivElement | null>(null);
  const artifacts = buildArtifacts(files);
  // An explicit path wins over the "primary report" default, so a per-artifact
  // tab shows its own document rather than the one that sorts first.
  const report =
    artifacts.find((artifact) => artifact.path === initialPath) ??
    artifacts.find((artifact) => artifact.name === "final_report.md") ??
    artifacts[0];
  const headings = report ? extractHeadings(report.content) : [];

  function scrollToHeading(index: number) {
    const scope = container.current?.querySelector("[data-report-body]");
    const rendered = scope?.querySelectorAll("h1, h2, h3, h4");
    rendered?.[index]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  if (artifacts.length === 0) {
    return (
      <div className="p-3">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="研究进行中，报告完成后会出现在这里。"
        />
      </div>
    );
  }

  return (
    <div ref={container} className="flex h-full min-h-0 flex-col">
      {headings.length > 1 ? (
        <nav
          aria-label="文档大纲"
          className="max-h-40 shrink-0 overflow-auto border-b p-2"
          style={{ borderColor: "var(--border)" }}
        >
          <ul className="flex flex-col gap-0.5 text-xs">
            {headings.map((heading, index) => (
              <li key={`${heading.text}-${index}`}>
                <button
                  type="button"
                  onClick={() => scrollToHeading(index)}
                  className="w-full truncate text-left"
                  style={{
                    paddingLeft: `${(heading.level - 1) * 10}px`,
                    color: "var(--muted)",
                  }}
                  title={heading.text}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="min-h-0 flex-1" data-report-body>
        <ArtifactPanel files={files} initialPath={report?.path} />
      </div>
    </div>
  );
}
