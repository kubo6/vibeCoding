import time
import asyncio
from typing import Dict, Optional, Any
from uuid import uuid4
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from redis import Redis
import os
from celery.result import AsyncResult
from sqlalchemy.orm import Session

# Database & Auth Imports
from database import engine, SessionLocal, get_db, Base
import models
from auth import (
    get_password_hash, 
    verify_password, 
    create_access_token, 
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from datetime import timedelta

# Import Celery app and task
from celery_app import celery_app
from tasks import generate_code_task

# Create DB Tables
Base.metadata.create_all(bind=engine)

# Create DB Tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Code Generator API", version="1.0.0")

# Redis Configuration for Rate Limiting
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = Redis.from_url(REDIS_URL, decode_responses=True)

# Pydantic Models
class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class CodeRequest(BaseModel):
    prompt: str
    language: str = "python"

class GenerationResult(BaseModel):
    code: str
    mode: str
    latency: str

# Rate Limiter Dependency
async def rate_limiter(request: Request):
    client_ip = request.client.host
    key = f"rate_limit:{client_ip}"
    limit = 10
    period = 60
    current = redis_client.incr(key)
    if current == 1:
        redis_client.expire(key, period)
    if current > limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

# Auth Endpoints
@app.post("/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = models.User(username=user.username, hashed_password=hashed_password, email=user.email)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

@app.get("/")
async def root():
    return {"message": "AI Code Generator Platform is running with Celery, Redis & Auth!"}

@app.post("/generate/task", dependencies=[Depends(rate_limiter)])
async def generate_code_task_endpoint(
    request: CodeRequest, 
    current_user: models.User = Depends(get_current_user), # Protected Endpoint
    db: Session = Depends(get_db)
):
    # Dispatch task to Celery queue
    task = generate_code_task.delay(request.prompt, request.language)
    
    # Log task in DB
    db_task = models.Task(
        id=task.id,
        prompt=request.prompt,
        language=request.language,
        owner_id=current_user.id
    )
    db.add(db_task)
    db.commit()
    
    return {"task_id": task.id}

@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task_result = AsyncResult(task_id, app=celery_app)
    
    status = task_result.status.lower() # PENDING, STARTED, SUCCESS, FAILURE, RETRY, REVOKED
    
    response = {
        "status": status,
        "result": None,
        "error": None
    }

    if status == 'success':
        result_data = task_result.result
        # Ensure result matches expected structure
        response["status"] = "completed"
        response["result"] = GenerationResult(
            code=result_data.get("code", ""),
            mode=result_data.get("mode", "async_celery"),
            latency=result_data.get("latency", "Unknown")
        )
    elif status == 'failure':
        response["status"] = "failed"
        response["error"] = str(task_result.result)
    elif status in ['pending', 'started', 'retry']:
        response["status"] = "running" if status == 'started' else "pending"
        
    return response


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)