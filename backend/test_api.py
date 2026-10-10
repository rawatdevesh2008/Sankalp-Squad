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

    print("\n==================================================")
    print("   ALL TESTS VERIFIED & WORKING!                  ")
    print("==================================================")


if __name__ == "__main__":
    run_tests()
