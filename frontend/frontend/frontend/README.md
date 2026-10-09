# SegregateGuard Frontend

A responsive, polished dashboard for the SegregateGuard FastAPI backend in `backend.zip`.

## What's included
- Responsive dashboard with eco score, inspections, accuracy and contamination metrics
- Image upload with drag-and-drop, image preview and webcam capture
- Connects to `POST /api/inspect/upload`, `GET /api/user/score` and `GET /health`
- AI inspection result card with recommended bin, remediation checklist, confidence, impact tip and points
- Local recent-scan activity, connection settings and sorting guide
- Demo fallback clearly labelled when the backend cannot be reached
- No build step or npm packages required

## Run it
1. Extract this folder.
2. Start the backend in a separate terminal using the backend's instructions:
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```
3. Serve this frontend folder using a local static server. For example:
   ```bash
   python -m http.server 5500
   ```
4. Open `http://localhost:5500`.
5. Click the ⚙ icon and set API URL to `http://localhost:8000`, then save.
6. Upload a waste photo or use the camera, select the current bin context, and click **Inspect item**.

Camera access generally requires `localhost` or HTTPS. If the frontend is hosted on another origin, make sure the backend CORS policy permits it.

## Important notes
- Demo fallback data is illustrative and is **not** a real image analysis. The result is labelled “Demo result · not live AI”.
- The frontend never includes AWS credentials. Keep AWS keys on the backend only.
- `GET /api/user/score` returns a score snapshot; actual persistence depends on the backend's DynamoDB configuration.
- For production, configure a specific CORS allowlist, authentication, file size limits and appropriate privacy messaging.
