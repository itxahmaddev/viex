import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { viewer } from "./lib/controller";

viewer.init();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
