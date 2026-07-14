import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app still works as a normal website if service worker registration fails.
    });
  });
}
