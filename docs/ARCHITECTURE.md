# ShieldBin: Cloud Architecture & Technical Specifications
### Source-Level Waste & Contamination Inspector
**Bharat Builds Tour: Environmental Hacks (Track 03 - Waste and Energy)**  
Powered by **Amazon Bedrock (Claude 3.5 Sonnet Vision)** & **Amazon DynamoDB**, deployed on **AWS App Runner + AWS Amplify**.

---

## 1. System Flow & End-to-End Architecture

```mermaid
graph TD
    subgraph Client["Zero-Hardware Client (Browser / PWA)"]
        Cam["Webcam Capture<br/>(Mobile / Laptop Camera)"]
        Overlay["Canvas Overlay<br/>(Green / Red Bounding Box)"]
        Board["Scoreboard UI<br/>(Points & Ward Stats)"]
    end

    subgraph Hosting["AWS Amplify Edge"]
        Amp["Amplify Hosting<br/>(React + Vite SPA)"]
    end

    subgraph Compute["AWS App Runner Container"]
        Fwd["FastAPI Web Service<br/>(app/main.py)"]
        Auth["CORS & Request Validator<br/>(app/models.py)"]
        BedrockSvc["Bedrock Runtime Client<br/>(app/bedrock_service.py)"]
        DdbSvc["DynamoDB Client<br/>(app/dynamodb_service.py)"]
    end

    subgraph AI["Foundation Model Layer"]
        Claude["Amazon Bedrock<br/>Claude 3.5 Sonnet Vision<br/>(anthropic.claude-3-5-sonnet-20250219-v1:0)"]
    end

    subgraph Database["Persistent Data Layer"]
        DdbScans[("Amazon DynamoDB<br/>Table: ShieldBin_Scans<br/>PK: scan_id")]
        DdbScores[("Amazon DynamoDB<br/>Table: ShieldBin_Scans_Scores<br/>PK: user_id")]
    end

    Cam -->|1. Base64 Frame (Throttled 2-3s)| Amp
    Amp -->|2. HTTPS POST /api/inspect| Fwd
    Fwd --> Auth
    Auth --> BedrockSvc
    BedrockSvc -->|3. InvokeModel (Image + Prompt)| Claude
    Claude -->|4. JSON: BoundingBox + Contamination| BedrockSvc
    BedrockSvc --> Fwd
    Fwd -->|5. Log Scan Record| DdbSvc
    DdbSvc -->|PutItem| DdbScans
    DdbSvc -->|Update User Points & Accuracy| DdbScores
    Fwd -->|6. JSON Response (Box + Advice + Score)| Overlay
    Overlay -->|Draw 🟢 Green / 🔴 Red Box| Cam
    Fwd -->|User Score Data| Board
```

---

## 2. Component Implementation Table

| Cloud Service | System Role | Repository File | Description |
| :--- | :--- | :--- | :--- |
| **AWS Amplify** | Frontend Hosting & CDN | `frontend/` | Hosts the React + Vite zero-hardware camera interface, handles WebRTC stream, renders overlay. |
| **AWS App Runner** | Managed Container Compute | `backend/app/main.py`<br/>`backend/Dockerfile` | Auto-scaling container running FastAPI with CORS, input sanitization, Base64 decoding, and error recovery. |
| **Amazon Bedrock** | Multi-Modal Vision Inference | `backend/app/bedrock_service.py`<br/>`backend/app/prompts.py` | Invokes Claude 3.5 Sonnet Vision via `boto3.client('bedrock-runtime')` with SWM 2016 contamination auditing prompts. |
| **Amazon DynamoDB** | Audit Logging & User Ledger | `backend/app/dynamodb_service.py` | Stores timestamped inspection audit records and maintains live household/ward scores, streaks, and accuracy metrics. |
| **Amazon CloudWatch** | Observability & Monitoring | `backend/Dockerfile` | Captures App Runner container logs, health check statuses (`/health`), and Bedrock latency metrics. |

---

## 3. Numbered Request Lifecycle (Step-by-Step)

### Step 1: Frame Acquisition (Client)
* The client camera captures a video frame every **2–3 seconds** via HTML5 `<video>` and renders it to an offscreen `<canvas>`.
* The canvas downscales the frame to max resolution ($640 \times 480$) and exports a compressed JPEG Base64 string.

