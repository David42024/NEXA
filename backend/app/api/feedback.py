from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("/submit")
def submit_feedback(
    payload: schemas.FeedbackSubmit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fb = models.ModelFeedback(
        interaction_id=payload.interaction_id,
        feedback_type=payload.feedback_type,
        comments=payload.comments,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {"detail": "Feedback guardado para mejora continua del modelo", "feedback_id": fb.id}
