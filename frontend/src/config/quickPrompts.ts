/**
 * The suggestion cards on an empty thread.
 *
 * This is configuration, not layout. `QuickPromptCards` maps over whatever is
 * in this array and the page is never touched, so adding a prompt for a new
 * analysis is a one-entry change here.
 *
 * `prompt` is what actually gets sent as the user's message; `title` and
 * `description` are only the card's face. Keeping them separate means a card
 * can read well without the sent message inheriting its phrasing.
 */
export type QuickPrompt = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: "maize-gs",
    title: "做玉米 GS 基因组预测",
    description: "先检索分子标记辅助选择与 GBLUP 的主流做法，再给出可执行的分析步骤",
    prompt:
      "请调研玉米基因组选择（GS）的完整流程：如何构建训练群体、常用的 GBLUP 与贝叶斯方法、以及预测准确性（PCC）的评估与提升手段。请给出可执行的步骤并引用来源。",
  },
  {
    id: "gwas",
    title: "解读 GWAS 结果",
    description: "关联分析的显著性阈值、曼哈顿图与候选基因定位口径",
    prompt:
      "请说明如何解读一份 GWAS 关联分析结果：显著性阈值如何确定（Bonferroni 与 FDR）、曼哈顿图和 QQ 图该看什么、以及如何从显著位点定位候选基因。请引用来源。",
  },
  {
    id: "population-pca",
    title: "群体 PCA 分析",
    description: "群体结构、分层校正与主成分解释口径",
    prompt:
      "请介绍作物群体的 PCA 群体结构分析：如何选择标记、如何确定保留的主成分数、主成分在后续关联分析中如何作为协变量校正群体分层。请引用来源。",
  },
];
