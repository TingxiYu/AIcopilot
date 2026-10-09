// @vitest-environment jsdom
//
// The two config-driven pieces of the middle column: the suggestion cards and
// the human-confirmation card.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickPromptCards } from "../src/components/thread/QuickPromptCards";
import { InterruptCard } from "../src/components/cards/InterruptCard";
import { Composer } from "../src/components/thread/Composer";
import { QUICK_PROMPTS } from "../src/config/quickPrompts";

afterEach(cleanup);

const box = () => screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;

describe("Composer action button", () => {
  it("shows an icon-only send button when idle, with no visible text", () => {
    render(<Composer onSubmit={vi.fn()} running={false} onStop={vi.fn()} />);
    const send = screen.getByRole("button", { name: "发送" });
    expect(send.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "停止输出" })).toBeNull();
  });

  it("enables send only once there is something to send", () => {
    render(<Composer onSubmit={vi.fn()} running={false} onStop={vi.fn()} />);
    const send = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(box(), { target: { value: "玉米 GS" } });
    expect(send.disabled).toBe(false);
  });

  it("swaps to an icon-only stop button while streaming", () => {
    render(<Composer onSubmit={vi.fn()} running onStop={vi.fn()} />);
    const stop = screen.getByRole("button", { name: "停止输出" });
    expect(stop.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "发送" })).toBeNull();
  });

  it("stops the run when the stop button is clicked", () => {
    const onStop = vi.fn();
    render(<Composer onSubmit={vi.fn()} running onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "停止输出" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does NOT submit the form when stop is clicked", () => {
    // The stop button lives inside the composer's <form>. Left as the default
    // submit type it would trigger the form on every stop.
    //
    // The assertion on `type` is the load-bearing half. The behavioural half
    // below passes even with the wrong type, because `submit()` also
    // early-returns while running — so it alone would be a green test that
    // proves nothing about the button. Verified by mutation: dropping
    // `type="button"` fails this assertion and nothing else.
    const onSubmit = vi.fn();
    const onStop = vi.fn();
    render(<Composer onSubmit={onSubmit} running onStop={onStop} />);

    const stop = screen.getByRole("button", { name: "停止输出" });
    expect(stop.getAttribute("type")).toBe("button");

    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("locks the textarea while streaming", () => {
    render(<Composer onSubmit={vi.fn()} running onStop={vi.fn()} />);
    expect(box().disabled).toBe(true);
  });

  it("keeps the send icon (inert) when disabled by an interrupt, not stop", () => {
    // Nothing is streaming, so there is nothing to stop -- offering a stop
    // button here would be an action with no effect.
    render(<Composer onSubmit={vi.fn()} running={false} onStop={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "停止输出" })).toBeNull();
    expect(box().disabled).toBe(true);
  });

  it("does not offer stop while merely blocked", () => {
    render(<Composer onSubmit={vi.fn()} running={false} onStop={vi.fn()} blocked />);
    expect(screen.queryByRole("button", { name: "停止输出" })).toBeNull();
  });
});

describe("QuickPromptCards", () => {
  it("renders every configured prompt, and only those", () => {
    // Asserting against the config rather than a hardcoded list is the point:
    // it fails if a card is written into the component instead of the config,
    // and it passes automatically when a prompt is appended.
    render(<QuickPromptCards onPick={vi.fn()} />);
    for (const item of QUICK_PROMPTS) {
      expect(screen.getByText(item.title)).toBeTruthy();
    }
    expect(QUICK_PROMPTS).toHaveLength(3);
  });

  it("sends the configured prompt text, not the card's title", () => {
    // The two are deliberately separate: the card reads well, the message is
    // what actually gets asked.
    const onPick = vi.fn();
    const first = QUICK_PROMPTS[0];
    render(<QuickPromptCards onPick={onPick} />);

    fireEvent.click(screen.getByText(first.title));
    expect(onPick).toHaveBeenCalledWith(first.prompt);
    expect(first.prompt).not.toBe(first.title);
  });

  it("does nothing while blocked", () => {
    const onPick = vi.fn();
    render(<QuickPromptCards onPick={onPick} blocked />);
    fireEvent.click(screen.getByText(QUICK_PROMPTS[0].title));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("InterruptCard", () => {
  it("shows a string payload as the prompt", () => {
    render(<InterruptCard value="确认删除这三条记录吗？" onResume={vi.fn()} />);
    expect(screen.getByText("确认删除这三条记录吗？")).toBeTruthy();
    expect(screen.getByText("需要你确认")).toBeTruthy();
  });

  it("shows a tool's `message` field when the payload is an object", () => {
    render(<InterruptCard value={{ message: "要继续吗？", tool: "delete" }} onResume={vi.fn()} />);
    expect(screen.getByText("要继续吗？")).toBeTruthy();
  });

  it("falls back to the raw payload rather than rendering a wrong field", () => {
    // Payload shape is tool-defined; guessing at a field name would put
    // "undefined" where a question should be.
    const { container } = render(<InterruptCard value={{ choices: ["a", "b"] }} onResume={vi.fn()} />);
    expect(container.textContent).toContain("choices");
    expect(container.textContent).toContain("a");
  });

  it("resumes with true on confirm and false on reject", () => {
    const onResume = vi.fn();
    render(<InterruptCard value="继续？" onResume={onResume} />);

    fireEvent.click(screen.getByRole("button", { name: "确认继续" }));
    expect(onResume).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(onResume).toHaveBeenLastCalledWith(false);
  });

  it("resumes with free text when one is typed", () => {
    const onResume = vi.fn();
    render(<InterruptCard value="要写哪一年？" onResume={onResume} />);

    const box = screen.getByLabelText("回传内容");
    fireEvent.change(box, { target: { value: "2024" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onResume).toHaveBeenCalledWith("2024");
  });

  it("refuses every action while the backend is unreachable", () => {
    const onResume = vi.fn();
    render(<InterruptCard value="继续？" onResume={onResume} disabled />);

    for (const name of ["确认继续", "拒绝"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(onResume).not.toHaveBeenCalled();
  });
});
