import time
import asyncio
from typing import Dict, Optional
from uuid import uuid4
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AI Code Generator API", version="1.0.0")

class CodeRequest(BaseModel):
    prompt: str
    language: str = "python"

class GenerationResult(BaseModel):
    code: str
    mode: str
    latency: str

class TaskStatus(BaseModel):
    status: str
    result: Optional[GenerationResult] = None
    error: Optional[str] = None

tasks: Dict[str, TaskStatus] = {}

@app.get("/")
async def root():
    return {"message": "AI Code Generator Platform is running!"}

@app.post("/generate/sync")
def generate_code_sync(request: CodeRequest):
    time.sleep(2)
    return {
        "code": f"# Generated {request.language} code for: {request.prompt}\nprint('Hello World')",
        "mode": "sync",
        "latency": "High (Blocking)"
    }

@app.post("/generate/async")
async def generate_code_async(request: CodeRequest):
    await asyncio.sleep(2)
    return {
        "code": f"# Generated {request.language} code for: {request.prompt}\nprint('Hello World')",
        "mode": "async",
        "latency": "Low (Non-blocking)"
    }

async def run_task(task_id: str, request: CodeRequest):
    tasks[task_id] = TaskStatus(status="running")
    await asyncio.sleep(2)
    tasks[task_id] = TaskStatus(
        status="completed",
        result=GenerationResult(
            code=f"# Generated {request.language} code for: {request.prompt}\nprint('Hello World')",
            mode="async",
            latency="Low (Non-blocking)"
        )
    )

@app.post("/generate/task")
async def generate_code_task(request: CodeRequest):
    task_id = str(uuid4())
    tasks[task_id] = TaskStatus(status="pending")
    asyncio.create_task(run_task(task_id, request))
    return {"task_id": task_id}

@app.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)