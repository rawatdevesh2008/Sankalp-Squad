import re
import json
from typing import Dict, Any, Optional

# ==============================================================================
# Universal Bedrock System Prompt (Claude 3.5 Sonnet)
# Unconstrained, universal AI vision and global web-knowledge audit system
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


def get_inspection_prompt(
    target_bin: str = "Dry Recyclable",
    location_context: str = "India - Municipal",
    user_prompt: Optional[str] = None,
) -> str:
    prompt = (
        f"{SYSTEM_INSPECTOR_PROMPT}\n\n"
        f"USER CONTEXT:\n"
        f"- Target Bin being scanned: '{target_bin}'\n"
        f"- Location Context: '{location_context}'\n"
    )
    if user_prompt and user_prompt.strip():
        prompt += (
            f"- User Copilot Instruction / Voice Override: \"{user_prompt.strip()}\"\n"
            f"NOTE: The user has explicitly stated this correction or clarification. "
            f"Carefully evaluate their input, re-verify the material/device, and update the audit classification accordingly.\n"
        )
    prompt += "\nInspect the image frame and output the raw JSON:"
    return prompt


def clean_and_parse_json(raw_text: str) -> Dict[str, Any]:
    """
    Safety checks to strip any accidental markdown code blocks (```json ... ``` or ``` ... ```)
    or conversational text from Claude's response text before parsing with json.loads().
    """
    if not raw_text or not isinstance(raw_text, str):
        raise ValueError("Empty or invalid response received from model.")

    cleaned = raw_text.strip()

    # 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
    fence_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    match = re.search(fence_pattern, cleaned)
    if match:
        cleaned = match.group(1).strip()
    else:
        # Fallback strip prefix/suffix backticks
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    # 2. Extract outermost JSON object { ... } if surrounded by extra commentary
    start_brace = cleaned.find("{")
    end_brace = cleaned.rfind("}")
    if start_brace != -1 and end_brace != -1 and end_brace > start_brace:
        cleaned = cleaned[start_brace : end_brace + 1]

    return json.loads(cleaned)
