"""
essl-sync/schemas.py
Pydantic models that validate every attendance event before it reaches Supabase.
"""

from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator


class AttendanceEventSchema(BaseModel):
    employee_id: str = Field(..., min_length=1, max_length=64)
    event_type: str = Field(..., pattern="^(in|out)$")
    captured_at: datetime
    work_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    shift_code: str = Field(..., min_length=1, max_length=10)
    was_late: bool = False
    was_early: bool = False
    device_id: str = Field(..., min_length=1, max_length=64)
    nonce: str = Field(..., min_length=36, max_length=36)
    source: str = Field(..., pattern="^(kiosk|admin|essl)$")
    synced_offline: bool = False
    match_score: float | None = None

    @field_validator("captured_at")
    @classmethod
    def not_in_future(cls, v: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        # allow small clock skew (5 min into the future) but reject anything bigger
        if (v - now).total_seconds() > 300:
            raise ValueError("captured_at is too far in the future")
        return v


class CSRFRequest(BaseModel):
    """Payload for CSRF token requests."""
    action: str = Field(..., min_length=1, max_length=50)


def validate_event(data: dict) -> dict:
    """Validate and normalise a single attendance event dict."""
    return AttendanceEventSchema(**data).model_dump(mode="json")
