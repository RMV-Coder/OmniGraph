from fastapi import FastAPI
from .routers import users
from .models import user_model

app = FastAPI()

app.include_router(users.router)
