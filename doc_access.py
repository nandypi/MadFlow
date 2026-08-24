import logging
import os

from googleapiclient.errors import HttpError


logger = logging.getLogger(__name__)


def give_edit_access(service, student_email: str):
    """
    Give the student editor access to the Google Doc.

    This is NOT temporary access.
    The permission remains until explicitly revoked.
    """

    GDOC_FILE_ID = os.environ.get("GDOC_FILE_ID")

    if not GDOC_FILE_ID:
        raise ValueError("GDOC_FILE_ID is missing from .env")

    logger.info(
        "Giving permanent Google Doc edit access to %s",
        student_email
    )

    permission = {
        "type": "user",
        "role": "writer",
        "emailAddress": student_email,
    }

    result = service.permissions().create(
        fileId=GDOC_FILE_ID,
        body=permission,
        sendNotificationEmail=False,
        fields="id,type,role,emailAddress",
    ).execute()

    permission_id = result["id"]

    logger.info(
        "Google Doc edit access granted | student=%s | permission_id=%s",
        student_email,
        permission_id,
    )

    return permission_id


def revoke_edit_access(service, student_email: str):
    """
    Revoke the student's Google Doc access.

    Finds the permission belonging to the email and deletes it.
    """

    GDOC_FILE_ID = os.environ.get("GDOC_FILE_ID")

    if not GDOC_FILE_ID:
        raise ValueError("GDOC_FILE_ID is missing from .env")

    logger.info(
        "Revoking Google Doc access from %s",
        student_email
    )

    permissions = service.permissions().list(
        fileId=GDOC_FILE_ID,
        fields="permissions(id,type,role,emailAddress)"
    ).execute()

    student_permission = None

    for permission in permissions.get("permissions", []):
        if (
            permission.get("type") == "user"
            and permission.get("emailAddress", "").lower()
            == student_email.lower()
        ):
            student_permission = permission
            break

    if not student_permission:
        logger.info(
            "No Google Doc permission found for %s",
            student_email
        )

        # Treat this as success because the desired state
        # is that the student has no access.
        return False

    permission_id = student_permission["id"]

    logger.info(
        "Found permission | student=%s | permission_id=%s | role=%s",
        student_email,
        permission_id,
        student_permission.get("role"),
    )

    service.permissions().delete(
        fileId=GDOC_FILE_ID,
        permissionId=permission_id,
    ).execute()

    logger.info(
        "Google Doc access revoked | student=%s | permission_id=%s",
        student_email,
        permission_id,
    )

    return True