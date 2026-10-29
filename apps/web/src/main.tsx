import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import "./shared/styles/base.scss";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("The app root element is missing.");

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
