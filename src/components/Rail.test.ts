import { render, screen, within } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Rail from "./Rail.svelte";

describe("Rail", () => {
  it("keeps notifications inside settings instead of exposing a separate rail entry", () => {
    render(Rail, {
      props: {
        activeSection: "messages",
      },
    });

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).queryByRole("button", { name: "通知" })).not.toBeInTheDocument();
  });
});
