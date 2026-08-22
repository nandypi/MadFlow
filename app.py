# TO RUN: uvicorn app:app --host 127.0.0.1 --port 8765

import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from viva_flow import viva_flow


load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s | "
        "%(levelname)-8s | "
        "%(name)s | "
        "%(message)s"
    ),
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Viva API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PermissionRequest(BaseModel):
    email: str


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "Viva API is running"
    }



def run_viva_flow(email: str):
    try:
        logger.info("Starting Viva flow for %s", email)

        viva_flow(email)

        logger.info("Viva flow finished for %s", email)

    except Exception:
        logger.exception(
            "Viva flow failed for %s",
            email
        )

@app.post("/give-access")
def give_access(request: PermissionRequest, background_tasks: BackgroundTasks):

    email = request.email.strip()

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email is required"
        )

    logger.info(
        "Permission request received for %s",
        email
    )

    background_tasks.add_task(
        run_viva_flow,
        email
    )

    return {
        "success": True,
        "email": email,
        "message": "Viva flow started"
    }