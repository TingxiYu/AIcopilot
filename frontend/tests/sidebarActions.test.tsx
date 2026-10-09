// @vitest-environment jsdom
//
// The per-thread action menu: revealed on hover or keyboard focus, and absent
// from the DOM entirely when the row is idle.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App as AntdApp } from "antd";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "../src/components/shell/Sidebar";
import type { ThreadSummary } from "../src/hooks/useThreads";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = Date.now();

function thread(over: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "t1",
    title: "玉米 GS 研究",
    updatedAt: new Date(NOW - 60_000).toISOString(),
    archived: false,
    pinned: false,
    running: false,
    ...over,
  };
}

function renderSidebar(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props = {
    onSelect: vi.fn(),
    threads: [thread()],
    onRename: vi.fn(),
    onPin: vi.fn(),
    onContinueInNew: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  } as React.ComponentProps<typeof Sidebar>;
  // Wrapped in antd's `App`: the sidebar reports copy results through
  // `App.useApp()`'s message API, which needs a provider above it.
  render(
    <AntdApp>
      <Sidebar {...props} />
    </AntdApp>,
  );
  return props;
}

/** Hover the row and click its ⋯ button. */
async function openMenu(title = "玉米 GS 研究") {
  fireEvent.mouseEnter(rowOf(title));
  fireEvent.click(menuButton()!);
  await waitFor(() => expect(screen.getByText("重命名")).toBeTruthy());
}

/** The currently open dropdown, or null.
 *
 * antd keeps a closed dropdown in the DOM and marks it with a `leave`/`hidden`
 * class instead of removing it, so "the menu is gone" has to be asked as "no
 * dropdown is in an open state" rather than by querying for absence. Verified
 * against the rendered DOM rather than assumed.
 */
function openDropdown(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(".ant-dropdown"));
  return all.find((node) => !/leave|hidden/.test(node.className)) ?? null;
}

/** The <li> row containing a thread's title button. */
function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest("li");
  if (!row) throw new Error(`no row for ${title}`);
  return row as HTMLElement;
}

const menuButton = () => screen.queryByRole("button", { name: /会话操作/ });

describe("thread action menu visibility", () => {
  it("renders no action button at all while the row is idle", () => {
    // The requirement is that nothing shows until hover — not a transparent but
    // still present, still focusable button.
    renderSidebar();
    expect(menuButton()).toBeNull();
  });

  it("reveals the action button on hover and hides it again on leave", () => {
    renderSidebar();
    const row = rowOf("玉米 GS 研究");

    fireEvent.mouseEnter(row);
    expect(menuButton()).not.toBeNull();

    fireEvent.mouseLeave(row);
    expect(menuButton()).toBeNull();
  });

  it("reveals it for keyboard users too, via focus", () => {
    // A hover-only reveal would make the menu unreachable without a mouse.
    renderSidebar();
    fireEvent.focus(screen.getByText("玉米 GS 研究"));
    expect(menuButton()).not.toBeNull();
  });

  it("keeps the menu open while focus moves between the row's own controls", () => {
    // Moving focus from the title to the menu button fires blur on the row;
    // treating that as "left the row" would unmount the button mid-tab.
    renderSidebar();
    const row = rowOf("玉米 GS 研究");
    const title = screen.getByText("玉米 GS 研究");

    fireEvent.focus(title);
    const menu = menuButton();
    expect(menu).not.toBeNull();

    fireEvent.blur(row, { relatedTarget: menu });
    expect(menuButton()).not.toBeNull();
  });

  it("shows the menu for the hovered row only", () => {
    renderSidebar({
      threads: [thread(), thread({ id: "t2", title: "GWAS 解读" })],
    });
    fireEvent.mouseEnter(rowOf("GWAS 解读"));
    expect(screen.getAllByRole("button", { name: /会话操作/ })).toHaveLength(1);
    expect(menuButton()?.getAttribute("aria-label")).toContain("GWAS 解读");
  });
});

