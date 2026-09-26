from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional

class AttendanceEvent(BaseModel):
    employee_id: str = Field(..., min_length=1, max_length=50)
    event_type: str = Field(..., pattern='^(in|out)$')
    captured_at: datetime
    work_date: str = Field(..., pattern='^\d{4}-\d{2}-\d{2}$')
    shift_code: str = Field(..., min_length=1, max_length=10)
    was_late: bool
    was_early: bool
    device_id: Optional[str] = Field(None, min_length=1, max_length=50)
    nonce: str = Field(..., min_length=36, max_length=36)
    source: str = Field(..., pattern='^(kiosk|admin|essl)$')

    @validator('captured_at')
    def validate_captured_at(cls, v):
        if v > datetime.now():
            raise ValueError('captured_at cannot be in the future')
        return v

def validate_attendance_event(event: dict) -> dict:
    validated = AttendanceEvent(**event)
    return validated.dict()
