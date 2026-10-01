# ABG Pricing Explorer interface

The React interface for the ABG underwriting workbench. The Python API in `../backend/` owns risk scoring and pricing calculations. See the [project guide](../README.md) for setup, model provenance, limitations, and verification.

From this directory:

```powershell
npm.cmd ci
npm.cmd run build
```

The production build is written to `dist/client/` and served by FastAPI from the project root. `npm.cmd start` starts that local Python service once its virtual environment and the client build are ready.

For interface development, start the Python API on `127.0.0.1:8011`, then run `npm.cmd run dev`. The preview runs on `127.0.0.1:5173` and proxies `/api` to Python. The preview uses Vinext; the production bundle uses Vite with `vite.export.config.ts`.

The `components/ui/` and `vendor/` directories contain the shared component styles. Dependencies, build outputs, environment files, and checkout-specific runtime state are ignored by Git. Optional starter integration helpers are retained but are not used by the pricing workbench. This app has no authentication or cloud deployment configured.
