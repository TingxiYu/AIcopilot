// @vitest-environment jsdom
//
// Finding 4 / spec §4.5.3: the conversation stays pinned to the bottom as new
// content streams in, UNLESS the user has scrolled up.
//
// jsdom does not lay anything out, so `scrollHeight`/`clientHeight` are always 0
// and a real scroll can never happen. Every test below therefore defines those
// two as own accessor properties on the element before dispatching a scroll,
// which is what a browser would have reported. Without that the assertions would
// pass vacuously -- the hook would see "already at the bottom" no matter what,
// which is the exact class of test this repo has been burned by.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useStickToBottom } from "../src/hooks/useStickToBottom";

afterEach(cleanup);

/** Give an element the geometry jsdom will not compute, then scroll it. */
function setGeometry(el: HTMLElement, { scrollHeight, clientHeight }: {
  scrollHeight: number;
  clientHeight: number;
}) {
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
}

function Harness({ content }: { content: string }) {
  const { ref, pinned } = useStickToBottom<HTMLDivElement>([content]);
  return (
    <div>
      <div ref={ref} data-testid="scroller" className="overflow-auto" style={{ height: 100 }}>
        <div style={{ height: content.length * 10 }}>{content}</div>
      </div>
      <span data-testid="pinned">{pinned ? "yes" : "no"}</span>
    </div>
  );
}

describe("useStickToBottom", () => {
  it("pins to the bottom when content grows and the user is at the bottom", () => {
    const { getByTestId, rerender } = render(<Harness content="a" />);
    const el = getByTestId("scroller");
    setGeometry(el, { scrollHeight: 500, clientHeight: 100 });

    expect(getByTestId("pinned").textContent).toBe("yes");
    rerender(<Harness content="abcdefghij" />);

    // scrollTop was driven to the full height, i.e. the newest content is shown.
    expect(el.scrollTop).toBe(500);
  });

  it("does NOT jump to the bottom after the user scrolls up", () => {
    const { getByTestId, rerender } = render(<Harness content="a" />);
    const el = getByTestId("scroller");
    setGeometry(el, { scrollHeight: 500, clientHeight: 100 });

    // The user scrolls up: 100px sits well outside the 8px tolerance.
    el.scrollTop = 100;
    fireEvent.scroll(el);
    expect(getByTestId("pinned").textContent).toBe("no");

    // Fresh content arrives while they are reading. This is the assertion the
    // whole finding turns on: it must NOT move them.
    rerender(<Harness content="abcdefghij" />);
    expect(el.scrollTop).toBe(100);
  });

  it("re-engages when the user scrolls back to the bottom", () => {
    const { getByTestId, rerender } = render(<Harness content="a" />);
    const el = getByTestId("scroller");
    setGeometry(el, { scrollHeight: 500, clientHeight: 100 });

    el.scrollTop = 100;
    fireEvent.scroll(el);
    expect(getByTestId("pinned").textContent).toBe("no");

    // Back to the very bottom.
    el.scrollTop = 400; // 500 - 400 - 100 === 0
    fireEvent.scroll(el);
    expect(getByTestId("pinned").textContent).toBe("yes");

    // And the pin is live again.
    rerender(<Harness content="abcdefghijkl" />);
    expect(el.scrollTop).toBe(500);
  });

  it("tolerates sub-pixel shortfall when re-engaging", () => {
    // Real layout leaves the distance a pixel or two above zero at the true
    // bottom; a zero tolerance would refuse to re-engage there.
    const { getByTestId } = render(<Harness content="a" />);
    const el = getByTestId("scroller");
    setGeometry(el, { scrollHeight: 500, clientHeight: 100 });

    el.scrollTop = 393; // 500 - 393 - 100 === 7 <= 8
    fireEvent.scroll(el);
    expect(getByTestId("pinned").textContent).toBe("yes");
  });
});
