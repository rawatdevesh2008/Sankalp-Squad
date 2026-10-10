import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import boto3
from botocore.exceptions import ClientError, BotoCoreError, NoCredentialsError

from app.config import settings
from app.models import UserScore

logger = logging.getLogger("shieldbin.dynamodb")

class DynamoDBService:
    def __init__(self):
        self.table_name = settings.DYNAMODB_TABLE_NAME
        self.scores_table_name = f"{settings.DYNAMODB_TABLE_NAME}_Scores"
        self.region = settings.AWS_REGION
        self.enabled = settings.ENABLE_DYNAMODB_LOGGING
        self._dynamodb_resource = None
        self._table = None
        self._scores_table = None

        # In-memory score cache so scores persist and update live even in local testing!
        self._local_user_scores: Dict[str, Dict[str, Any]] = {}
        self._init_resource()

    def _init_resource(self):
        """Initializes the boto3 DynamoDB resource."""
        if not self.enabled:
            logger.info("DynamoDB logging is disabled in configuration.")
            return

        if any(p in (settings.AWS_ACCESS_KEY_ID or "").lower() for p in ["your_aws", "placeholder", "your_access_key"]):
            logger.info("Demo/placeholder AWS credentials detected. Operating with in-memory scores.")
            self._dynamodb_resource = None
            self._table = None
            self._scores_table = None
            return

        try:
            if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
                self._dynamodb_resource = boto3.resource(
                    "dynamodb",
                    region_name=self.region,
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    aws_session_token=settings.AWS_SESSION_TOKEN or None,
                )
            else:
                self._dynamodb_resource = boto3.resource(
                    "dynamodb",
                    region_name=self.region,
                )
            
            self._table = self._dynamodb_resource.Table(self.table_name)
            self._scores_table = self._dynamodb_resource.Table(self.scores_table_name)
            logger.info(f"DynamoDB tables configured: {self.table_name}, {self.scores_table_name}")
        except Exception as e:
            logger.warning(f"Could not connect to DynamoDB: {e}. Local fallback active.")
            self._dynamodb_resource = None
            self._table = None
            self._scores_table = None

    def log_scan_and_update_score(
        self,
        scan_result: Dict[str, Any],
        user_id: str = "household_402",
        ward_id: str = "Ward-12 (Delhi)",
    ) -> (str, UserScore):
        """
        1. Logs the individual scan audit trail.
        2. Updates and recalculates the user/ward segregation score in DynamoDB.
        """
        scan_id = f"scan_{uuid.uuid4().hex[:12]}"
        timestamp = datetime.now(timezone.utc).isoformat()

        # 1. Update in-memory user score record
        if user_id not in self._local_user_scores:
            self._local_user_scores[user_id] = {
                "user_id": user_id,
                "ward_id": ward_id,
                "total_points": 100,  # Base starting points
                "total_scans": 0,
                "correct_scans": 0,
                "contamination_prevented": 0,
                "segregation_accuracy_pct": 100.0,
                "last_updated": timestamp,
            }

        score_rec = self._local_user_scores[user_id]
        
        # If no object is detected in frame, return current score without altering scan statistics
        if scan_result.get("item_detected") in ("None", None):
            return scan_id, UserScore(**score_rec)

        points_awarded = int(scan_result.get("points_awarded", 0))

        is_correct = bool(scan_result.get("is_segregation_correct", True))
        is_contaminated = bool(scan_result.get("is_contaminated", False))

        score_rec["total_scans"] += 1
        score_rec["total_points"] = max(0, score_rec["total_points"] + points_awarded)
        if is_correct:
            score_rec["correct_scans"] += 1
        if is_contaminated:
            score_rec["contamination_prevented"] += 1

        accuracy = (score_rec["correct_scans"] / score_rec["total_scans"]) * 100.0
        score_rec["segregation_accuracy_pct"] = round(accuracy, 1)
        score_rec["last_updated"] = timestamp

        updated_user_score = UserScore(**score_rec)

        # 2. Write to DynamoDB if available
        if self._table is not None:
            try:
                # Log scan
                scan_record = {
                    "scan_id": scan_id,
                    "timestamp": timestamp,
                    "user_id": user_id,
                    "ward_id": ward_id,
                    "item_detected": str(scan_result.get("item_detected", "Unknown")),
                    "category": str(scan_result.get("category", "General Waste")),
                    "is_contaminated": is_contaminated,
                    "is_segregation_correct": is_correct,
                    "correct_bin": str(scan_result.get("correct_bin", "Blue Bin")),
                    "action_required": str(scan_result.get("action_required", "None")),
                    "points_awarded": points_awarded,
                }
                self._table.put_item(Item=scan_record)

                # Update user score in DynamoDB
                if self._scores_table is not None:
                    self._scores_table.put_item(Item=score_rec)

                logger.info(f"DynamoDB updated for user '{user_id}': Score={score_rec['total_points']}")
            except (ClientError, NoCredentialsError, BotoCoreError) as err:
                logger.warning(f"Could not persist to AWS DynamoDB ({err}). Kept in memory.")
            except Exception as ex:
                logger.error(f"Unexpected error in DynamoDB operation: {ex}")

        return scan_id, updated_user_score

    def get_user_score(self, user_id: str = "household_402") -> UserScore:
        """Retrieves current score for a household or ward."""
        if user_id in self._local_user_scores:
            return UserScore(**self._local_user_scores[user_id])
        
        # Default fresh profile
        return UserScore(
            user_id=user_id,
            ward_id="Ward-12 (Delhi)",
            total_points=100,
            total_scans=0,
            correct_scans=0,
            contamination_prevented=0,
            segregation_accuracy_pct=100.0,
            last_updated=datetime.now(timezone.utc).isoformat(),
        )


dynamodb_service = DynamoDBService()
