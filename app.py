# TO RUN: uvicorn app:app --host 127.0.0.1 --port 8765

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from viva_flow import viva_flow, get_drive_service
from doc_access import give_edit_access, revoke_edit_access


load_dotenv()

if not os.getenv("GDRIVE_FOLDER_ID") or not os.getenv("GDOC_FILE_ID"):
    raise Exception(
        "GDRIVE_FOLDER_ID and GDOC_FILE_ID must be set in .env file"
    )

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
    give: bool = None

class EmailRequest(BaseModel):
    email: str


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "Viva API is running"
    }


@app.get("/get-message")
def get_message():
    with open("message.txt", "r", encoding="utf-8") as f:
        message = f.read()

    message = message.replace("{FolderID}", os.getenv("GDRIVE_FOLDER_ID"))
    message = message.replace("{DocID}", os.getenv("GDOC_FILE_ID"))

    return {
        "success": True,
        "message": message
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

@app.post("/get-zip")
def get_zip(request: EmailRequest, background_tasks: BackgroundTasks):

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


@app.post("/doc-access")
def doc_access(request: PermissionRequest):

    email = request.email.strip()
    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email is required"
        )

    logger.info(
        "Document access request received | email=%s | give=%s",
        email,
        request.give
    )

    try:
        # Get your authenticated Google Drive service
        service = get_drive_service()

        if request.give:
            permission_id = give_edit_access(
                service,
                email
            )

            logger.info(
                "Document access operation successful | "
                "action=give | email=%s | permission_id=%s",
                email,
                permission_id
            )

        else:
            revoked = revoke_edit_access(
                service,
                email
            )
            logger.info(
                "Document access operation successful | "
                "action=revoke | email=%s | revoked=%s",
                email,
                revoked
            )

        return {
            "success": True
        }

    except Exception:
        logger.exception(
            "Document access operation FAILED | "
            "email=%s | give=%s",
            email,
            request.give
        )

        raise HTTPException(
            status_code=500,
            detail="Document access operation failed"
        )

