import { CONTENT_WIDTH } from "../../config/layout";

/**
 * The empty-session hero: heading and subtitle.
 *
 * Just the two lines, laid out as a plain block. The centring, and the stacking
 * with the feature buttons and suggestion cards beneath it, belong to the
 * caller — this is one member of that group, not a container that has to know
 * what else goes in it.
 *
 * Deliberately sparse: on a brand-new thread there is nothing true to say yet,
 * and an earlier version of this column filled the space with troubleshooting
 * copy about the backend address, shown to someone who had not hit a problem.
 */
export function WelcomeScreen() {
  return (
    <div className={`${CONTENT_WIDTH} flex flex-col items-center gap-3 px-6 text-center`}>
      <h2 className="text-2xl font-semibold">有什么可以帮你的？</h2>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        上传基因型与表型数据，或发起基因组预测、群体分析等科研任务
      </p>
    </div>
  );
}
