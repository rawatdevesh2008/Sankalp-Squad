# 🛡️ ShieldBin — Zero-Hardware Frontend (React + Vite)

Web camera client for **ShieldBin: Source-Level Waste & Contamination Inspector**.  
Deployed on **AWS Amplify**, connected to **AWS App Runner (FastAPI)**.

---

## ⚡ Features
* **Zero Hardware:** Runs directly on any laptop or smartphone browser via HTML5 WebRTC.
* **Interval Throttling:** Dispatches frames every 2.5 seconds to optimize Amazon Bedrock token costs and stay responsive.
* **Dynamic Bounding Box:** Renders green/red bounding boxes over the camera stream based on contamination analysis.
* **Real-Time Scoreboard:** Visualizes household green points, compliance accuracy %, and contamination prevention metrics from Amazon DynamoDB.

---

## 🚀 Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Create `.env` (or copy `.env.example`):
   ```env
   VITE_API_URL=http://localhost:8000
   ```

3. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## ☁️ Deployment to AWS Amplify

Add this `amplify.yml` build specification in the AWS Amplify Console:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```