### Step 2: Inspection Dispatch (`POST /api/inspect`)
The frontend dispatches an asynchronous HTTP POST request to the FastAPI App Runner backend.

**Request Payload (`InspectRequest`):**
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "target_bin": "Dry Recyclable",
  "user_id": "household_402",
  "ward_id": "Ward-12 (Delhi)",
  "location_context": "India - Municipal"
}
```

### Step 3: Backend Ingestion & Sanitization
* `app/main.py` validates the request body using `pydantic`.
* Strips data URI headers (`data:image/jpeg;base64,`).
* Fixes any missing Base64 modulo-4 padding automatically.
* Converts Base64 string to raw binary JPEG bytes.

### Step 4: Amazon Bedrock Inference
* `app/bedrock_service.py` constructs the Anthropic Claude 3.5 Messages API payload:
  * **Media Type:** `image/jpeg`
  * **System Persona:** Indian Solid Waste Management (SWM 2016) municipal inspector.
  * **Task:** Identify material, inspect for grease/liquid/composite contamination, verify against `target_bin`, compute normalized bounding box (`[ymin, xmin, ymax, xmax]`), determine `box_color` (`"green"` or `"red"`), and compute gamification points.
* Invokes `bedrock-runtime.invoke_model` with `anthropic.claude-3-5-sonnet-20250219-v1:0`.

### Step 5: DynamoDB Persistence & Score Update
* `app/dynamodb_service.py` receives the structured inference result.
* Generates a unique audit identifier: `scan_id = "scan_" + uuid4().hex[:12]`.
* Persists the audit record into `ShieldBin_Scans`.
* Performs a transactional update on `ShieldBin_Scans_Scores` for `user_id`:
  * Increments `total_scans` by 1.
  * Adjusts `total_points` by `points_awarded` (+15 for clean, +10 for remediated, -5 for cross-contamination).
  * If contaminated, increments `contamination_prevented`.
  * Recalculates `segregation_accuracy_pct = (correct_scans / total_scans) * 100`.

### Step 6: Response Delivery & Canvas Overlay
The backend returns `InspectionResponse` with HTTP 200 OK.

**Response Payload (`InspectionResponse`):**
```json
{
  "success": true,
  "item_detected": "Greasy Cardboard Pizza Box",
  "category": "Sanitary / Landfill",
  "is_contaminated": true,
  "is_segregation_correct": false,
  "box_color": "red",
  "bounding_box": {
    "ymin": 180,
    "xmin": 210,
    "ymax": 790,
    "xmax": 810
  },
  "contamination_reason": "Severe cheese grease and tomato sauce oil absorbed into cellulose paper fibers",
  "correct_bin": "Black Bin (Landfill / Soiled Waste)",
  "bin_color": "Black",
  "action_required": "Greasy pizza box detected in dry paper bin — move to organic/landfill",
  "points_awarded": -5,
  "user_score": {
    "user_id": "household_402",
    "ward_id": "Ward-12 (Delhi)",
    "total_points": 95,
    "total_scans": 1,
    "correct_scans": 0,
    "contamination_prevented": 1,
    "segregation_accuracy_pct": 0.0,
    "last_updated": "2026-10-08T15:45:00.000000+00:00"
  },
  "material": "Corrugated Cardboard (Grease-Soaked)",
  "remediation_steps": [
    "Tear off clean dry lid and drop in Blue Bin",
    "Discard greasy food-stained bottom section into Black Bin"
  ],
  "confidence_score": 0.96,
  "environmental_impact_tip": "Greasy pizza boxes in dry paper bins ruin 70%+ of recyclables by contaminating the water pulper.",
  "engine_source": "Amazon Bedrock (anthropic.claude-3-5-sonnet-20250219-v1:0)",
  "scan_id": "scan_8006729a16ac",
  "timestamp": "2026-10-08T15:45:00.000000+00:00"
}
```

* The frontend receives the response and maps normalized coordinates (`0-1000`) to canvas dimensions:
  $$x = \frac{\text{xmin}}{1000} \times \text{canvasWidth}, \quad y = \frac{\text{ymin}}{1000} \times \text{canvasHeight}$$
* Renders a 4px bounding box: **Green (`#22c55e`)** if correct, **Red (`#ef4444`)** if contaminated.

