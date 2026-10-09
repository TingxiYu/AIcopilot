// @vitest-environment jsdom
//
// Task 12 (final review) smoke test: render the REAL `App`.
//
// Every other test in this repo mounts a component in isolation. That is why the
// dark theme, the thread header and the run indicator were all absent from the
// app while the suite stayed green: a hook or component can be unit-tested to
// death and still never be called. The assertions here are therefore about
// WIRING — that `App` itself reaches these pieces — and they are written to fail
// if the corresponding call is removed from `App.tsx`.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { API_URL } from "../src/hooks/useThreadStream";

// The window mock below is deliberate: without it, `Client` in lib/... would hit
// a live backend from the test process. jsdom's own fetch is left in place --
// `useStream` needs `fetch`/`Response`/`ReadableStream` to exist, and the
// requests it makes reject (nothing listens on the port in CI) and are tolerated
// by the hook. Asserting on a live model call is explicitly out of scope.
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener() {},
    removeEventListener() {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  // The sidebar's thread search and the backend health probe both go over the
  // network. Stub both to reject so the render is deterministic (offline) rather
  // than racing a real connection refusal.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline in tests"))),
  );
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App shell", () => {
  it("renders the sidebar and the conversation, with the preview panel hidden", () => {
    const { container } = render(<App />);

    // The layout is now a nested antd Splitter rather than a fixed three-column
    // grid, so the shape is asserted by ARIA/role and by the panel's own
    // landmark rather than by a Tailwind class string. Pixel sizes are not
    // asserted anywhere in this file: jsdom reports every element as 0x0, so
    // Splitter-derived geometry is meaningless here and is checked in the
    // browser acceptance pass instead.
    expect(container.querySelector(".ant-splitter")).not.toBeNull();

    // Left column: the brand header and the new-thread control.
    expect(screen.getByText("AIcopilot")).toBeTruthy();
    expect(screen.getByText("＋ 新建")).toBeTruthy();

    // Middle column: an empty thread shows the welcome screen rather than a
    // blank pane, and shows NO title at all. `threadTitle` falls back to
    // "(空会话)" when there are no messages, and rendering that above a welcome
    // screen reads as a real title for a conversation that has not started.
    expect(screen.getByText("有什么可以帮你的？")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(container.textContent).not.toContain("空会话");

    // The welcome screen's shortcuts, and the always-available panel toggle.
    // Together these are the only routes back to a dismissed panel, so a
    // regression that removed either would strand the user.
    for (const label of ["上传数据", "GS 预测", "查看结果"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }

    // The config-driven suggestion cards. Asserting the configured titles (not
    // the count) is what pins the config to the screen: dropping a prompt in
    // QUICK_PROMPTS must show up here.
    for (const title of ["做玉米 GS 基因组预测", "解读 GWAS 结果", "群体 PCA 分析"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    // Right column: ABSENT. With no artifact and no tool result there is
    // nothing to preview, and the whole point of the remodel is that the panel
    // does not exist at all until there is.
    expect(screen.queryByLabelText("预览面板")).toBeNull();
  });

  it("keeps the right panel hidden until there is something to show in it", () => {
    // The counterpart of the assertion above: the toggle must still be
    // reachable, or a dismissed panel would be a dead end.
    render(<App />);
    expect(screen.getByRole("button", { name: "展开预览面板" })).toBeTruthy();
  });

  it("keeps the composer out of the welcome group, pinned in the footer", () => {
    // "The input never moves, and is not part of the welcome area" is a
    // structural property, and this is it. The whole welcome group — heading,
    // subtitle, feature buttons, suggestion cards — lives inside one centred
    // container; the composer lives outside it, in the fixed footer. Putting
    // the composer in that group would let the group's height push it around.
    const { container } = render(<App />);

    const zone = container.querySelector('[data-testid="welcome-zone"]');
    const scroll = container.querySelector('[data-testid="conversation-scroll"]');
    expect(zone).not.toBeNull();
    expect(scroll?.contains(zone)).toBe(true);

    // Everything the welcome page is made of sits in the one centred group...
    for (const node of [
      screen.getByText("有什么可以帮你的？"),
      screen.getByText("上传基因型与表型数据，或发起基因组预测、群体分析等科研任务"),
      screen.getByRole("button", { name: "上传数据" }),
      screen.getByText("做玉米 GS 基因组预测"),
    ]) {
      expect(zone?.contains(node)).toBe(true);
    }

    // ...and the composer is not among them.
    const composer = screen.getByPlaceholderText("提一个研究问题…");
    expect(zone?.contains(composer)).toBe(false);
    expect(scroll?.contains(composer)).toBe(false);
    expect(container.contains(composer)).toBe(true);
  });

  it("bounds the conversation column so the panel cannot scroll the composer away", () => {
    // A structural guard for a real bug: antd's Splitter panel is
    // `overflow: auto`, so a conversation grid free to grow past it makes the
    // PANEL the scroll container — and then messages scroll the composer out of
    // view along with them. `h-full` pins the grid to the panel and
    // `overflow-hidden` keeps it there, leaving the inner 1fr row as the only
    // thing that scrolls.
    //
    // jsdom has no layout, so this asserts the contract rather than the pixel
    // outcome; the visual check is in the browser acceptance pass.
    const { container } = render(<App />);
    const scroll = container.querySelector('[data-testid="conversation-scroll"]');

    let node: HTMLElement | null = scroll as HTMLElement | null;
    let grid: HTMLElement | null = null;
    while (node && !grid) {
      if (node.className.includes("grid-rows-")) grid = node;
      node = node.parentElement;
    }

    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("h-full");
    expect(grid?.className).toContain("min-h-0");
    expect(grid?.className).toContain("overflow-hidden");
  });

  it("renders the welcome screen instead of empty message bubbles", () => {
    // No conversation content means no bubbles of any kind — an empty AI
    // message that projected to no row would otherwise leave a blank pane.
    const { container } = render(<App />);
    expect(screen.getByText("有什么可以帮你的？")).toBeTruthy();
    expect(container.querySelectorAll("article").length).toBe(0);
  });

  it("mounts and unmounts the panel on toggle WITHOUT remounting the conversation", () => {
    // The requirement is that the panel is genuinely unmounted when hidden.
    // The risk that buys is real: if hiding it changed the tree shape above the
    // conversation column, React would remount that column on every toggle and
    // the user would lose their scroll position and their unsent draft. This
    // asserts the draft survives both directions, which is only true while the
    // panel stays the LAST Splitter.Panel and keeps index 0 stable.
    render(<App />);

    const box = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "半途写下的问题" } });
    expect(box.value).toBe("半途写下的问题");

    fireEvent.click(screen.getByRole("button", { name: "展开预览面板" }));
    expect(screen.getByLabelText("预览面板")).toBeTruthy();
    // Same element, same value: not a fresh composer.
    const afterOpen = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    expect(afterOpen).toBe(box);
    expect(afterOpen.value).toBe("半途写下的问题");

    fireEvent.click(screen.getByRole("button", { name: "收起预览面板" }));
    expect(screen.queryByLabelText("预览面板")).toBeNull();
    const afterClose = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    expect(afterClose).toBe(box);
    expect(afterClose.value).toBe("半途写下的问题");
  });

  it("renders the composer with an icon-only send button", () => {
    render(<App />);
    expect(screen.getByPlaceholderText("提一个研究问题…")).toBeTruthy();

    // Icon-only: the button must be addressable by its accessible name, since
    // there is no text to find it by.
    const send = screen.getByRole("button", { name: "发送" });
    expect(send.textContent).toBe("");
  });

  it("renders the theme toggle", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /主题/ })).toBeTruthy();
  });
});

