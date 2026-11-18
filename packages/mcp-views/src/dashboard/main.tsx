import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { DashboardView } from "./dashboard-view";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <DashboardView />
  </StrictMode>,
);
