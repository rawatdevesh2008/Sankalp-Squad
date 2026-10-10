# Sankalp-Squad: ShieldBin
### Source-Level Waste & Contamination Inspector
**Bharat Builds Tour: Environmental Hacks (Track 03 - Waste and Energy)**  
Powered by **Amazon Bedrock (Claude 3.5 Sonnet Vision)**, **AWS Cedar Policy Engine (Open-Source)** & **Amazon DynamoDB**.

---

## 🌍 The Problem
Recycling systems fail at the source because mixed waste (e.g. food grease or unwashed plastics inside dry recyclable bins) cross-contaminates entire truckloads, forcing **over 70% of recyclable material directly into landfills**.

## 💡 The Solution
**ShieldBin** requires **zero custom hardware**—running directly on any smartphone or laptop webcam.
Citizens or facility workers point their camera at their waste bin before disposal:
1. **Live Visual Feature Extraction:** Amazon Bedrock (Claude 3.5 Sonnet Vision) extracts item material markings, cleanliness, and oil/grease saturation.
2. **Deterministic Law Enforcement via AWS Cedar Policy Engine:** Evaluates item attributes against official Government of India statutory mandates:
   - *MoEFCC Solid Waste Management Rules, 2016 (Rule 15 - Source Segregation)*
   - *CPCB E-Waste (Management) Rules, 2022/2024 (Schedule I - Lithium Battery & Electronics Ban)*
   - *MoHUA Swachh Bharat Mission (SBM-U 2.0) 3-Bin Color Standards*
3. **Real-time Bounding Box & Copilot Feedback:** 
   - 🟢 **Green Bounding Box (PERMIT):** Clean recyclable / compostable verified.
   - 🔴 **Red Bounding Box (FORBID):** Statutory cross-contamination detected.
   - 🤖 **AI Copilot & Voice Override:** Citizens can type or speak corrections (via Web Speech API) to re-evaluate edge cases.
4. **Gamified Ward/Household Scores:** Automatically increments user points and tracks contamination violations prevented in **Amazon DynamoDB**.

---

## 🏗️ Architecture

```mermaid
graph LR
    A[Webcam Stream] -->|Frame Base64 & Voice Prompt| B[FastAPI Engine]
    B -->|Visual Analysis| C[Amazon Bedrock: Claude 3.5 Sonnet]
    C -->|Visual Attributes| D[AWS Cedar Policy Engine]
    D -->|PERMIT / FORBID Verdict| B
    B -->|Audit Log & Eco Points| E[(Amazon DynamoDB)]
    B -->|Green/Red Box Overlay & Cedar Badge| A
```

---

## 📁 Repository Structure

```text
sankalp squad/
├── backend/                  # FastAPI Backend Service
│   ├── app/
│   │   ├── main.py           # REST API endpoints & CORS
│   │   ├── bedrock_service.py# Amazon Bedrock Claude Vision client
│   │   ├── dynamodb_service.py# DynamoDB audit logging & user score tracker
│   │   ├── models.py         # Pydantic schemas (BoundingBox, UserScore, etc.)
│   │   ├── prompts.py        # Indian SWM 2016 contamination prompts
│   │   └── config.py         # App configuration
│   ├── Dockerfile            # Container for AWS App Runner
│   ├── requirements.txt      # Python dependencies
│   ├── test_api.py           # Self-verifying test suite
│   └── README.md
├── .gitignore
└── README.md
```

---

## 🚀 Running the Backend Locally

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
Interactive API Docs available at: `http://localhost:8000/docs`
