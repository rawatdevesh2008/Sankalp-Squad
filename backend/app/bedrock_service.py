import json
import base64
import logging
import random
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

from app.config import settings
from app.prompts import get_inspection_prompt, clean_and_parse_json
from app.models import InspectionResult, InspectionResponse, BoundingBox

logger = logging.getLogger("shieldbin.bedrock")

# Predefined realistic simulation responses for testing without active AWS credentials
MOCK_ITEMS = [
    {
        "item_detected": "None",
        "category": "N/A",
        "is_contaminated": False,
        "is_segregation_correct": True,
        "box_color": "green",
        "bounding_box": {"ymin": 0, "xmin": 0, "ymax": 0, "xmax": 0},
        "contamination_reason": "No clear waste item detected in the camera frame.",
        "correct_bin": "Waiting for Item...",
        "bin_color": "Gray",
        "action_required": "Please place an item clearly in front of the lens.",
        "points_awarded": 0,
        "material": "None",
        "remediation_steps": [
            "Please place an item clearly in front of the lens."
        ],
        "confidence_score": 0.99,
        "environmental_impact_tip": "Position the item centrally to evaluate its material and cleanliness."
    },
    {
        "item_detected": "Smartphone / Mobile Device",
        "category": "E-Waste / Hazardous Electronics",
        "is_contaminated": True,
        "is_segregation_correct": False,
        "box_color": "red",
        "bounding_box": {"ymin": 250, "xmin": 280, "ymax": 750, "xmax": 720},
        "contamination_reason": "Contains a lithium-ion battery, heavy metals (lead, mercury, cadmium), and circuit boards that release toxic leachate in landfills.",
        "correct_bin": "Specialized E-Waste Drop-off Center",
        "bin_color": "Yellow",
        "action_required": "Do not place in household waste or recycling bins. Wipe personal data, remove accessories, and drop off at a certified e-waste recycling center or retail take-back program.",
        "points_awarded": 0,
        "material": "Consumer Electronics (Lithium-ion Battery / Heavy Metals / Circuitry)",
        "remediation_steps": [
            "Do not place in household waste or recycling bins",
            "Wipe personal data and remove accessories",
            "Drop off at a certified e-waste recycling center or retail take-back program"
        ],
        "confidence_score": 0.99,
        "environmental_impact_tip": "Improper disposal of lithium batteries causes landfill fires and leaches toxic metals into groundwater."
    },
    {
        "item_detected": "Clean PET Water Bottle",
        "category": "Dry Recyclable",
        "is_contaminated": False,
        "is_segregation_correct": True,
        "box_color": "green",
        "bounding_box": {"ymin": 150, "xmin": 300, "ymax": 820, "xmax": 700},
        "contamination_reason": None,
        "correct_bin": "Blue Bin (Recyclables)",
        "bin_color": "Blue",
        "action_required": "Clean dry recyclable verified! Safe to discard in Blue Bin",
        "points_awarded": 15,
        "material": "Polyethylene Terephthalate (PET #1)",
        "remediation_steps": [
            "Crush bottle flat to save space",
            "Keep cap screwed on tight",
            "Drop in Blue Bin"
        ],
        "confidence_score": 0.98,
        "environmental_impact_tip": "Recycling PET plastic saves 60% of the energy needed for virgin production."
    },
    {
        "item_detected": "Greasy Cardboard Pizza Box",
        "category": "Sanitary / Landfill",
        "is_contaminated": True,
        "is_segregation_correct": False,
        "box_color": "red",
        "bounding_box": {"ymin": 180, "xmin": 210, "ymax": 790, "xmax": 810},
        "contamination_reason": "Severe cheese grease and tomato sauce oil absorbed into cellulose paper fibers",
        "correct_bin": "Black Bin (Landfill / Soiled Waste)",
        "bin_color": "Black",
        "action_required": "Greasy pizza box detected in dry paper bin — move to organic/landfill",
        "points_awarded": -5,
        "material": "Corrugated Cardboard (Grease-Soaked)",
        "remediation_steps": [
            "Tear off clean dry lid and drop in Blue Bin",
            "Discard greasy food-stained bottom section into Black Bin"
        ],
        "confidence_score": 0.96,
        "environmental_impact_tip": "Greasy pizza boxes in dry paper bins ruin 70%+ of recyclables by contaminating the water pulper."
    },
    {
        "item_detected": "Banana Peel & Wet Food Scraps",
        "category": "Wet Organic",
        "is_contaminated": False,
        "is_segregation_correct": True,
        "box_color": "green",
        "bounding_box": {"ymin": 220, "xmin": 260, "ymax": 780, "xmax": 740},
        "contamination_reason": None,
        "correct_bin": "Green Bin (Compost / Wet Waste)",
        "bin_color": "Green",
        "action_required": "Organic compost verified! Safe to discard in Green Bin",
        "points_awarded": 15,
        "material": "Organic Biomass",
        "remediation_steps": [
            "Ensure no plastic stickers attached",
            "Drop in Green Bin for composting"
        ],
        "confidence_score": 0.99,
        "environmental_impact_tip": "Composting organic waste stops methane release at landfill sites."
    },
    {
        "item_detected": "Unrinsed Single-Use Milk Pouch",
        "category": "Dry Recyclable",
        "is_contaminated": True,
        "is_segregation_correct": False,
        "box_color": "red",
        "bounding_box": {"ymin": 250, "xmin": 280, "ymax": 720, "xmax": 750},
        "contamination_reason": "Sour milk fat residue inside creates bacteria and foul odor",
        "correct_bin": "Blue Bin (Recyclables - After Rinse)",
        "bin_color": "Blue",
        "action_required": "Milk residue detected! Slit open, rinse with water, and let dry before placing in Blue Bin",
        "points_awarded": 5,
        "material": "Low-Density Polyethylene (LDPE #4)",
        "remediation_steps": [
            "Slit open completely",
            "Rinse with a quick splash of water",
            "Drop dry pouch in Blue Bin"
        ],
        "confidence_score": 0.94,
        "environmental_impact_tip": "Cleaned LDPE milk pouches are recycled into industrial drainage pipes across India."
    }
]


