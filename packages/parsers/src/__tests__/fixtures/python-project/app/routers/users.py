from fastapi import APIRouter
from ..models.user_model import User

router = APIRouter()

@router.get("/users")
async def list_users():
    return []

@router.post("/users")
async def create_user():
    return {"id": 1}

@router.get("/users/{user_id}")
async def get_user(user_id: int):
    return {"id": user_id}
