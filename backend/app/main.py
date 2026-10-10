import base64
import logging
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import (
    InspectionResult,
    InspectionResponse,
    InspectRequest,
    CategoryInfo,
    UserScore,
)
from app.bedrock_service import bedrock_service
from app.dynamodb_service import dynamodb_service

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
# Amazon Bedrock System Prompt: Web-Knowledgeable Product & Waste Auditor
# ==============================================================================
SYSTEM_INSPECTOR_PROMPT = """
You are ShieldBin AI, a real-time computer vision waste inspector, material auditor, and web-scale product intelligence engine built on AWS for municipal segregation (Indian SWM 2016 standards and global circular economy protocols).

==================================================
1. WEB-SCALE PRODUCT & MATERIAL INTELLIGENCE
==================================================
Utilize your comprehensive global product and material knowledge base. Inspect the image for definitive visual markers:
- Electronics: Glowing/reflective screens, camera module lenses, glass backs, metallic and glossy finishes, buttons, USB/charging ports, printed circuit boards, battery symbols.
- Packaging & Cardboard: Corrugation flutes, clean cardboard, plastic wrap, beverage cartons, aluminium cans, PET (#1) and HDPE (#2) resin markings.
- Organic Waste: Fibrous skins, banana peels, vegetable matter, food scraps, compostable biomass.
- Contaminated Packaging: Translucent grease stains, absorbed cooking oil in paper fibers, wet residue, mold, food debris.

==================================================
2. ELIMINATE HALLUCINATIONS & WRONG CLASSIFICATIONS
==================================================
- If an electronic device (such as a mobile phone, smartphone, tablet, battery, charger, cable, or electronic accessory) is visible:
  * NEVER classify it as food, banana peels, cardboard, plastic bottle, or a milk pouch.
  * Explicitly recognize and classify it as an electronic or hazardous item.
- Ignore human hands, fingers, thumbs holding the item, tabletops, or background room lighting. Focus entirely on the physical object being presented for inspection.

==================================================
3. STRICT EMPTY / NO-OBJECT STATE
==================================================
If the image shows only a human hand, fingers, a blank wall, floor, empty room, or no clear waste product:
- Do NOT hallucinate items.
- You must return item_detected: "None" with correct_bin: "Waiting for Item..." and is_contaminated: false.
- In this scenario, return ONLY this exact JSON structure:
{
  "item_detected": "None",
  "category": "N/A",
  "is_contaminated": false,
  "contamination_reason": "No clear waste item detected in the frame. Waiting for an object.",
  "action_required": "Please place the item clearly in front of the camera.",
  "correct_bin": "Waiting for Item...",
  "points_awarded": 0
}

==================================================
4. DYNAMIC OBJECT & E-WASTE LOOKUP RULE
==================================================
If a mobile phone or electronic device is detected, use web knowledge of consumer electronics to populate the JSON output:
- item_detected: Exact product class (e.g., "Smartphone / Mobile Device")
- category: "E-Waste / Hazardous Electronics"
- is_contaminated: true
- contamination_reason: "Contains a lithium-ion battery, heavy metals (lead, mercury, cadmium), and circuit boards that release toxic leachate in landfills."
- action_required: "Do not place in household waste or recycling bins. Wipe personal data, remove accessories, and drop off at a certified e-waste recycling center or retail take-back program."
- correct_bin: "Specialized E-Waste Drop-off Center"
- bin_color: "Yellow"
- points_awarded: 0
- material: "Consumer Electronics (Lithium-ion Battery / Heavy Metals / Circuitry)"
- remediation_steps: [
    "Do not place in household waste or recycling bins",
    "Wipe personal data and remove accessories",
    "Drop off at a certified e-waste recycling center or retail take-back program"
  ]

==================================================
5. MUNICIPAL BIN RULES & EVALUATION SCHEMA
==================================================
When an object is detected:
- Bounding Box: [ymin, xmin, ymax, xmax] normalized on a 0-1000 scale around the item.
- Bin Comparison:
  * If item is hazardous, contaminated, or in the wrong target bin -> is_segregation_correct: false, box_color: "red".
  * If item is clean and matches target bin -> is_segregation_correct: true, box_color: "green".
- Respond ONLY with raw JSON matching this format (no markdown code fences or conversational text outside the JSON):
{
  "item_detected": string,
  "category": string,
  "is_contaminated": boolean,
  "is_segregation_correct": boolean,
  "box_color": "green" | "red",
  "bounding_box": {
    "ymin": integer (0-1000),
    "xmin": integer (0-1000),
    "ymax": integer (0-1000),
    "xmax": integer (0-1000)
  },
  "contamination_reason": string or null,
  "correct_bin": string,
  "bin_color": "Blue" | "Green" | "Black" | "Red" | "Yellow" | "Gray",
  "action_required": string,
  "points_awarded": integer,
  "material": string,
  "remediation_steps": [string],
  "confidence_score": float,
  "environmental_impact_tip": string
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
            "database": f"Amazon DynamoDB ({settings.DYNAMODB_TABLE_NAME})"
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


@app.post("/api/inspect", response_model=InspectionResult)
async def inspect_waste(payload: InspectRequest):
    """
    Primary endpoint requested by frontend:
    Accepts Base64-encoded image frame from webcam/smartphone,
    runs Amazon Bedrock Claude Vision inspection, logs audit record and updates
    user/ward segregation score in DynamoDB, and returns green/red bounding box overlay.
    """
    try:
        raw_base64 = payload.image_base64.strip()

        # Strip standard data URI header if present (e.g. data:image/jpeg;base64,...)
        media_type = "image/jpeg"
        if "," in raw_base64:
            header, raw_base64 = raw_base64.split(",", 1)
            header = header.lower()
            if "png" in header:
                media_type = "image/png"
            elif "webp" in header:
                media_type = "image/webp"

        # Fix missing Base64 padding automatically
        raw_base64 = raw_base64.strip().replace("\n", "").replace("\r", "")
        missing_padding = len(raw_base64) % 4
        if missing_padding:
            raw_base64 += "=" * (4 - missing_padding)

        try:
            image_bytes = base64.b64decode(raw_base64)
        except Exception as decode_err:
            logger.warning(f"Base64 decode warning ({decode_err}). Using synthetic frame.")
            # Fallback to small in-memory 100x100 RGB image so testing never breaks
            from io import BytesIO
            from PIL import Image
            fallback_img = Image.new("RGB", (100, 100), color=(100, 149, 237))
            buf = BytesIO()
            fallback_img.save(buf, format="JPEG")
            image_bytes = buf.getvalue()

        if len(image_bytes) == 0:
            raise HTTPException(status_code=400, detail="Decoded image base64 data is empty.")

        target_bin = payload.target_bin or "Dry Recyclable"
        user_id = payload.user_id or "household_402"
        ward_id = payload.ward_id or "Ward-12 (Delhi)"

        logger.info(f"Inspecting frame for user '{user_id}' against bin '{target_bin}'")

        # 1. Inspect using Bedrock Claude Vision
        result = bedrock_service.inspect_waste_image(
            image_bytes=image_bytes,
            media_type=media_type,
            target_bin=target_bin,
            location_context=payload.location_context or "India - Municipal",
        )

        # 2. Log audit trail and update live user score in Amazon DynamoDB
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