class BedrockService:
    def __init__(self):
        self.region = settings.AWS_REGION
        self.model_id = settings.BEDROCK_MODEL_ID
        self._client = None
        self._init_client()

    def _init_client(self):
        """Attempts to initialize boto3 Bedrock Runtime client."""
        if any(p in (settings.AWS_ACCESS_KEY_ID or "").lower() for p in ["your_aws", "placeholder", "your_access_key"]):
            logger.info("Demo/placeholder AWS credentials detected. Operating in Simulation Mode.")
            self._client = None
            return

        try:
            if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
                self._client = boto3.client(
                    service_name="bedrock-runtime",
                    region_name=self.region,
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    aws_session_token=settings.AWS_SESSION_TOKEN or None,
                )
                logger.info(f"Initialized Amazon Bedrock client for region: {self.region}")
            else:
                self._client = boto3.client(
                    service_name="bedrock-runtime",
                    region_name=self.region,
                )
                logger.info("Initialized Bedrock client using system/IAM credentials.")
        except Exception as e:
            logger.warning(
                f"Could not initialize Amazon Bedrock client: {e}. Falling back to Simulation Mode."
            )
            self._client = None

    def inspect_waste_image(
        self,
        image_bytes: bytes,
        media_type: str = "image/jpeg",
        target_bin: str = "Dry Recyclable",
        location_context: str = "India - Municipal",
    ) -> InspectionResult:
        """
        Inspects waste image using Amazon Bedrock Claude Vision.
        Performs high-confidence object detection first, followed by open knowledge-base
        material and hazardous contamination analysis.
        """
        if settings.USE_MOCK_BEDROCK or self._client is None:
            logger.info("Using mock simulation mode for inspection.")
            return self._generate_mock_response(target_bin=target_bin)

        try:
            b64_image = base64.b64encode(image_bytes).decode("utf-8")
            prompt_text = get_inspection_prompt(target_bin=target_bin, location_context=location_context)

            payload = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "temperature": 0.1,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": b64_image,
                                },
                            },
                            {
                                "type": "text",
                                "text": prompt_text,
                            },
                        ],
                    }
                ],
            }

            logger.info(f"Invoking Amazon Bedrock model: {self.model_id}")
            response = self._client.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(payload),
            )

            response_body = json.loads(response["body"].read().decode("utf-8"))
            raw_content = response_body["content"][0]["text"].strip()
            logger.info(f"Bedrock response received: {raw_content[:200]}...")

            parsed_data = self._clean_and_parse_json(raw_content)

            raw_item = str(parsed_data.get("item_detected", "")).strip()
            is_no_object = raw_item.lower() in ("none", "null", "no object", "n/a", "")

            # 1. No Object Scenario
            if is_no_object:
                return InspectionResult(
                    success=True,
                    item_detected="None",
                    category="N/A",
                    is_contaminated=False,
                    is_segregation_correct=True,
                    box_color="green",
                    bounding_box=BoundingBox(ymin=0, xmin=0, ymax=0, xmax=0),
                    contamination_reason=parsed_data.get("contamination_reason") or "No clear waste item detected in the frame. Waiting for an object.",
                    correct_bin=parsed_data.get("correct_bin") or "Waiting for Item...",
                    bin_color=parsed_data.get("bin_color", "Gray"),
                    action_required=parsed_data.get("action_required") or "Please place the item clearly in front of the camera.",
                    points_awarded=int(parsed_data.get("points_awarded", 0)),
                    material="None",
                    remediation_steps=parsed_data.get("remediation_steps", ["Please place the item clearly in front of the camera."]),
                    confidence_score=float(parsed_data.get("confidence_score", 0.99)),
                    environmental_impact_tip=parsed_data.get(
                        "environmental_impact_tip",
                        "Position the item clearly in front of the camera to verify the item and inspect for contamination.",
                    ),
                    engine_source=f"Amazon Bedrock ({self.model_id.split(':')[-1] if ':' in self.model_id else self.model_id})",
                    timestamp=datetime.now(timezone.utc).isoformat(),
                )

            # 2. Clear Object Detected -> Open Knowledge Base & Hazardous Material Analysis
            item_detected = raw_item
            category = parsed_data.get("category", "General Waste")

            # Check for hazardous / electronic / battery items
            is_hazard = any(
                h in f"{item_detected} {category}".lower()
                for h in ["e-waste", "hazard", "battery", "phone", "electronics", "chemical", "medical", "cable"]
            )
            is_contaminated = bool(parsed_data.get("is_contaminated", is_hazard))

            if is_hazard:
                is_contaminated = True

            is_segregation_correct = bool(parsed_data.get("is_segregation_correct", not is_contaminated))
            box_color = "red" if (is_contaminated or not is_segregation_correct) else "green"

            # Extract or normalize bounding box
            bbox_raw = parsed_data.get("bounding_box", {})
            if isinstance(bbox_raw, list) and len(bbox_raw) == 4:
                bbox = BoundingBox(ymin=bbox_raw[0], xmin=bbox_raw[1], ymax=bbox_raw[2], xmax=bbox_raw[3])
            elif isinstance(bbox_raw, dict) and "ymin" in bbox_raw:
                bbox = BoundingBox(
                    ymin=int(bbox_raw.get("ymin", 200)),
                    xmin=int(bbox_raw.get("xmin", 200)),
                    ymax=int(bbox_raw.get("ymax", 800)),
                    xmax=int(bbox_raw.get("xmax", 800)),
                )
            else:
                bbox = BoundingBox(ymin=200, xmin=200, ymax=800, xmax=800)

            correct_bin = parsed_data.get("correct_bin")
            if not correct_bin:
                correct_bin = "Specialized E-Waste Drop-off Center" if is_hazard else ("Blue Bin (Recyclables)" if is_segregation_correct else "Black Bin (Landfill / Soiled Waste)")

            bin_color = parsed_data.get("bin_color")
            if not bin_color:
                bin_color = "Yellow" if is_hazard else ("Blue" if is_segregation_correct else "Black")

            action_required = parsed_data.get("action_required") or (
                "Do not place in household waste or recycling bins. Wipe personal data, remove accessories, and drop off at a certified e-waste recycling center or retail take-back program."
                if is_hazard else "Inspect and dispose cleanly according to municipal waste guidelines."
            )

            points_awarded = int(parsed_data.get("points_awarded", 0 if is_hazard else (15 if is_segregation_correct else -5)))

            return InspectionResult(
                success=True,
                item_detected=item_detected,
                category=category,
                is_contaminated=is_contaminated,
                is_segregation_correct=is_segregation_correct,
                box_color=box_color,
                bounding_box=bbox,
                contamination_reason=parsed_data.get("contamination_reason"),
                correct_bin=correct_bin,
                bin_color=bin_color,
                action_required=action_required,
                points_awarded=points_awarded,
                material=parsed_data.get("material", "Mixed Material"),
                remediation_steps=parsed_data.get("remediation_steps", [action_required]),
                confidence_score=float(parsed_data.get("confidence_score", 0.95)),
                environmental_impact_tip=parsed_data.get(
                    "environmental_impact_tip",
                    "Source-level segregation prevents truckloads of recyclables from being diverted to landfills.",
                ),
                engine_source=f"Amazon Bedrock ({self.model_id.split(':')[-1] if ':' in self.model_id else self.model_id})",
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

        except (ClientError, NoCredentialsError, BotoCoreError) as aws_err:
            logger.warning(
                f"AWS Bedrock error ({aws_err}). Falling back to simulation mode so development continues."
            )
            return self._generate_mock_response(target_bin=target_bin, reason=f"Fallback (AWS: {str(aws_err)})")
        except Exception as ex:
            logger.error(f"Unexpected error in inspection: {ex}", exc_info=True)
            return self._generate_mock_response(target_bin=target_bin, reason=f"Fallback (Error: {str(ex)})")

    def _clean_and_parse_json(self, raw_text: str) -> Dict[str, Any]:
        """Safety checks to strip any accidental markdown code blocks and conversational text."""
        return clean_and_parse_json(raw_text)

    def _generate_mock_response(self, target_bin: str = "Dry Recyclable", reason: Optional[str] = None) -> InspectionResult:
        """Returns a high-fidelity simulation object with bounding box coordinates."""
        item = random.choice(MOCK_ITEMS)
        engine_label = "ShieldBin Simulation Engine"
        if reason:
            engine_label += f" [{reason}]"

        bbox = BoundingBox(
            ymin=item["bounding_box"]["ymin"],
            xmin=item["bounding_box"]["xmin"],
            ymax=item["bounding_box"]["ymax"],
            xmax=item["bounding_box"]["xmax"],
        )

        return InspectionResult(
            success=True,
            item_detected=item["item_detected"],
            category=item["category"],
            is_contaminated=item["is_contaminated"],
            is_segregation_correct=item["is_segregation_correct"],
            box_color=item["box_color"],
            bounding_box=bbox,
            contamination_reason=item["contamination_reason"],
            correct_bin=item["correct_bin"],
            bin_color=item["bin_color"],
            action_required=item["action_required"],
            points_awarded=item["points_awarded"],
            material=item["material"],
            remediation_steps=item["remediation_steps"],
            confidence_score=item["confidence_score"],
            environmental_impact_tip=item["environmental_impact_tip"],
            engine_source=engine_label,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )


bedrock_service = BedrockService()
