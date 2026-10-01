import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = process.env.ABG_PYTHON || path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
if (!existsSync(python)) throw new Error("Create the project .venv and install backend/requirements.txt first. See README.md.");
if (!existsSync(path.join(root, "abg-explorer/dist/client/index.html"))) throw new Error("Run npm run build in abg-explorer first.");
const child = spawn(python, ["-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8011"], { cwd: root, stdio: "inherit" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
