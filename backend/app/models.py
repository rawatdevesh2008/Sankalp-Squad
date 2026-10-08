from pydantic import BaseModel, Field
from typing import List, Optional

class BoundingBox(BaseModel):
    ymin: int = Field(..., description="Top edge coordinate on 0-1000 scale")
    xmin: int = Field(..., description="Left edge coordinate on 0-1000 scale")
    ymax: int = Field(..., description="Bottom edge coordinate on 0-1000 scale")
    xmax: int = Field(..., description="Right edge coordinate on 0-1000 scale")

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
    target_bin: Optional[str] = Field("Dry Recyclable", description="Bin being scanned: 'Dry Recyclable', 'Wet Organic', or 'Auto-Detect'")
    user_id: Optional[str] = Field("household_402", description="Household or user identifier")
    ward_id: Optional[str] = Field("Ward-12 (Delhi)", description="Ward or municipal zone identifier")
    location_context: Optional[str] = Field("India - Municipal", description="Optional local waste context")

class InspectionResponse(BaseModel):
    success: bool = True
    
    # Core Demo Focus fields:
    item_detected: str = Field(..., description="Detected object name (e.g. 'Greasy Pizza Box')")
    category: str = Field(..., description="Material category: Dry Recyclable, Wet Organic, Sanitary/Landfill, E-Waste")
    is_contaminated: bool = Field(..., description="True if contamination is detected")
    is_segregation_correct: bool = Field(..., description="True if item matches the target bin; False if cross-contaminating")
    box_color: str = Field(..., description="'green' if segregation is correct, 'red' if contaminated/wrong bin")
    bounding_box: BoundingBox = Field(..., description="Object coordinates for frontend live webcam overlay [ymin, xmin, ymax, xmax]")
    contamination_reason: Optional[str] = Field(None, description="Explanation of contamination or why it violates the bin")
    correct_bin: str = Field(..., description="Recommended bin (e.g. 'Blue Bin (Recyclables)', 'Black Bin (Landfill)')")
    bin_color: str = Field("Blue", description="Color code: Blue, Green, Black, Red, Yellow")
    action_required: str = Field(..., description="Actionable command, e.g. 'Greasy pizza box detected in dry paper bin — move to organic/landfill'")
    points_awarded: int = Field(..., description="Points awarded for this scan")
    
    # Real-time DynamoDB Score Snapshot:
    user_score: Optional[UserScore] = Field(None, description="Updated user/household score stored in DynamoDB")

    # Supplementary metadata:
    material: Optional[str] = Field(None, description="Material detected")
    remediation_steps: List[str] = Field(default_factory=list, description="Step-by-step guidance")
    confidence_score: float = Field(0.95, ge=0.0, le=1.0)
    environmental_impact_tip: Optional[str] = None
    engine_source: str = Field(..., description="Amazon Bedrock model ID or Simulation status")
    scan_id: Optional[str] = Field(None, description="Unique scan audit ID logged in DynamoDB")
    timestamp: str

class CategoryInfo(BaseModel):
    category: str
    bin_color: str
    bin_name: str
    examples: List[str]
    rule: str