describe("thread action menu items", () => {
  it("offers the full menu", async () => {
    renderSidebar();
    await openMenu();
    for (const label of [
      "置顶",
      "复制分享链接",
      "重命名",
      "在新对话中继续",
      "移动到项目",
      "复制会话 ID",
      "归档对话",
      "删除",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks delete as dangerous, which is what renders it red", async () => {
    renderSidebar();
    await openMenu();
    // antd has no inline colour for this; `danger` is the class it renders.
    const item = screen.getByText("删除").closest(".ant-dropdown-menu-item");
    expect(item?.className).toContain("danger");
  });

  it("shows 移动到项目 disabled, with the reason on it", async () => {
    // There is no project concept in this app and the backend contract is
    // fixed, so the item is honest about being unavailable rather than being a
    // dead entry that silently does nothing when clicked.
    renderSidebar();
    await openMenu();
    const item = screen.getByText("移动到项目").closest(".ant-dropdown-menu-item");
    expect(item?.className).toContain("disabled");
    expect(screen.getByText("暂不支持")).toBeTruthy();
  });

  it("calls onArchive with the thread id", async () => {
    const onArchive = vi.fn();
    renderSidebar({ onArchive });
    await openMenu();
    fireEvent.click(await screen.findByText("归档对话"));
    expect(onArchive).toHaveBeenCalledWith("t1");
  });

  it("pins, and offers to unpin once pinned", async () => {
    const onPin = vi.fn();
    renderSidebar({ onPin });
    await openMenu();
    fireEvent.click(await screen.findByText("置顶"));
    expect(onPin).toHaveBeenCalledWith("t1", true);
  });

  it("labels the action 取消置顶 for an already-pinned thread", async () => {
    const onPin = vi.fn();
    renderSidebar({ onPin, threads: [thread({ pinned: true })] });
    await openMenu();

    // Scoped to the menu: a pinned thread also produces a "置顶" GROUP heading
    // in the list behind it, so an unscoped query would find that instead.
    const menu = openDropdown();
    expect(menu).not.toBeNull();
    expect(within(menu as HTMLElement).queryByText("置顶")).toBeNull();

    fireEvent.click(screen.getByText("取消置顶"));
    expect(onPin).toHaveBeenCalledWith("t1", false);
  });

  it("copies the conversation id", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderSidebar();
    await openMenu();
    fireEvent.click(await screen.findByText("复制会话 ID"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("t1"));
  });

  it("copies a share link that reopens this thread", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderSidebar();
    await openMenu();
    fireEvent.click(await screen.findByText("复制分享链接"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // Without `?thread=` the copied URL would not land on this conversation.
    expect(String(writeText.mock.calls[0][0])).toContain("thread=t1");
  });

  it("reports the thread to continue from", async () => {
    const onContinueInNew = vi.fn();
    renderSidebar({ onContinueInNew });
    await openMenu();
    fireEvent.click(await screen.findByText("在新对话中继续"));
    expect(onContinueInNew).toHaveBeenCalledWith("t1");
  });

  it("keeps the menu open when the pointer leaves the row for it", async () => {
    // THE bug this menu had: the dropdown renders into a portal, so reaching
    // for a menu item fires `mouseleave` on the row. When the trigger was
    // mounted on hover alone it unmounted at that moment and the menu vanished
    // out from under the cursor.
    renderSidebar();
    const row = rowOf("玉米 GS 研究");
    await openMenu();

    fireEvent.mouseLeave(row);
    for (const label of ["重命名", "归档对话", "删除"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("closes the menu after an item is chosen", async () => {
    renderSidebar();
    await openMenu();
    expect(openDropdown()).not.toBeNull();

    fireEvent.click(await screen.findByText("复制会话 ID"));
    await waitFor(() => expect(openDropdown()).toBeNull());
  });

  it("opens the rename dialog pre-filled with the current title", async () => {
    renderSidebar();
    fireEvent.mouseEnter(rowOf("玉米 GS 研究"));
    fireEvent.click(menuButton()!);
    fireEvent.click(await screen.findByText("重命名"));

    const input = (await screen.findByLabelText("会话名称")) as HTMLInputElement;
    expect(input.value).toBe("玉米 GS 研究");
  });

  it("saves a rename, and ignores an empty one", async () => {
    const onRename = vi.fn();
    renderSidebar({ onRename });
    fireEvent.mouseEnter(rowOf("玉米 GS 研究"));
    fireEvent.click(menuButton()!);
    fireEvent.click(await screen.findByText("重命名"));

    const input = (await screen.findByLabelText("会话名称")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    // A blank title would erase the thread's only label in the sidebar.
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.mouseEnter(rowOf("玉米 GS 研究"));
    fireEvent.click(menuButton()!);
    fireEvent.click(await screen.findByText("重命名"));
    const again = (await screen.findByLabelText("会话名称")) as HTMLInputElement;
    fireEvent.change(again, { target: { value: "玉米产量" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onRename).toHaveBeenCalledWith("t1", "玉米产量");
  });

  it("asks for confirmation before deleting, and only then deletes", async () => {
    const onDelete = vi.fn();
    renderSidebar({ onDelete });
    fireEvent.mouseEnter(rowOf("玉米 GS 研究"));
    fireEvent.click(menuButton()!);
    fireEvent.click(await screen.findByText("删除"));

    // Scoped to the dialog: antd renders a confirm's title twice (once visibly,
    // once for the label region), and the menu item that opened it may still be
    // in the DOM — so an unscoped query would be ambiguous rather than wrong.
    const dialog = await waitFor(() => {
      const node = document.querySelector(".ant-modal");
      if (!node) throw new Error("no dialog yet");
      return node as HTMLElement;
    });

    // The confirm names the thread, so the user knows what is about to go.
    expect(within(dialog).getAllByText("删除这个会话？").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/玉米 GS 研究/).length).toBeGreaterThan(0);
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("t1"));
  });
});
