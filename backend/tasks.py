import time
import random
from celery_app import celery_app
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

@celery_app.task(bind=True)
def generate_code_task(self, prompt: str, language: str):
    """
    Simulate a heavy code generation task.
    In a real scenario, this would call an LLM API.
    """
    logger.info(f"Starting code generation for prompt: {prompt}")
    
    # Simulate processing time (e.g., calling OpenAI API)
    time.sleep(random.uniform(1.0, 3.0))
    
    # Mock result
    code_snippet = f"""
# Generated {language} code based on: {prompt}
def solution():
    print("This is a high-concurrency generated solution.")
    return True
"""
    
    return {
        "code": code_snippet,
        "mode": "async_celery",
        "latency": "Optimized"
    }