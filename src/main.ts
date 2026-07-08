import { mount } from "svelte";
import App from "./App.svelte";
import "./styles.css";

window.addEventListener("contextmenu", (event) => event.preventDefault());

const target = document.getElementById("root");

if (!target) {
  throw new Error("App mount target #root was not found");
}

const app = mount(App, { target });

requestAnimationFrame(() => {
  document.getElementById("startup-shell")?.remove();
});

export default app;
