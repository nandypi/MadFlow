import logging
import os
from datetime import datetime, timedelta, timezone

from googleapiclient.errors import HttpError


logger = logging.getLogger(__name__)

DOC_ACCESS_MINUTES = 30

def give_temporary_edit_access(
    service,
    student_email: str,
):
    """
    Give a student temporary editor access
    to the Google Doc.

    Google Drive automatically expires the
    permission after DOC_ACCESS_MINUTES.
    """

    GDOC_FILE_ID = os.environ.get("GDOC_FILE_ID")

    if not GDOC_FILE_ID:
        raise ValueError(
            "GDOC_FILE_ID is missing from .env"
        )

    expiration_time = (
        datetime.now(timezone.utc)
        + timedelta(minutes=DOC_ACCESS_MINUTES)
    )

    expiration_iso = (
        expiration_time
        .isoformat()
        .replace("+00:00", "Z")
    )

    logger.info(
        "Giving Google Doc edit access to %s",
        student_email,
    )

    permission = {
        "type": "user",
        "role": "writer",
        "emailAddress": student_email,
        "expirationTime": expiration_iso,
    }

    result = service.permissions().create(
        fileId=GDOC_FILE_ID,
        body=permission,
        sendNotificationEmail=True,
        fields="id,type,role,emailAddress,expirationTime",
    ).execute()

    permission_id = result["id"]

    logger.info(
        "Google Doc edit access granted"
    )

    logger.info(
        "Student: %s",
        student_email,
    )

    logger.info(
        "Permission ID: %s",
        permission_id,
    )

    logger.info(
        "Doc access expires at: %s",
        expiration_iso,
    )

    return permission_id


def revoke_edit_access(
    service,
    permission_id: str,
    student_email: str,
):
    """
    Explicitly revoke Google Doc access.

    Normally Google will automatically expire
    the permission after 30 minutes.
    """

    if not permission_id:
        return

    GDOC_FILE_ID = os.environ.get("GDOC_FILE_ID")

    if not GDOC_FILE_ID:
        raise ValueError(
            "GDOC_FILE_ID is missing from .env"
        )

    logger.info(
        "Revoking Google Doc access from %s",
        student_email,
    )

    try:

        service.permissions().delete(
            fileId=GDOC_FILE_ID,
            permissionId=permission_id,
        ).execute()

        logger.info(
            "Google Doc access revoked"
        )

    except HttpError as error:

        logger.warning(
            "Could not revoke Google Doc access: %s",
            error,
        )