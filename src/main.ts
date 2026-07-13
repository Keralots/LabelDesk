import { mount } from "svelte";
import "$/styles/tokens.css";
import App from "$/App.svelte";
import { configureFabric } from "$/defaults";

// Register custom fabric classes (TextboxExt) and control defaults before any
// canvas is created or JSON is deserialized, so loaded objects keep their type.
configureFabric();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
