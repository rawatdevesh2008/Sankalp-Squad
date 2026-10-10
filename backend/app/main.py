import base64
import json
import logging
import re
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import (
    InspectionResult,
    InspectionResponse,
    InspectRequest,
    BoundingBox,
    CategoryInfo,
    UserScore,
    CopilotChatRequest,
    CopilotChatResponse,
)
from app.bedrock_service import bedrock_service
from app.dynamodb_service import dynamodb_service
from app.cedar_service import cedar_engine
from app.prompts import clean_and_parse_json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("shieldbin.api")

app = FastAPI(
    title="ShieldBin API",
    description=(
        "Source-Level Waste & Contamination Inspection Engine powered by "
        "Amazon Bedrock (Claude Vision) and Amazon DynamoDB. Deployed on AWS App Runner."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for all origins (Amplify frontend, localhost, mobile cameras)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# Universal Bedrock System Prompt: Multi-Modal Waste & Contamination Auditor
# ==============================================================================
SYSTEM_INSPECTOR_PROMPT = """
You are ShieldBin AI, an unconstrained, universal AI vision and global web-knowledge audit system powered by Amazon Bedrock (Claude 3.5 Sonnet).
You act as an advanced multi-modal waste and environmental contamination auditor using your vast global product, material, consumer packaging, and waste management knowledge base.

==================================================
1. EMPTY FRAME RULE (STRICT WAITING STATE)
==================================================
If the image shows only hands, fingers, background walls, an empty desk, floor, or no clear primary object:
- You must return item_detected: "None" with correct_bin: "Waiting for Item...".
- Do NOT hallucinate items or classify empty space, walls, or hands as food, cardboard, or waste.
- In this empty frame scenario, return ONLY this exact JSON structure:
{
  "item_detected": "None",
  "category": "N/A",
  "is_contaminated": false,
  "contamination_reason": "No clear waste item detected in the camera frame.",
  "action_required": "Please place an item clearly in front of the lens.",
  "correct_bin": "Waiting for Item...",
  "points_awarded": 0
}

==================================================
2. DYNAMIC AI ANALYSIS & GLOBAL WEB KNOWLEDGE
==================================================
For any real item held up or presented (whether a mobile phone, electronic device, plastic container, organic food waste, beverage can, cardboard packaging, battery, cable, or medical item):
- Use deep visual feature extraction to identify the exact product class, brand/material markings, and physical attributes.
- Ignore human hands, fingers, or background desk/room clutter; focus entirely on the physical item being audited.
- Assess cleanliness, grease stains, oil saturation, sour residues, or hazardous composition.
- Dynamically deduce safe disposal protocols, remediation steps, and appropriate target bins.
- Electronic Devices & E-Waste Rule:
  * If an electronic device (mobile phone, tablet, battery, charger, circuit board) is visible, NEVER classify it as food, cardboard, or a milk pouch.
  * Explicitly recognize it as an electronic or hazardous item.
  * Set is_contaminated: true due to lithium-ion batteries and toxic heavy metals.
  * Direct it to "Specialized E-Waste Drop-off Center".

==================================================
3. STRICT JSON OUTPUT STRUCTURE
==================================================
Respond strictly with RAW VALID JSON. Do NOT output markdown code blocks (e.g. ```json or ```) and do NOT provide any conversational introduction or closing text.

Your response MUST match this exact schema:
{
  "item_detected": "Exact name of the item observed",
  "category": "Material category (e.g., E-Waste, Organic, Recyclable Plastic, Hazardous, Paper)",
  "is_contaminated": true,
  "contamination_reason": "Detailed reason explaining why it is clean or contaminated based on visual inspection",
  "action_required": "Step-by-step safe disposal or cleaning instructions",
  "correct_bin": "Target bin or specialized recycling center name",
  "points_awarded": 0
}
"""


def get_inspection_prompt(target_bin: str = "Dry Recyclable", location_context: str = "India - Municipal") -> str:
    return (
        f"{SYSTEM_INSPECTOR_PROMPT}\n\n"
        f"USER CONTEXT:\n"
        f"- Target Bin being scanned: '{target_bin}'\n"
        f"- Location Context: '{location_context}'\n\n"
        f"Inspect the image frame and output the raw JSON:"
    )

INDIAN_WASTE_CATEGORIES = [
    CategoryInfo(
        category="Dry Recyclable",
        bin_color="Blue",
        bin_name="Blue Bin (Recyclables)",
        examples=["Clean paper", "Cardboard boxes", "Plastic bottles", "Aluminium cans", "Glass jars"],
        rule="Must be CLEAN and DRY. Contamination with food grease or moisture ruins recyclability.",
    ),
    CategoryInfo(
        category="Wet Organic",
        bin_color="Green",
        bin_name="Green Bin (Compost / Wet Waste)",
        examples=["Vegetable peels", "Cooked food scraps", "Fruit skins", "Tea leaves", "Coffee grounds"],
        rule="Compostable organic matter. Do NOT dispose inside sealed non-biodegradable plastic bags.",
    ),
    CategoryInfo(
        category="E-Waste",
        bin_color="Yellow",
        bin_name="Yellow Bin (E-Waste)",
        examples=["Charger cables", "Old phones", "Batteries", "Earphones", "Circuit boards"],
        rule="Hand over to authorized electronic waste recyclers or dedicated e-waste kiosks.",
    ),
    CategoryInfo(
        category="Domestic Hazardous",
        bin_color="Red",
        bin_name="Red Bin (Hazardous)",
        examples=["Aerosol spray cans", "Paints", "Pesticides", "Broken glass", "Tube lights"],
        rule="Potentially toxic, flammable, or sharp. Requires segregated handling to protect sanitation workers.",
    ),
    CategoryInfo(
        category="Sanitary / Landfill",
        bin_color="Black",
        bin_name="Black Bin (Landfill / Inert)",
        examples=["Diapers", "Sanitary pads", "Heavily soiled grease paper", "Multi-material unrecyclable trash"],
        rule="Non-recoverable reject waste sent to scientific sanitary landfills.",
    ),
]


@app.get("/")
def root():
    """Welcome endpoint providing health status and interactive documentation links."""
    return {
        "project": "ShieldBin",
        "tagline": "AI Waste & Contamination Inspector for AWS Environmental Hacks",
        "track": "Track 03 - Waste and Energy",
        "core_demo": "Live webcam stream -> green/red bounding box -> user score in DynamoDB",
        "status": "online",
        "docs_url": "/docs",
        "health_check": "/health",
        "categories_url": "/api/categories",
        "cloud_architecture": {
            "compute": "AWS App Runner",
            "foundation_model": f"Amazon Bedrock ({settings.BEDROCK_MODEL_ID})",
            "database": f"Amazon DynamoDB ({settings.DYNAMODB_TABLE_NAME})",
            "policy_engine": "AWS Cedar (MoEFCC SWM 2016 & CPCB E-Waste Rules 2022)"
        }
    }


@app.get("/health")
def health_check():
    """
    AWS App Runner health check endpoint.
    Returns 200 OK when service is running.
    """
    is_dummy_key = any(p in (settings.AWS_ACCESS_KEY_ID or "").lower() for p in ["your_aws", "placeholder"])
    is_bedrock_configured = bool(settings.AWS_ACCESS_KEY_ID and not is_dummy_key and bedrock_service._client is not None)
    return {
        "status": "healthy",
        "service": "ShieldBin-Backend",
        "bedrock_configured": is_bedrock_configured,
        "mock_mode": settings.USE_MOCK_BEDROCK or not is_bedrock_configured,
        "model_id": settings.BEDROCK_MODEL_ID,
        "region": settings.AWS_REGION,
        "dynamodb_table": settings.DYNAMODB_TABLE_NAME,
    }


def get_waiting_state_result() -> InspectionResult:
    """Helper returning strict waiting state JSON when no object or frame is empty."""
    return InspectionResult(
        item_detected="None",
        category="N/A",
        is_contaminated=False,
        is_segregation_correct=True,
        box_color="green",
        bounding_box=BoundingBox(ymin=0, xmin=0, ymax=0, xmax=0),
        contamination_reason="No clear waste item detected in the camera frame.",
        action_required="Please place an item clearly in front of the lens.",
        correct_bin="Waiting for Item...",
        bin_color="Gray",
        points_awarded=0,
        material="None",
        remediation_steps=["Please place an item clearly in front of the lens."],
        confidence_score=0.99,
        environmental_impact_tip="Position the waste item clearly in front of the lens to audit material and cleanliness.",
        engine_source="ShieldBin Frame Validator",
    )


@app.post("/api/inspect", response_model=InspectionResult)
async def inspect_waste(payload: InspectRequest):
    """
    Primary endpoint requested by frontend:
    Accepts Base64-encoded image frame from webcam/smartphone,
    runs Amazon Bedrock Claude Vision inspection, logs audit record and updates
    user/ward segregation score in DynamoDB, and returns green/red bounding box overlay.
    """
    try:
        raw_input = (payload.image_base64 or "").strip()

        # 1. Base64 & Frame Validation:
        # Ensure endpoint strips any data URI prefix (e.g. "data:image/jpeg;base64,")
        media_type = "image/jpeg"
        if "," in raw_input:
            header, b64_part = raw_input.split(",", 1)
            header_lower = header.lower()
            if "png" in header_lower:
                media_type = "image/png"
            elif "webp" in header_lower:
                media_type = "image/webp"
            raw_base64 = b64_part.strip()
        else:
            raw_base64 = raw_input

        # Strip whitespace and linebreaks
        raw_base64 = raw_base64.replace("\n", "").replace("\r", "").strip()

        # If image payload is empty or too short (< 200 characters), immediately return waiting state JSON
        if len(raw_base64) < 200:
            logger.info(f"Image payload empty or too short ({len(raw_base64)} chars). Returning waiting state.")
            return get_waiting_state_result()

        # Fix missing Base64 padding automatically
        missing_padding = len(raw_base64) % 4
        if missing_padding:
            raw_base64 += "=" * (4 - missing_padding)

        try:
            image_bytes = base64.b64decode(raw_base64)
        except Exception as decode_err:
            logger.warning(f"Base64 decode failed ({decode_err}). Returning waiting state.")
            return get_waiting_state_result()

        if len(image_bytes) == 0:
            logger.info("Decoded image bytes empty. Returning waiting state.")
            return get_waiting_state_result()

        target_bin = payload.target_bin or "Auto-Detect"
        user_id = payload.user_id or "household_402"
        ward_id = payload.ward_id or "Ward-12 (Delhi)"

        logger.info(f"Inspecting frame for user '{user_id}' against bin '{target_bin}'")

        # 1. Inspect using Bedrock Claude Vision
        result = bedrock_service.inspect_waste_image(
            image_bytes=image_bytes,
            media_type=media_type,
            target_bin=target_bin,
            location_context=payload.location_context or "India - Municipal",
            user_prompt=payload.user_prompt,
        )

        # 2. AWS Cedar Statutory Policy Audit (MoEFCC SWM 2016 & CPCB E-Waste 2022)
        cedar_eval = cedar_engine.evaluate(
            target_bin=target_bin,
            category=result.category,
            item_detected=result.item_detected or "None",
            is_contaminated=result.is_contaminated,
            contamination_reason=result.contamination_reason,
            user_id=user_id,
        )

        result.cedar_decision = cedar_eval.decision
        result.cedar_policy_matched = cedar_eval.policy_matched
        result.cedar_statutory_citation = cedar_eval.statutory_citation

        # If Cedar returns FORBID, strictly enforce violation and red box
        if cedar_eval.decision == "FORBID":
            result.is_contaminated = True
            result.is_segregation_correct = False
            result.box_color = "red"
            if not result.contamination_reason or "None" in result.contamination_reason:
                result.contamination_reason = cedar_eval.legal_mandate

        # 3. Log audit trail and update live user score in Amazon DynamoDB
        scan_id, updated_score = dynamodb_service.log_scan_and_update_score(
            scan_result=result.model_dump(),
            user_id=user_id,
            ward_id=ward_id,
        )

        result.scan_id = scan_id
        result.user_score = updated_score

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inspecting base64 image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to inspect image: {str(e)}")


@app.post("/api/copilot/chat", response_model=CopilotChatResponse)
async def copilot_chat_endpoint(payload: CopilotChatRequest):
    """
    ShieldBin AI Copilot dual-purpose endpoint:
    1. WASTE-INSPECTION & OVERRIDE MODE:
       Analyzes short item name, waste correction, or voice override against CPCB rules.
       Returns structured 5-bullet format, runs AWS Cedar policy, logs DynamoDB score,
       and returns InspectionResult to update active card & camera overlay.
    2. GENERAL CHAT MODE (LIKE CHATGPT):
       Answers open-ended, coding, science, everyday, or casual questions naturally without
       forcing waste-bin cards or altering inspection state.
    """
    try:
        user_prompt = payload.prompt.strip()
        target_bin = payload.target_bin or "Auto-Detect"
        user_id = payload.user_id or "household_402"
        ward_id = payload.ward_id or "Ward-12 (Delhi)"
        location_context = payload.location_context or "India - Municipal"

        # Optional camera frame bytes
        image_bytes = None
        media_type = "image/jpeg"
        if payload.image_base64 and len(payload.image_base64) > 200:
            raw_input = payload.image_base64.strip()
            if "," in raw_input:
                header, b64_part = raw_input.split(",", 1)
                if "png" in header.lower():
                    media_type = "image/png"
                elif "webp" in header.lower():
                    media_type = "image/webp"
                raw_base64 = b64_part.strip()
            else:
                raw_base64 = raw_input
            raw_base64 = raw_base64.replace("\n", "").replace("\r", "").strip()
            pad = len(raw_base64) % 4
            if pad:
                raw_base64 += "=" * (4 - pad)
            try:
                image_bytes = base64.b64decode(raw_base64)
            except Exception:
                image_bytes = None

        intent, reply_text, inspection_result = bedrock_service.copilot_chat(
            prompt=user_prompt,
            image_bytes=image_bytes,
            media_type=media_type,
            target_bin=target_bin,
            location_context=location_context,
        )

        # If waste override mode, run Cedar policy verification & log DynamoDB score
        if intent == "waste_override" and inspection_result is not None:
            cedar_eval = cedar_engine.evaluate(
                target_bin=target_bin,
                category=inspection_result.category,
                item_detected=inspection_result.item_detected or "None",
                is_contaminated=inspection_result.is_contaminated,
                contamination_reason=inspection_result.contamination_reason,
                user_id=user_id,
            )
            inspection_result.cedar_decision = cedar_eval.decision
            inspection_result.cedar_policy_matched = cedar_eval.policy_matched
            inspection_result.cedar_statutory_citation = cedar_eval.statutory_citation

            if cedar_eval.decision == "FORBID":
                inspection_result.is_contaminated = True
                inspection_result.is_segregation_correct = False
                inspection_result.box_color = "red"
                if not inspection_result.contamination_reason:
                    inspection_result.contamination_reason = cedar_eval.legal_mandate

            # Log to DynamoDB & get updated user score
            scan_id, updated_score = dynamodb_service.log_scan_and_update_score(
                scan_result=inspection_result.model_dump(),
                user_id=user_id,
                ward_id=ward_id,
            )
            inspection_result.scan_id = scan_id
            inspection_result.user_score = updated_score

        return CopilotChatResponse(
            intent=intent,
            reply_text=reply_text,
            inspection_result=inspection_result,
        )

    except Exception as e:
        logger.error(f"Error in copilot chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Copilot error: {str(e)}")


@app.get("/api/user/score", response_model=UserScore)
def get_user_score(
    user_id: str = Query("household_402", description="Household or user ID")
):
    """
    Retrieves the live segregation score, points, and contamination statistics from DynamoDB.
    """
    return dynamodb_service.get_user_score(user_id=user_id)


@app.post("/api/inspect/upload", response_model=InspectionResult)
async def inspect_waste_file(
    file: UploadFile = File(..., description="Waste image file (JPEG, PNG, WEBP)"),
    target_bin: str = Query("Dry Recyclable", description="Bin target"),
    user_id: str = Query("household_402", description="User ID"),
    ward_id: str = Query("Ward-12 (Delhi)", description="Ward ID"),
    location_context: Optional[str] = Query("India - Municipal", description="Optional local context"),
):
    """
    Convenience endpoint for inspecting waste images via direct file upload.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type or 'unknown'}. Please upload an image.",
        )

    try:
        image_bytes = await file.read()
        media_type = file.content_type if file.content_type in ["image/jpeg", "image/png", "image/webp"] else "image/jpeg"

        result = bedrock_service.inspect_waste_image(
            image_bytes=image_bytes,
            media_type=media_type,
            target_bin=target_bin,
            location_context=location_context,
        )

        scan_id, updated_score = dynamodb_service.log_scan_and_update_score(
            scan_result=result.model_dump(),
            user_id=user_id,
            ward_id=ward_id,
        )
        result.scan_id = scan_id
        result.user_score = updated_score

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing image upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to inspect image: {str(e)}")


@app.get("/api/categories", response_model=List[CategoryInfo])
def get_categories():
    """Returns official Indian Municipal Solid Waste (MSW) segregation categories and bin standards."""
    return INDIAN_WASTE_CATEGORIES


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
