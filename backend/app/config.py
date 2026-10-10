import os
from dotenv import load_dotenv

# Load variables from .env file if it exists
load_dotenv()

class Settings:
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_SESSION_TOKEN: str = os.getenv("AWS_SESSION_TOKEN", "")
    
    # Bedrock Model ID (Must support multimodal image input)
    # Verified AWS Bedrock Vision Models:
    # - anthropic.claude-3-5-sonnet-20240620-v1:0 (Claude 3.5 Sonnet v1 - On-Demand Vision)
    # - us.anthropic.claude-3-5-sonnet-20241022-v2:0 (Claude 3.5 Sonnet v2 - US Cross-Region Profile)
    # - anthropic.claude-3-haiku-20240307-v1:0 (Claude 3 Haiku Vision - Fast On-Demand)
    # - anthropic.claude-3-sonnet-20240229-v1:0 (Claude 3 Sonnet Vision)
    _raw_model_id: str = os.getenv(
        "BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20240620-v1:0"
    ).strip()
    BEDROCK_MODEL_ID: str = (
        "anthropic.claude-3-5-sonnet-20240620-v1:0"
        if _raw_model_id in ("", "anthropic.claude-3-5-sonnet-20250219-v1:0")
        else _raw_model_id
    )
    
    # DynamoDB Audit Logging
    DYNAMODB_TABLE_NAME: str = os.getenv("DYNAMODB_TABLE_NAME", "ShieldBin_Scans")
    ENABLE_DYNAMODB_LOGGING: bool = os.getenv("ENABLE_DYNAMODB_LOGGING", "true").lower() in ("true", "1", "yes")

    # Server Host & Port
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Mock flag for offline/testing development
    USE_MOCK_BEDROCK: bool = os.getenv("USE_MOCK_BEDROCK", "false").lower() in ("true", "1", "yes")

settings = Settings()