describe("theme wiring (Finding 1)", () => {
  // This is the assertion the unit tests in theme.test.ts cannot make. It goes
  // through `App`, so it fails if `useTheme()` is dropped from App.tsx -- which
  // is exactly how the dark theme was dead code through a green suite.
  it("toggles the .dark class on <html> when the App's toggle is clicked", async () => {
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    render(<App />);
    const toggle = screen.getByRole("button", { name: /主题/ });

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("persists the choice across a remount", async () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /主题/ }));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(localStorage.getItem("aicopilot:theme")).toBe("dark");
    first.unmount();

    document.documentElement.classList.remove("dark");
    // A fresh mount must read the stored preference, not the (light) system one.
    stubMatchMedia(false);
    render(<App />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});

describe("connection state (Finding 3)", () => {
  it("names the configured API URL, not just a generic message", async () => {
    // The hook surfaces the URL it is configured with; assert the App renders
    // that exact string so the banner cannot drift from the connection target.
    expect(API_URL).toMatch(/^https?:\/\//);

    render(<App />);
    // The health probe rejects (fetch is stubbed), which is the reachability
    // signal the app has on a cold load.
    await waitFor(() => {
      expect(document.body.textContent).toContain(API_URL);
    });
  });
});

// Re-review Finding A. An earlier revision of the fix unmounted the entire
// middle column when `unreachable`, which took the composer with it: the user
// got a banner and no way to type. These assertions hold the column open.
describe("unreachable backend keeps the middle column usable (Finding A)", () => {
  /** Wait for the stubbed health probe to fail, i.e. the unreachable state. */
  async function untilUnreachable() {
    await waitFor(() => {
      expect(document.body.textContent).toContain("无法连接后端");
    });
  }

  it("still renders the composer, with the textarea typeable", async () => {
    render(<App />);
    await untilUnreachable();

    const box = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    // Present, and NOT disabled -- the user can still draft.
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: "为什么玉米产量下降？" } });
    expect(box.value).toBe("为什么玉米产量下降？");

    // The welcome content and the scroll region survive too, not just the
    // composer: an unreachable backend must not blank the page.
    expect(screen.getByText("有什么可以帮你的？")).toBeTruthy();
    expect(document.querySelector('[data-testid="conversation-scroll"]')).not.toBeNull();
  });

  it("refuses to send, and says why next to the composer", async () => {
    render(<App />);
    await untilUnreachable();

    const box = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "a question" } });

    const send = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    // Enter must not send either. A submit would clear the draft, so a
    // surviving value is proof the submit was refused.
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("a question");

    expect(document.body.textContent).toContain("后端不可达，暂时无法发送");
  });

  // The disabled controls above are only acceptable because there is a way out.
  // Without a working retry they would be a dead end until a page reload, so
  // this asserts the escape hatch recovers the UI, not merely that it renders.
  it("recovers the controls when the backend comes up and retry is pressed", async () => {
    let healthy = false;
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (input: unknown) =>
        healthy && String(input).endsWith("/ok")
          ? Promise.resolve({ ok: true })
          : Promise.reject(new Error("offline in tests")),
    );

    render(<App />);
    await untilUnreachable();
    expect(
      (screen.getByRole("button", { name: /新建/ }) as HTMLButtonElement).disabled,
    ).toBe(true);

    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: /新建/ }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });
    expect(document.body.textContent).not.toContain("无法连接后端");
  });
});

// Re-review Finding B. A thread is only created once the backend answers, so
// with no backend "new thread" could not do anything visible -- a click that
// silently no-ops. It is disabled and labelled instead.
describe("new thread gives feedback when unreachable (Finding B)", () => {
  it("disables the control and explains, rather than swallowing the click", async () => {
    render(<App />);
    const newThread = screen.getByRole("button", { name: /新建/ }) as HTMLButtonElement;
    // Reachable (or still checking) at first: the control is live.
    expect(newThread.disabled).toBe(false);

    await waitFor(() => {
      expect(
        (screen.getByRole("button", { name: /新建/ }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
    expect(document.body.textContent).toContain("后端不可达，无法新建会话");
  });
});
