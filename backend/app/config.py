import os
from dotenv import load_dotenv

# Load variables from .env file if it exists
load_dotenv()

class Settings:
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_SESSION_TOKEN: str = os.getenv("AWS_SESSION_TOKEN", "")
    
    # Bedrock Model ID
    # Options:
    # anthropic.claude-3-5-sonnet-20250219-v1:0 (Claude 3.5 Sonnet v2)
    # us.anthropic.claude-3-5-sonnet-20241022-v2:0 (US cross-region inference profile)
    # anthropic.claude-3-5-sonnet-20240620-v1:0 (Claude 3.5 Sonnet v1)
    # anthropic.claude-3-haiku-20240307-v1:0 (Claude 3 Haiku for ultra-low latency)
    BEDROCK_MODEL_ID: str = os.getenv(
        "BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20250219-v1:0"
    )
    
    # DynamoDB Audit Logging
    DYNAMODB_TABLE_NAME: str = os.getenv("DYNAMODB_TABLE_NAME", "SegregateGuard_Scans")
    ENABLE_DYNAMODB_LOGGING: bool = os.getenv("ENABLE_DYNAMODB_LOGGING", "true").lower() in ("true", "1", "yes")

    # Server Host & Port
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Mock flag for offline/testing development
    USE_MOCK_BEDROCK: bool = os.getenv("USE_MOCK_BEDROCK", "false").lower() in ("true", "1", "yes")

settings = Settings()
