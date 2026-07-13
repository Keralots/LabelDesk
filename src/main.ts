import { mount } from "svelte";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource-variable/noto-sans/wght.css";
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
