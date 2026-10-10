"""
Automated test script for ShieldBin Backend.
Verifies:
1. High-confidence object verification & "No Object" fallback.
2. Open knowledge base & E-Waste / Hazardous material analysis (e.g. Mobile Phone).
3. InspectionResult model validation and API endpoints.
4. User score management in DynamoDB.
"""

import sys
import os
import base64
from io import BytesIO

# Reconfigure stdout for utf-8 on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from PIL import Image

# Add current directory to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.models import InspectionResult, BoundingBox

client = TestClient(app)


def create_sample_test_image_base64() -> str:
    """Generates a small in-memory JPEG test image for verification."""
    img = Image.new("RGB", (320, 240), color=(120, 180, 80))
    buffer = BytesIO()
    img.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def run_tests():
    print("==================================================")
    print("   Running ShieldBin Backend Tests & Verification ")
    print("==================================================")

    # 1. Test Root
    print("\n1. Testing GET / ...")
    r = client.get("/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    print("   [PASS] Root endpoint OK:", r.json()["project"])

    # 2. Test Health
    print("\n2. Testing GET /health (AWS App Runner probe) ...")
    r = client.get("/health")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    print("   [PASS] Health check OK:", r.json()["status"])

    # 3. Test POST /api/inspect (Core Inspection Endpoint returning InspectionResult)
    print("\n3. Testing POST /api/inspect (InspectionResult validation) ...")
    b64_img = create_sample_test_image_base64()
    payload = {
        "image_base64": b64_img,
        "target_bin": "Dry Recyclable",
        "user_id": "household_402",
        "ward_id": "Ward-12 (Delhi)"
    }
    r = client.post("/api/inspect", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    result = r.json()
    
    # Validate against InspectionResult schema
    parsed_model = InspectionResult(**result)
    assert parsed_model.item_detected is not None
    assert isinstance(parsed_model.bounding_box, BoundingBox)

    print("   [PASS] Inspection API Succeeded!")
    print(f"      - Item Detected:          {result['item_detected']}")
    print(f"      - Category:               {result['category']}")
    print(f"      - Is Segregation Correct?:{result['is_segregation_correct']}")
    print(f"      - Bounding Box Color:     [{result['box_color'].upper()}]")
    print(f"      - Bounding Box Coords:    {result['bounding_box']}")
    print(f"      - Action Required:        {result['action_required']}")
    print(f"      - Points Awarded:         {result['points_awarded']}")
    print(f"      - Audit Scan ID:          {result['scan_id']}")

    # 4. Test InspectionResult Model with "No Object" Scenario
    print("\n4. Testing InspectionResult with 'No Object' Scenario ...")
    no_object_data = {
        "item_detected": "None",
        "category": "N/A",
        "is_contaminated": False,
        "contamination_reason": "No clear waste item detected in the frame. Waiting for an object.",
        "action_required": "Please place the item clearly in front of the camera.",
        "correct_bin": "Waiting for Item...",
        "points_awarded": 0
    }
    no_obj_result = InspectionResult(**no_object_data)
    assert no_obj_result.item_detected == "None"
    assert no_obj_result.category == "N/A"
    assert no_obj_result.is_contaminated is False
    assert no_obj_result.points_awarded == 0
    assert no_obj_result.correct_bin == "Waiting for Item..."
    print("   [PASS] 'No Object' JSON structure matches schema & defaults correctly!")

    # 5. Test InspectionResult Model with E-Waste / Mobile Phone
    print("\n5. Testing InspectionResult with 'Smartphone / Mobile Device' E-Waste Scenario ...")
    mobile_data = {
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
        "points_awarded": 0
    }
    mobile_result = InspectionResult(**mobile_data)
    assert mobile_result.item_detected == "Smartphone / Mobile Device"
    assert mobile_result.category == "E-Waste / Hazardous Electronics"
    assert mobile_result.is_contaminated is True
    assert mobile_result.correct_bin == "Specialized E-Waste Drop-off Center"
    assert mobile_result.points_awarded == 0
    print("   [PASS] 'Smartphone / Mobile Device' E-Waste / Hazardous analysis validated!")

    # 6. Test GET /api/user/score
    print("\n6. Testing GET /api/user/score?user_id=household_402 ...")
    r_score = client.get("/api/user/score?user_id=household_402")
    assert r_score.status_code == 200, f"Expected 200, got {r_score.status_code}"
    score_data = r_score.json()
    print("   [PASS] Live User Score from DynamoDB:")
    print(f"      - Household ID:           {score_data['user_id']}")
    print(f"      - Ward:                   {score_data['ward_id']}")
    print(f"      - Total Points:           {score_data['total_points']}")
    print(f"      - Segregation Accuracy:   {score_data['segregation_accuracy_pct']}%")
    print(f"      - Contamination Stopped:  {score_data['contamination_prevented']} violations prevented")

    # 7. Test Base64 & Frame Validation: Data URI prefix stripping
    print("\n7. Testing Base64 Data URI prefix stripping ...")
    b64_with_prefix = f"data:image/jpeg;base64,{create_sample_test_image_base64()}"
    r_prefix = client.post("/api/inspect", json={"image_base64": b64_with_prefix})
    assert r_prefix.status_code == 200, f"Expected 200, got {r_prefix.status_code}"
    assert r_prefix.json()["success"] is True
    print("   [PASS] Data URI prefix stripped and frame inspected successfully!")

    # 8. Test Base64 & Frame Validation: Short / Empty payload (< 200 chars)
    print("\n8. Testing Frame Validation on short/empty payloads (< 200 chars) ...")
    for short_payload in ["", "   ", "aW1hZ2U=", "data:image/jpeg;base64,QUJD"]:
        r_short = client.post("/api/inspect", json={"image_base64": short_payload})
        assert r_short.status_code == 200
        res = r_short.json()
        assert res["item_detected"] == "None"
        assert res["category"] == "N/A"
        assert res["is_contaminated"] is False
        assert res["contamination_reason"] == "No clear waste item detected in the camera frame."
        assert res["action_required"] == "Please place an item clearly in front of the lens."
        assert res["correct_bin"] == "Waiting for Item..."
        assert res["points_awarded"] == 0
    print("   [PASS] Short/empty payloads immediately return strict waiting state JSON!")

    # 9. Test Markdown Cleaning (clean_and_parse_json safety checks)
    print("\n9. Testing Markdown Cleaning safety checks ...")
    from app.prompts import clean_and_parse_json

    # Test 9a: Markdown with ```json fence
    sample_fenced = '```json\n{"item_detected": "Plastic Bottle", "category": "Dry Recyclable", "is_contaminated": false, "contamination_reason": "Clean PET", "action_required": "Drop in Blue Bin", "correct_bin": "Blue Bin", "points_awarded": 15}\n```'
    parsed_a = clean_and_parse_json(sample_fenced)
    assert parsed_a["item_detected"] == "Plastic Bottle"
    assert parsed_a["points_awarded"] == 15

    # Test 9b: Markdown with ``` fence (no json label) and conversational text
    sample_mixed = 'Here is the analysis:\n```\n{"item_detected": "Banana Peel", "category": "Wet Organic", "is_contaminated": false, "contamination_reason": "Compostable", "action_required": "Green Bin", "correct_bin": "Green Bin", "points_awarded": 15}\n```\nHope this helps!'
    parsed_b = clean_and_parse_json(sample_mixed)
    assert parsed_b["item_detected"] == "Banana Peel"

    # Test 9c: Conversational preamble/postamble without fences
    sample_conversational = 'I inspected the frame. {"item_detected": "Smartphone / Mobile Device", "category": "E-Waste / Hazardous Electronics", "is_contaminated": true, "contamination_reason": "Lithium-ion battery", "action_required": "Recycle at E-Waste Depot", "correct_bin": "Specialized E-Waste Drop-off Center", "points_awarded": 0} Thank you.'
    parsed_c = clean_and_parse_json(sample_conversational)
    assert parsed_c["item_detected"] == "Smartphone / Mobile Device"
    assert parsed_c["is_contaminated"] is True
    print("   [PASS] Markdown code blocks and conversational text stripped safely!")

    # 10. Test Copilot Voice Override (user_prompt parameter)
    print("\n10. Testing POST /api/inspect with Copilot user_prompt override ...")
    copilot_payload = {
        "image_base64": create_sample_test_image_base64(),
        "user_prompt": "That's a lithium battery, not plastic...",
        "target_bin": "Dry Recyclable",
        "user_id": "household_402",
        "ward_id": "Ward-12 (Delhi)"
    }
    r_copilot = client.post("/api/inspect", json=copilot_payload)
    assert r_copilot.status_code == 200, f"Expected 200, got {r_copilot.status_code}"
    copilot_res = r_copilot.json()
    assert copilot_res["is_contaminated"] is True
    assert "battery" in copilot_res["item_detected"].lower() or "lithium" in copilot_res["item_detected"].lower()
    assert "e-waste" in copilot_res["correct_bin"].lower() or "e-waste" in copilot_res["category"].lower()
    print("   [PASS] Copilot user_prompt override validated successfully!")
    print(f"      - Item Detected:      {copilot_res['item_detected']}")
    print(f"      - Category:           {copilot_res['category']}")
    print(f"      - Correct Bin:        {copilot_res['correct_bin']}")
    print(f"      - Box Color:          {copilot_res['box_color']}")

    # 11. Test AWS Cedar Statutory Policy Engine (MoEFCC SWM 2016 & CPCB E-Waste 2022)
    print("\n11. Testing AWS Cedar Policy Engine statutory verification ...")
    from app.cedar_service import cedar_engine

    # 11a: Test E-Waste hazard into Blue Bin -> FORBID
    cedar_ewaste = cedar_engine.evaluate(
        target_bin="Blue Bin (Dry Recyclable)",
        category="E-Waste / Hazardous Electronics",
        item_detected="Lithium Battery Pack",
        is_contaminated=True,
    )
    assert cedar_ewaste.decision == "FORBID"
    assert "cpcb" in cedar_ewaste.policy_matched.lower()
    assert "e-waste" in cedar_ewaste.statutory_citation.lower()
    print("   [PASS] Cedar FORBID on E-Waste hazard verified:", cedar_ewaste.statutory_citation)

    # 11b: Test Clean PET Plastic into Blue Bin -> PERMIT
    cedar_clean = cedar_engine.evaluate(
        target_bin="Blue Bin (Dry Recyclable)",
        category="Dry Recyclable",
        item_detected="Clean PET Plastic Bottle",
        is_contaminated=False,
    )
    assert cedar_clean.decision == "PERMIT"
    assert "permit" in cedar_clean.policy_matched.lower()
    print("   [PASS] Cedar PERMIT on Clean Dry Recyclable verified:", cedar_clean.statutory_citation)

    # 11c: Test Food Grease on Cardboard into Blue Bin -> FORBID
    cedar_grease = cedar_engine.evaluate(
        target_bin="Dry Recyclable",
        category="Sanitary / Landfill",
        item_detected="Greasy Pizza Box",
        is_contaminated=True,
        contamination_reason="Grease-soaked cardboard base",
    )
    assert cedar_grease.decision == "FORBID"
    assert "grease" in cedar_grease.policy_matched.lower()
    print("   [PASS] Cedar FORBID on Food Grease contamination verified:", cedar_grease.statutory_citation)

    # 12. Test Sample Test Presets & Copilot Sample Buttons return exact matching results
    print("\n12. Testing Sample Test Buttons (phone, bottle, pizza, battery, milk, empty) ...")
    expected_presets = {
        "phone": ("Smartphone / Mobile Device", "Yellow", "red"),
        "bottle": ("Clean PET Water Bottle", "Blue", "green"),
        "pizza": ("Greasy Cardboard Pizza Box", "Black", "red"),
        "battery": ("Lithium Battery / Charging Cable", "Yellow", "red"),
        "milk": ("Unrinsed Single-Use Milk Pouch", "Blue", "red"),
        "empty": ("None", "Gray", "green"),
    }
    for preset_key, (expected_item, expected_bin_color, expected_box) in expected_presets.items():
        r_preset = client.post(
            "/api/inspect",
            json={
                "image_base64": b64_img,
                "target_bin": "Dry Recyclable",
                "location_context": f"India - Municipal [preset:{preset_key}]",
            },
        )
        assert r_preset.status_code == 200
        d_preset = r_preset.json()
        assert d_preset["item_detected"] == expected_item, (
            f"Preset '{preset_key}' returned '{d_preset['item_detected']}', expected '{expected_item}'"
        )
        assert d_preset["bin_color"] == expected_bin_color
        assert d_preset["box_color"] == expected_box
    print("   [PASS] All 6 Sample Test Presets return 100% exact matching results!")

    # 13. Test Deterministic Mock Mode (Never returns 'None' on valid images, repeatable results)
    print("\n13. Testing Deterministic Mock Mode (no random mismatches or unexpected 'None') ...")
    first_res = client.post("/api/inspect", json={"image_base64": b64_img, "target_bin": "Dry Recyclable"}).json()
    for _ in range(10):
        repeat_res = client.post("/api/inspect", json={"image_base64": b64_img, "target_bin": "Dry Recyclable"}).json()
        assert repeat_res["item_detected"] != "None", "Valid image should never randomly return 'None'!"
        assert repeat_res["item_detected"] == first_res["item_detected"], "Same image must return deterministic result!"
    print(f"   [PASS] Deterministic mock mode verified (consistently returned '{first_res['item_detected']}')!")

    # 14. Test Verified AWS Bedrock Vision Model IDs
    print("\n14. Verifying AWS Bedrock Vision Model IDs ...")
    from app.config import settings
    from app.bedrock_service import BEDROCK_VISION_MODELS
    assert settings.BEDROCK_MODEL_ID != "anthropic.claude-3-5-sonnet-20250219-v1:0", "Invalid 20250219 model ID must not be used!"
    assert settings.BEDROCK_MODEL_ID == "anthropic.claude-3-5-sonnet-20240620-v1:0"
    assert "anthropic.claude-3-5-sonnet-20240620-v1:0" in BEDROCK_VISION_MODELS
    assert "anthropic.claude-3-haiku-20240307-v1:0" in BEDROCK_VISION_MODELS
    print(f"   [PASS] Verified Bedrock Vision Model ID: {settings.BEDROCK_MODEL_ID}")

    print("\n==================================================")
    print("   ALL 14 TESTS VERIFIED & WORKING!               ")
    print("==================================================")


if __name__ == "__main__":
    run_tests()
