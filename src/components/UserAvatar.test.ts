import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import UserAvatar from "./UserAvatar.svelte";

describe("UserAvatar", () => {
  it("creates a readable default avatar from the contact name", () => {
    render(UserAvatar, { props: { name: "研发一号", seed: "peer-a" } });

    expect(screen.getByText("研发")).toBeInTheDocument();
  });

  it("uses a group mark for group conversations", () => {
    const { container } = render(UserAvatar, {
      props: { name: "项目协作群", seed: "group:project", group: true },
    });

    expect(screen.getByText("群")).toBeInTheDocument();
    expect(container.querySelector(".user-avatar")).toHaveClass("group");
  });

  it("renders a custom image when one is available", () => {
    const { container } = render(UserAvatar, {
      props: { name: "研发一号", image: "data:image/png;base64,avatar" },
    });

    expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,avatar");
    expect(screen.queryByText("研发")).not.toBeInTheDocument();
  });
});
