import logging
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


from doc_access import give_temporary_edit_access
from zip_upload import (
    configure as configure_zip_upload,
    clean_local_submissions,
    run_upload_flow,
)


logger = logging.getLogger(__name__)


BASE_DIR = Path(__file__).resolve().parent

CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"
SUBMISSIONS_DIR = BASE_DIR / "submissions"

SCOPES = [
    "https://www.googleapis.com/auth/drive"
]


# ============================================================
# AUTHENTICATION
# ============================================================

def get_drive_service():

    credentials = None

    if TOKEN_FILE.exists():

        try:

            if TOKEN_FILE.stat().st_size > 0:

                credentials = (
                    Credentials.from_authorized_user_file(
                        TOKEN_FILE,
                        SCOPES,
                    )
                )

        except Exception as error:

            logger.warning(
                "Existing token could not be loaded: %s",
                error,
            )

            credentials = None

    if (
        credentials
        and credentials.valid
    ):

        logger.info(
            "Existing Google authorization is valid"
        )

    elif (
        credentials
        and credentials.expired
        and credentials.refresh_token
    ):

        logger.info(
            "Refreshing Google authorization"
        )

        try:

            credentials.refresh(
                Request()
            )

            TOKEN_FILE.write_text(
                credentials.to_json()
            )

            logger.info(
                "Google authorization refreshed"
            )

        except Exception as error:

            logger.warning(
                "Token refresh failed: %s",
                error,
            )

            credentials = None

    if credentials is None:

        if not CREDENTIALS_FILE.exists():

            raise FileNotFoundError(
                f"Missing credentials file: "
                f"{CREDENTIALS_FILE}"
            )

        logger.info(
            "Google login required"
        )

        flow = (
            InstalledAppFlow
            .from_client_secrets_file(
                CREDENTIALS_FILE,
                SCOPES,
            )
        )

        credentials = flow.run_local_server(
            port=0
        )

        TOKEN_FILE.write_text(
            credentials.to_json()
        )

        logger.info(
            "Google authorization successful"
        )

    return build(
        "drive",
        "v3",
        credentials=credentials,
    )


# ============================================================
# VIVA FLOW
# ============================================================

def viva_flow():

    FOLDER_ID = os.environ.get("GDRIVE_FOLDER_ID")

    if not FOLDER_ID:

        raise ValueError(
            "GDRIVE_FOLDER_ID is missing from .env"
        )

    student_email = input(
        "Enter student email: "
    ).strip()

    if not student_email:

        raise ValueError(
            "Student email cannot be empty."
        )

    logger.info(
        "Starting Viva flow for %s",
        student_email,
    )

    service = get_drive_service()

    configure_zip_upload(
        FOLDER_ID,
        SUBMISSIONS_DIR,
    )

    clean_local_submissions()

    # ========================================================
    # GOOGLE DOC
    # ========================================================

    logger.info(
        "Granting Google Doc access"
    )

    doc_permission_id = (
        give_temporary_edit_access(
            service,
            student_email,
        )
    )

    logger.info(
        "Google Doc access is active for "
        "approximately 30 minutes"
    )

    # ========================================================
    # ZIP UPLOAD
    # ========================================================

    try:

        project_directory = run_upload_flow(
            service,
            student_email,
        )

        if project_directory:

            logger.info(
                "=========================================="
            )

            logger.info(
                "VIVA SUBMISSION READY"
            )

            logger.info(
                "Student: %s",
                student_email,
            )

            logger.info(
                "Project: %s",
                project_directory,
            )

            logger.info(
                "=========================================="
            )

        else:

            logger.warning(
                "No ZIP submission received"
            )

    except Exception:

        logger.exception(
            "Viva upload flow failed"
        )

        raise

    finally:

        # ----------------------------------------------------
        # IMPORTANT:
        #
        # We DO NOT manually revoke the Doc here.
        #
        # Google will automatically expire the
        # permission after approximately 30 minutes.
        # ----------------------------------------------------

        logger.info(
            "Google Doc permission ID: %s",
            doc_permission_id,
        )

        logger.info(
            "Google Doc access will expire automatically"
        )