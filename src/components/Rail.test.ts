import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Rail from "./Rail.svelte";

describe("Rail", () => {
  it("uses iim fallback branding when no avatar label is provided", () => {
    render(Rail);

    expect(screen.getByRole("button", { name: "打开个人菜单" })).toHaveTextContent("i");
  });

  it("keeps notifications inside settings instead of exposing a separate rail entry", () => {
    render(Rail, {
      props: {
        activeSection: "messages",
      },
    });

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).queryByRole("button", { name: "通知" })).not.toBeInTheDocument();
  });

  it("keeps theme switching inside settings instead of exposing a rail shortcut", () => {
    render(Rail, {
      props: {
        activeSection: "messages",
      },
    });

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).queryByRole("button", { name: "切换主题" })).not.toBeInTheDocument();
    expect(within(navigation).queryByText("深色")).not.toBeInTheDocument();
    expect(within(navigation).queryByText("浅色")).not.toBeInTheDocument();
  });
});
