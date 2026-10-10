from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone


class BoundingBox(BaseModel):
    ymin: int = Field(0, description="Top edge coordinate on 0-1000 scale")
    xmin: int = Field(0, description="Left edge coordinate on 0-1000 scale")
    ymax: int = Field(0, description="Bottom edge coordinate on 0-1000 scale")
    xmax: int = Field(0, description="Right edge coordinate on 0-1000 scale")


class UserScore(BaseModel):
    user_id: str = "household_402"
    ward_id: str = "Ward-12 (Delhi)"
    total_points: int = 0
    total_scans: int = 0
    correct_scans: int = 0
    contamination_prevented: int = 0
    segregation_accuracy_pct: float = 100.0
    last_updated: str


class InspectRequest(BaseModel):
    image_base64: str = Field(..., description="Base64-encoded image frame from webcam")
    target_bin: Optional[str] = Field("Auto-Detect", description="Bin being scanned: 'Auto-Detect', 'Dry Recyclable', or 'Wet Organic'")
    user_id: Optional[str] = Field("household_402", description="Household or user identifier")
    ward_id: Optional[str] = Field("Ward-12 (Delhi)", description="Ward or municipal zone identifier")
    location_context: Optional[str] = Field("India - Municipal", description="Optional local waste context")
    user_prompt: Optional[str] = Field(None, description="Optional Copilot voice override or user correction prompt")


class InspectionResult(BaseModel):
    success: bool = True

    # Core Object Verification & Detection fields:
    item_detected: Optional[str] = Field("None", description="Detected object name or 'None' if no clear object is present in frame")
    category: str = Field("N/A", description="Material category: Dry Recyclable, Wet Organic, Sanitary / Landfill, E-Waste / Hazardous, N/A, etc.")
    is_contaminated: bool = Field(False, description="True if contamination or hazardous materials detected")
    is_segregation_correct: bool = Field(True, description="True if item matches the target bin; False if cross-contaminating or hazardous")
    box_color: str = Field("green", description="'green' if segregation is correct or waiting, 'red' if contaminated/wrong bin")
    bounding_box: BoundingBox = Field(
        default_factory=lambda: BoundingBox(ymin=0, xmin=0, ymax=0, xmax=0),
        description="Object coordinates for frontend live webcam overlay [ymin, xmin, ymax, xmax]",
    )
    contamination_reason: Optional[str] = Field(None, description="Explanation of contamination or why it violates the bin")
    correct_bin: str = Field("Waiting for Item...", description="Recommended bin (e.g. 'Blue Bin (Recyclables)', 'Specialized E-Waste Drop-off')")
    bin_color: str = Field("Blue", description="Color code: Blue, Green, Black, Red, Yellow, Gray")
    action_required: str = Field("Please place the item clearly in front of the camera.", description="Actionable command")
    points_awarded: int = Field(0, description="Points awarded for this scan")

    # Real-time DynamoDB Score Snapshot:
    user_score: Optional[UserScore] = Field(None, description="Updated user/household score stored in DynamoDB")

    # Supplementary metadata & Knowledge Base analysis:
    material: Optional[str] = Field(None, description="Material detected")
    remediation_steps: List[str] = Field(default_factory=list, description="Step-by-step guidance")
    confidence_score: float = Field(0.95, ge=0.0, le=1.0)
    environmental_impact_tip: Optional[str] = None
    # AWS Cedar Policy Engine Audit Verification:
    cedar_decision: Optional[str] = Field("PERMIT", description="AWS Cedar statutory decision: 'PERMIT' or 'FORBID'")
    cedar_policy_matched: Optional[str] = Field(None, description="AWS Cedar matching policy ID")
    cedar_statutory_citation: Optional[str] = Field(None, description="Official statutory law citation (e.g. MoEFCC SWM 2016 Rule 15)")

    scan_id: Optional[str] = Field(None, description="Unique scan audit ID logged in DynamoDB")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# Backwards compatibility alias
InspectionResponse = InspectionResult


class CategoryInfo(BaseModel):
    category: str
    bin_color: str
    bin_name: str
    examples: List[str]
    rule: str
