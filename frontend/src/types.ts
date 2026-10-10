export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface UserScore {
  user_id: string;
  ward_id: string;
  total_points: number;
  total_scans: number;
  correct_scans: number;
  contamination_prevented: number;
  segregation_accuracy_pct: number;
  last_updated: string;
}

export interface InspectRequest {
  image_base64: string;
  target_bin?: string;
  user_id?: string;
  ward_id?: string;
  location_context?: string;
  user_prompt?: string;
}

export interface InspectionResponse {
  success: boolean;
  item_detected: string | null;
  category: string;
  is_contaminated: boolean;
  is_segregation_correct: boolean;
  box_color: 'green' | 'red';
  bounding_box: BoundingBox;
  contamination_reason?: string | null;
  correct_bin: string;
  bin_color: string;
  action_required: string;
  points_awarded: number;
  user_score?: UserScore;
  material?: string;
  remediation_steps: string[];
  confidence_score: number;
  environmental_impact_tip?: string | null;
  engine_source: string;
  cedar_decision?: 'PERMIT' | 'FORBID';
  cedar_policy_matched?: string | null;
  cedar_statutory_citation?: string | null;
  scan_id?: string | null;
  timestamp: string;
}

export type InspectionResult = InspectionResponse;

