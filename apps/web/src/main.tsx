import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("CAREER_NAVIGATOR_WEB_ROOT_NOT_FOUND");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
