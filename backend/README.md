# 🛡️ SegregateGuard — Backend Service

**AI-Powered Waste & Contamination Inspection Engine**  
Built for the **Bharat Builds Tour: Environmental Hacks (Track 03 - Waste and Energy)**  
Powered by **Amazon Bedrock (Claude 3.5 Sonnet Vision)** & **Amazon DynamoDB**, deployed on **AWS App Runner**.

---

## 📖 What Does Your Backend Do?

As the backend developer of the team, your service performs 4 key jobs:
1. **Receives Camera Frames:** Frontend sends a Base64-encoded image frame captured from a smartphone or laptop camera.
2. **Audits Contamination with Claude 3.5 Sonnet:** Amazon Bedrock inspects the image for food grease, leftover liquids, unseparated caps, and material types.
3. **Applies SWM 2016 Rules:** Determines the correct bin color (`Blue`, `Green`, `Black`, `Red`, `Yellow`), single action required, and awards green points (gamification).
4. **Logs to Amazon DynamoDB:** Generates an audit trail of inspection records with unique `scan_id` for municipal and hackathon analytics.

---

## 🚀 How to Run Locally

### 1. Start the Server
In PowerShell:
```powershell
cd "c:\Users\pc\OneDrive\Desktop\sankalp squad\backend"
python -m uvicorn app.main:app --reload --port 8000
```
Server runs at: **http://localhost:8000**

### 2. Test in Browser (Swagger UI)
Visit: **[http://localhost:8000/docs](http://localhost:8000/docs)**  
You can test the endpoints right from the browser.

### 3. Run Automated Tests
```powershell
python test_api.py
```
*(All tests pass and self-verify the Bedrock pipeline & DynamoDB logger)*

---

## 📡 API Contract (Give this to your Frontend Teammate)

### `POST /api/inspect`
**Request Body (JSON):**
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "location_context": "India - Municipal Solid Waste"
}
```

**Response (JSON):**
```json
{
  "success": true,
  "item_detected": "Plastic Water Bottle",
  "category": "Dry Recyclable",
  "is_contaminated": true,
  "contamination_reason": "Contains leftover liquid and cap attached",
  "correct_bin": "Blue Bin (Recyclables)",
  "bin_color": "Blue",
  "action_required": "Empty liquid completely and replace cap before discarding",
  "points_awarded": 10,
  "scan_id": "scan_aeea87524914",
  "material": "Polyethylene Terephthalate (PET #1)",
  "remediation_steps": [
    "Empty any remaining liquid into a drain",
    "Crush bottle flat to save 70% bin volume",
    "Place flattened bottle in Blue Bin"
  ],
  "confidence_score": 0.98,
  "environmental_impact_tip": "Recycling PET plastic saves up to 60% of the energy required to manufacture virgin plastic.",
  "engine_source": "Amazon Bedrock (anthropic.claude-3-5-sonnet-20250219-v1:0)",
  "timestamp": "2026-10-07T15:29:14.689Z"
}
```

### Other Available Endpoints:
- `POST /api/inspect/upload` — Direct multipart file upload.
- `GET /api/categories` — Official Indian SWM 2016 bin definitions.
- `GET /health` — AWS App Runner health check.

---

## 🔑 AWS Bedrock & DynamoDB Integration

- **Offline / Local Simulation:** If AWS keys are not yet configured, the backend automatically uses the built-in simulation engine. Your frontend team is **never blocked**!
- **Enabling Live AWS Services:**
  Add your AWS keys to [backend/.env](file:///c:/Users/pc/OneDrive/Desktop/sankalp%20squad/backend/.env):
  ```env
  AWS_REGION=us-east-1
  AWS_ACCESS_KEY_ID=AKIA...
  AWS_SECRET_ACCESS_KEY=...
  BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20250219-v1:0
  DYNAMODB_TABLE_NAME=SegregateGuard_Scans
  ```

---

## 🚢 Deploying to AWS App Runner

1. Push your repository to GitHub.
2. In AWS Console, go to **AWS App Runner** -> **Create Service**.
3. Choose **Source code repository** and pick `backend`.
4. Set configuration:
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port 8000`
   - **Port:** `8000`
5. Under **Security**, attach an IAM role with policies:
   - `AmazonBedrockFullAccess`
   - `AmazonDynamoDBFullAccess`
6. Click **Deploy**. App Runner will deploy your container and provide a live public HTTPS URL!
