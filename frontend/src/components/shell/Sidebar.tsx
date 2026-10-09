import { useState } from "react";
import { App as AntdApp, Badge, Button, Dropdown, Empty, Input, Modal, Tooltip } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  InboxOutlined,
  LinkOutlined,
  MessageOutlined,
  MoreOutlined,
  NumberOutlined,
  PushpinFilled,
  PushpinOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { groupThreads, type ThreadSummary } from "../../hooks/useThreads";
import { copyText, shareUrlFor } from "../../lib/clipboard";

/**
 * The left column.
 *
 * Presentational: the thread list and its mutations live in `useThreads`, which
 * `App` owns, so this renders whatever it is handed and reports intent upward.
 * Every prop added by the redesign is optional, so the component still mounts
 * standalone with nothing but `onSelect`.
 */
export function Sidebar({
  activeId,
  onSelect,
  footer,
  newThreadBlocked = false,
  threads = [],
  query = "",
  onQueryChange,
  onRename,
  onPin,
  onContinueInNew,
  onArchive,
  onDelete,
}: {
  activeId?: string;
  onSelect: (id: string) => void;
  /**
   * Pinned to the bottom of the column, outside the scrolling thread list.
   * A ReactNode slot rather than a prop per control: the sidebar owns layout,
   * `App` owns what belongs there.
   */
  footer?: React.ReactNode;
  /**
   * The backend is known to be unreachable.
   *
   * A thread is only really created when the backend answers (spec §5.3: the id
   * comes back from the first submit), so with no backend "new thread" cannot
   * do anything a user can see — it would be a click that silently no-ops. The
   * control is disabled and labelled instead, and the banner offers a retry, so
   * the state is communicated rather than swallowed.
   */
  newThreadBlocked?: boolean;
  threads?: ThreadSummary[];
  query?: string;
  onQueryChange?: (value: string) => void;
  onRename?: (id: string, title: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
  onContinueInNew?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { message } = AntdApp.useApp();
  const [renaming, setRenaming] = useState<ThreadSummary | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * The row whose actions are showing, by thread id.
   *
   * State rather than a CSS-only `group-hover` reveal: the menu button must be
   * ABSENT — not merely transparent — when the row is idle, and a class-based
   * reveal leaves it in the DOM, reachable by keyboard and by `getByRole` in a
   * way that does not match what the user sees.
   *
   * Keyboard access is preserved by driving this from focus as well as hover,
   * so tabbing to a row's title still surfaces its menu.
   */
  const [activeRow, setActiveRow] = useState<string | null>(null);
  /**
   * The row whose dropdown is open, tracked separately from `activeRow`.
   *
   * These MUST be separate. The dropdown renders into a portal, so moving the
   * pointer from the ⋯ button onto a menu item leaves the `<li>` and fires
   * `mouseleave`; if opening the menu depended on hover, the trigger would
   * unmount the moment the user reached for an item and the menu would vanish
   * under the cursor. While a menu is open its row keeps its trigger mounted
   * regardless of hover.
   */
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  async function copy(value: string, okText: string) {
    const copied = await copyText(value);
    if (copied) message.success(okText);
    // A silent failure here would leave the user pasting something stale, so
    // the failure is reported too.
    else message.error("复制失败，请手动复制");
  }

  // `Date.now()` is read once so every group is bucketed against the same
  // instant; reading it per thread could straddle a day boundary mid-render.
  const groups = groupThreads(threads, Date.now());

  function confirmDelete(thread: ThreadSummary) {
    Modal.confirm({
      title: "删除这个会话？",
      content: `「${thread.title}」及其对话记录将被永久删除，无法恢复。`,
      okText: "删除",
      // Explicit accessible names on both buttons: antd's `autoInsertSpace`
      // renders a two-character Chinese label as "删 除", so the name a screen
      // reader announces would otherwise depend on a typographic setting.
      okButtonProps: { danger: true, "aria-label": "删除" },
      cancelText: "取消",
      cancelButtonProps: { "aria-label": "取消" },
      onOk: () => onDelete?.(thread.id),
    });
  }

  function submitRename() {
    if (renaming && draft.trim() !== "") onRename?.(renaming.id, draft.trim());
    setRenaming(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--panel)" }}>
      {/* Fixed brand header: outside the scrolling region on purpose, so the
          app's identity stays put while the thread list moves under it. */}
      <header
        className="flex shrink-0 items-center gap-2 border-b px-3 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-semibold"
          style={{ background: "var(--accent)", color: "var(--bg)" }}
        >
          B
        </span>
        <span className="truncate text-sm font-semibold">AIcopilot</span>
      </header>

      <div className="flex shrink-0 flex-col gap-2 p-2">
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          placeholder="搜索会话"
          aria-label="搜索会话"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
        />
        <Tooltip title={newThreadBlocked ? "后端不可达，暂时无法新建会话" : undefined}>
          <Button
            block
            size="small"
            disabled={newThreadBlocked}
            onClick={() => onSelect("")}
            style={{ textAlign: "left" }}
          >
            ＋ 新建
          </Button>
        </Tooltip>
        {newThreadBlocked ? (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            后端不可达，无法新建会话。
          </p>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-auto" aria-label="会话列表">
        {groups.length === 0 ? (
          <div className="p-3">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={query.trim() === "" ? "还没有会话" : "没有匹配的会话"}
            />
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label}>
              <h2 className="px-3 pt-3 pb-1 text-xs" style={{ color: "var(--muted)" }}>
                {group.label}
              </h2>
              <ul>
                {group.items.map((thread) => (
                  <li
                    key={thread.id}
                    className="group/item relative"
                    onMouseEnter={() => setActiveRow(thread.id)}
                    onMouseLeave={() => setActiveRow((current) => (current === thread.id ? null : current))}
                    // Focus bubbles in React, so one handler covers the title
                    // button and the menu button inside this row.
                    onFocus={() => setActiveRow(thread.id)}
                    onBlur={(event) => {
                      // Only clear when focus truly left the row -- moving
                      // between the title and the menu button fires blur too,
                      // and clearing there would unmount the very button the
                      // user is tabbing into.
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setActiveRow((current) => (current === thread.id ? null : current));
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(thread.id)}
                      // The right padding is always reserved so revealing the
                      // menu does not reflow (and re-truncate) the title.
                      className="flex w-full items-center gap-2 truncate rounded px-3 py-1.5 pr-8 text-left text-sm"
                      style={{ background: thread.id === activeId ? "var(--panel-2)" : undefined }}
                      title={thread.title}
                    >
                      {thread.running ? <Badge status="processing" title="任务进行中" /> : null}
                      <span className="truncate">{thread.title}</span>
                    </button>

                    {/* Mounted while the row is hovered or focused, AND for as
                        long as its menu is open — the second half is what lets
                        the pointer travel from the button onto a menu item. */}
                    {activeRow === thread.id || openMenuFor === thread.id ? (
                      <Dropdown
                        trigger={["click"]}
                        // Controlled: the open state lives here so that leaving
                        // the row cannot close the menu. antd still closes it on
                        // an outside click, which is the behaviour we want.
                        open={openMenuFor === thread.id}
                        onOpenChange={(open) => setOpenMenuFor(open ? thread.id : null)}
                        menu={{
                          items: [
                            {
                              key: "pin",
                              icon: thread.pinned ? <PushpinFilled /> : <PushpinOutlined />,
                              label: thread.pinned ? "取消置顶" : "置顶",
                            },
                            { key: "copyLink", icon: <LinkOutlined />, label: "复制分享链接" },
                            { type: "divider" },
                            { key: "rename", icon: <EditOutlined />, label: "重命名" },
                            { key: "continue", icon: <MessageOutlined />, label: "在新对话中继续" },
                            {
                              key: "move",
                              icon: <FolderOutlined />,
                              // No project concept exists in this app, and the
                              // backend contract is fixed. The item is shown so
                              // the menu is not a lie about what the product
                              // offers, and disabled WITH its reason rather
                              // than left as an unexplained dead entry.
                              disabled: true,
                              label: (
                                <span className="flex items-center justify-between gap-3">
                                  <span>移动到项目</span>
                                  <span className="text-xs opacity-60">暂不支持</span>
                                </span>
                              ),
                            },
                            { key: "copyId", icon: <NumberOutlined />, label: "复制会话 ID" },
                            { type: "divider" },
                            { key: "archive", icon: <InboxOutlined />, label: "归档对话" },
                            { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true },
                          ],
                          onClick: ({ key }) => {
                            // Selecting an item closes the menu, alongside the
                            // outside-click path antd already handles.
                            setOpenMenuFor(null);
                            if (key === "pin") onPin?.(thread.id, !thread.pinned);
                            if (key === "copyLink") {
                              void copy(shareUrlFor(thread.id, window.location.href), "分享链接已复制");
                            }
                            if (key === "copyId") void copy(thread.id, "会话 ID 已复制");
                            if (key === "rename") {
                              setRenaming(thread);
                              setDraft(thread.title);
                            }
                            if (key === "continue") onContinueInNew?.(thread.id);
                            if (key === "archive") onArchive?.(thread.id);
                            if (key === "delete") confirmDelete(thread);
                          },
                        }}
                      >
                        <Button
                          type="text"
                          size="small"
                          aria-label={`会话操作：${thread.title}`}
                          className="absolute top-1 right-1"
                          icon={<MoreOutlined />}
                        />
                      </Dropdown>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      {footer}

      <Modal
        open={renaming !== null}
        title="重命名会话"
        okText="保存"
        cancelText="取消"
        okButtonProps={{ "aria-label": "保存" }}
        cancelButtonProps={{ "aria-label": "取消" }}
        onCancel={() => setRenaming(null)}
        onOk={submitRename}
      >
        <Input
          autoFocus
          value={draft}
          maxLength={80}
          placeholder="输入新的会话名称"
          aria-label="会话名称"
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={submitRename}
        />
      </Modal>
    </div>
  );
}
