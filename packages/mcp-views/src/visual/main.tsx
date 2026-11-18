import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { VisualView } from "./visual-view";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <VisualView />
  </StrictMode>,
);
