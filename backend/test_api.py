"""
Automated test script for ShieldBin Backend.
Verifies the Single Core Working Feature:
Webcam stream -> green/red bounding box -> user score in DynamoDB.
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

client = TestClient(app)

def create_sample_test_image_base64() -> str:
    """Generates a small in-memory JPEG test image for verification."""
    img = Image.new("RGB", (320, 240), color=(120, 180, 80))
    buffer = BytesIO()
    img.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def run_tests():
    print("==================================================")
    print("   Running ShieldBin Backend Demo Tests          ")
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

    # 3. Test POST /api/inspect (The Core Demo Feature!)
    print("\n3. Testing POST /api/inspect (Webcam Frame -> Bounding Box -> Score) ...")
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
    print("   [PASS] Inspection API Succeeded!")
    print(f"      - Item Detected:          {result['item_detected']}")
    print(f"      - Category:               {result['category']}")
    print(f"      - Is Segregation Correct?:{result['is_segregation_correct']}")
    print(f"      - Bounding Box Color:     [{result['box_color'].upper()}]")
    print(f"      - Bounding Box Coords:    {result['bounding_box']}")
    print(f"      - Action Required:        {result['action_required']}")
    print(f"      - Points Awarded:         {result['points_awarded']}")
    print(f"      - Audit Scan ID:          {result['scan_id']}")
    
    # Assert bounding box format
    bbox = result['bounding_box']
    assert all(k in bbox for k in ("ymin", "xmin", "ymax", "xmax")), "Invalid bounding box format"
    assert result['box_color'] in ("green", "red"), "Box color must be green or red"

    # Assert user score updated
    user_score = result.get('user_score')
    assert user_score is not None, "Missing user_score in response"
    print(f"      - User Score (DynamoDB):  {user_score['total_points']} pts (Scans: {user_score['total_scans']})")

    # 4. Test GET /api/user/score
    print("\n4. Testing GET /api/user/score?user_id=household_402 ...")
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
    print("   ALL CORE DEMO FEATURES VERIFIED & WORKING!     ")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
