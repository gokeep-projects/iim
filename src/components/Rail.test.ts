import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Rail from "./Rail.svelte";

describe("Rail unread badge", () => {
  it("shows a capped unread badge on the message entry with readable Chinese navigation labels", () => {
    render(Rail, {
      props: {
        unreadCount: 128,
        onSelect: vi.fn(),
        onToggleTheme: vi.fn()
      }
    });

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByLabelText("灵犀内网通")).toBeInTheDocument();

    const messages = screen.getByRole("button", { name: /消息/ });
    expect(within(messages).getByText("99+")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /联系人/ })).not.toHaveTextContent("99+");
    expect(screen.getByRole("button", { name: "文件" })).toHaveAttribute("title", "文件传输");
    expect(screen.getByRole("button", { name: "设置" })).toHaveAttribute("title", "设置");
    expect(screen.getByRole("button", { name: "通知" })).toHaveAttribute("title", "通知");
    expect(screen.getByRole("button", { name: "深色" })).toHaveAttribute("title", "切换主题");
  });
});
