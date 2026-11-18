import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { host } from "./lib/controller";

void host.init();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
