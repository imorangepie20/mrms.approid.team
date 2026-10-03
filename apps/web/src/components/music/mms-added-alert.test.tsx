import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MmsAddedAlert } from "./mms-added-alert";

afterEach(() => { vi.useRealTimers(); });

it("uses the template success toast and closes after exactly five seconds", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  render(<MmsAddedAlert title="First track" onClose={close} />);
  expect(screen.getByRole("status", {name:"추가되었습니다"})).toHaveClass("template-success-toast");
  act(() => vi.advanceTimersByTime(4999));
  expect(close).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(close).toHaveBeenCalledTimes(1);
});

it("allows the close button without taking focus or locking scrolling", () => {
  const close = vi.fn();
  render(<button>기존 포커스</button>);
  const previous = screen.getByRole("button",{name:"기존 포커스"});
  previous.focus();
  const overflow = document.body.style.overflow;
  render(<MmsAddedAlert title="Track" onClose={close} />);
  expect(previous).toHaveFocus();
  expect(document.body.style.overflow).toBe(overflow);
  fireEvent.click(screen.getByRole("button",{name:"알림 닫기"}));
  expect(close).toHaveBeenCalledTimes(1);
});

it("gives a newly accepted track another full five seconds and cleans up on unmount", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const view = render(<MmsAddedAlert title="First" onClose={close} />);
  act(() => vi.advanceTimersByTime(4000));
  view.rerender(<MmsAddedAlert title="Second" onClose={close} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(close).not.toHaveBeenCalled();
  view.unmount();
  act(() => vi.advanceTimersByTime(5000));
  expect(close).not.toHaveBeenCalled();
});