---

## 4. DynamoDB Data Model

### Table 1: `ShieldBin_Scans` (Audit Trail)
* **Purpose:** Immutable audit log of every inspection frame analyzed.
* **Partition Key (PK):** `scan_id` (String, e.g., `scan_8006729a16ac`)
* **Sort Key (SK):** *None* (or optional `timestamp` for range queries)

| Attribute | Type | Description |
| :--- | :---: | :--- |
| `scan_id` | **String (PK)** | Unique scan identifier |
| `timestamp` | String | ISO-8601 UTC timestamp |
| `user_id` | String | Household or facility identifier |
| `ward_id` | String | Municipal zone / Ward name |
| `item_detected` | String | Object name identified by Bedrock |
| `category` | String | Stream category (Dry Recyclable, Wet Organic, etc.) |
| `is_contaminated` | Boolean | True if food grease, moisture, or mixed trash detected |
| `is_segregation_correct` | Boolean | True if item matches selected bin |
| `correct_bin` | String | Prescribed SWM 2016 bin |
| `action_required` | String | Specific user action |
| `points_awarded` | Number | Points delta (+15, +10, -5) |

### Table 2: `ShieldBin_Scans_Scores` (User & Ward Ledger)
* **Purpose:** Real-time state of household scores and ward leaderboards.
* **Partition Key (PK):** `user_id` (String, e.g., `household_402`)

| Attribute | Type | Description |
| :--- | :---: | :--- |
| `user_id` | **String (PK)** | Unique household/citizen identifier |
| `ward_id` | String | Municipal ward for aggregate reporting |
| `total_points` | Number | Accumulated green points balance |
| `total_scans` | Number | Lifetime scans performed |
| `correct_scans` | Number | Count of compliant segregations |
| `contamination_prevented` | Number | Count of cross-contaminations stopped |
| `segregation_accuracy_pct` | Number | Real-time compliance percentage |
| `last_updated` | String | Timestamp of latest scan |

### Key Access Patterns:
1. **Record Scan:** `PutItem` on `ShieldBin_Scans` with `scan_id`.
2. **Retrieve Household Score:** `GetItem` on `ShieldBin_Scans_Scores` with `Key={"user_id": user_id}`.
3. **Update Household Score:** `PutItem` / `UpdateItem` on `ShieldBin_Scans_Scores` after each scan.

---

## 5. Security & Cost Optimization

### ① IAM Least-Privilege Policy (AWS App Runner Instance Role)
Instead of hardcoding long-lived access keys, the App Runner service is assigned an IAM role with strictly bounded permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockVisionInvoke",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-*",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-*"
      ]
    },
    {
      "Sid": "DynamoDBTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/ShieldBin_Scans",
        "arn:aws:dynamodb:*:*:table/ShieldBin_Scans_Scores"
      ]
    }
  ]
}
```

### ② CORS Configuration
* **Development:** Enabled for `*` in `backend/app/main.py` for local developer flexibility.
* **Production Deployment:** Restricted to the authorized AWS Amplify frontend origin:
  ```python
  allow_origins=["https://main.d1234567890.amplifyapp.com", "http://localhost:5173"]
  ```

### ③ Bedrock Cost Control & Frame Rate Throttling
Multi-modal vision calls consume input tokens for image tiles. Uncontrolled 30 FPS video streaming would invoke $1,800$ model calls per minute.
* **Client-Side Interval Throttling:** The client enforces an interval of **1 frame every 2.5 seconds** ($0.4$ Hz) only while active waste disposal is in progress.
* **Image Compression & Downscaling:** Video frames are scaled to a maximum bounding box of $640 \times 480$ pixels at $75\%$ JPEG quality. This reduces payload size from $>3\text{ MB}$ to $<40\text{ KB}$ per frame, consuming only $\sim 1,000$ vision tokens per inspection ($\sim \$0.003$ per inspection on Claude 3.5 Sonnet, or $\$0.00025$ on Claude 3 Haiku).
* **Automatic Offline/Simulation Fallback:** If AWS credentials are not configured or daily Bedrock quotas are exceeded, the backend automatically transitions to high-fidelity simulation mode to prevent service denial.
