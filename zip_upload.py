import logging
import shutil
import time
import zipfile
from pathlib import Path

from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload


logger = logging.getLogger(__name__)


MAX_WAIT_MINUTES = 15
POLL_INTERVAL_SECONDS = 3


FOLDER_ID = None
SUBMISSIONS_DIR = None


def configure(
    folder_id: str,
    submissions_dir: Path,
):
    """
    Configure the upload module.
    """

    global FOLDER_ID
    global SUBMISSIONS_DIR

    FOLDER_ID = folder_id
    SUBMISSIONS_DIR = submissions_dir

    logger.debug(
        "ZIP upload module configured"
    )


# ============================================================
# FOLDER
# ============================================================

def get_folder(service):

    logger.info(
        "Checking Google Drive upload folder"
    )

    folder = service.files().get(
        fileId=FOLDER_ID,
        fields="id,name,mimeType,webViewLink",
    ).execute()

    if (
        folder["mimeType"]
        != "application/vnd.google-apps.folder"
    ):
        raise RuntimeError(
            "GDRIVE_FOLDER_ID does not point "
            "to a Google Drive folder."
        )

    logger.info(
        "Upload folder: %s",
        folder["name"],
    )

    return folder


def list_folder_items(service):

    items = []
    page_token = None

    while True:

        response = service.files().list(
            q=(
                f"'{FOLDER_ID}' in parents "
                "and trashed = false"
            ),
            spaces="drive",
            fields=(
                "nextPageToken,"
                "files("
                "id,"
                "name,"
                "mimeType,"
                "size,"
                "owners(emailAddress,displayName),"
                "parents"
                ")"
            ),
            pageToken=page_token,
        ).execute()

        items.extend(
            response.get("files", [])
        )

        page_token = response.get(
            "nextPageToken"
        )

        if not page_token:
            break

    return items


# ============================================================
# STUDENT ACCESS
# ============================================================

def give_student_edit_access(
    service,
    student_email: str,
):
    """
    Give only the specified student writer
    access to the upload folder.
    """

    logger.info(
        "Giving upload-folder edit access to %s",
        student_email,
    )

    permission = service.permissions().create(
        fileId=FOLDER_ID,
        body={
            "type": "user",
            "role": "writer",
            "emailAddress": student_email,
        },
        sendNotificationEmail=True,
        fields="id,type,role,emailAddress",
    ).execute()

    permission_id = permission["id"]

    logger.info(
        "Upload-folder access granted"
    )

    logger.info(
        "Folder permission ID: %s",
        permission_id,
    )

    return permission_id


def revoke_student_access(
    service,
    permission_id: str,
    student_email: str,
):
    """
    Immediately remove the student's folder access.
    """

    if not permission_id:
        return

    logger.info(
        "Revoking upload-folder access from %s",
        student_email,
    )

    try:

        service.permissions().delete(
            fileId=FOLDER_ID,
            permissionId=permission_id,
        ).execute()

        logger.info(
            "Upload-folder access revoked"
        )

    except HttpError as error:

        logger.warning(
            "Could not revoke folder access: %s",
            error,
        )


# ============================================================
# CLEAN DRIVE
# ============================================================

def remove_item_from_folder(
    service,
    item,
):
    """
    Delete an item from the upload folder.

    If deletion isn't allowed, remove the folder
    from the item's parents.
    """

    file_id = item["id"]
    file_name = item["name"]

    try:

        service.files().delete(
            fileId=file_id
        ).execute()

        logger.info(
            "Deleted Drive item: %s",
            file_name,
        )

        return True

    except HttpError as delete_error:

        if delete_error.resp.status == 403:

            logger.info(
                "Cannot permanently delete %s "
                "(not owned by your account). "
                "Removing it from upload folder instead.",
                file_name,
            )

        logger.debug(
            "Permanent delete failed for %s: %s",
            file_name,
            delete_error,
        )

        try:

            service.files().update(
                fileId=file_id,
                removeParents=FOLDER_ID,
                fields="id,parents",
            ).execute()

            logger.info(
                "Removed Drive item from folder: %s",
                file_name,
            )

            return True

        except HttpError as remove_error:

            logger.error(
                "Could not remove %s",
                file_name,
            )

            logger.error(
                "Delete error: %s",
                delete_error,
            )

            logger.error(
                "Remove error: %s",
                remove_error,
            )

            return False


def clean_drive_folder(service):

    logger.info(
        "Cleaning Google Drive upload folder"
    )

    items = list_folder_items(service)

    if not items:

        logger.info(
            "Upload folder is already empty"
        )

        return True

    success = True

    for item in items:

        if not remove_item_from_folder(
            service,
            item,
        ):
            success = False

    remaining = list_folder_items(service)

    if remaining:

        logger.error(
            "Upload folder is not empty"
        )

        for item in remaining:

            logger.error(
                "Remaining item: %s",
                item["name"],
            )

        return False

    logger.info(
        "Upload folder is empty"
    )

    return success


# ============================================================
# ZIP
# ============================================================

def find_zip(service):

    items = list_folder_items(service)

    for item in items:

        if item["name"].lower().endswith(".zip"):

            return item

    return None


def wait_for_zip(service):

    """
    Wait maximum MAX_WAIT_MINUTES for a ZIP.

    Returns:
        ZIP metadata if found.
        None if timeout occurs.
    """

    logger.info(
        "Waiting for ZIP submission "
        "(maximum %d minutes)",
        MAX_WAIT_MINUTES,
    )

    start_time = time.monotonic()

    while True:

        elapsed = (
            time.monotonic()
            - start_time
        )

        if elapsed >= MAX_WAIT_MINUTES * 60:

            logger.warning(
                "15-minute upload timeout reached"
            )

            return None

        zip_file = find_zip(service)

        if zip_file:

            logger.info(
                "ZIP detected: %s",
                zip_file["name"],
            )

            return zip_file

        remaining = (
            MAX_WAIT_MINUTES * 60
            - elapsed
        )

        minutes = int(
            remaining // 60
        )

        seconds = int(
            remaining % 60
        )

        logger.info(
            "Waiting for ZIP... %02d:%02d remaining",
            minutes,
            seconds,
        )

        time.sleep(
            POLL_INTERVAL_SECONDS
        )


def download_zip(
    service,
    file_id,
    destination: Path,
):

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    logger.info(
        "Downloading ZIP: %s",
        destination.name,
    )

    request = service.files().get_media(
        fileId=file_id
    )

    with destination.open("wb") as file_handle:

        downloader = MediaIoBaseDownload(
            file_handle,
            request,
        )

        done = False

        while not done:

            status, done = (
                downloader.next_chunk()
            )

            if status:

                progress = int(
                    status.progress() * 100
                )

                logger.info(
                    "Download progress: %d%%",
                    progress,
                )

    if (
        not destination.exists()
        or destination.stat().st_size == 0
    ):

        raise RuntimeError(
            "Downloaded ZIP could not be verified."
        )

    logger.info(
        "ZIP downloaded successfully"
    )


# ============================================================
# EXTRACTION
# ============================================================

def extract_zip(zip_path: Path):

    project_name = zip_path.stem

    extraction_dir = (
        SUBMISSIONS_DIR /
        project_name
    )

    counter = 2
    original_dir = extraction_dir

    while extraction_dir.exists():

        extraction_dir = Path(
            f"{original_dir}_{counter}"
        )

        counter += 1

    extraction_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    logger.info(
        "Extracting project to %s",
        extraction_dir,
    )

    with zipfile.ZipFile(
        zip_path,
        "r",
    ) as archive:

        destination_root = (
            extraction_dir.resolve()
        )

        for member in archive.infolist():

            member_path = (
                extraction_dir /
                member.filename
            ).resolve()

            if (
                member_path != destination_root
                and destination_root
                not in member_path.parents
            ):

                raise RuntimeError(
                    "Unsafe ZIP path detected: "
                    f"{member.filename}"
                )

        archive.extractall(
            extraction_dir
        )

    logger.info(
        "ZIP extracted successfully"
    )

    return extraction_dir


# ============================================================
# LOCAL CLEANUP
# ============================================================

def clean_local_submissions():

    logger.info(
        "Cleaning local submissions folder"
    )

    SUBMISSIONS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    for item in SUBMISSIONS_DIR.iterdir():

        try:

            if item.is_dir():

                shutil.rmtree(item)

            else:

                item.unlink()

            logger.info(
                "Deleted local item: %s",
                item.name,
            )

        except Exception as error:

            raise RuntimeError(
                f"Could not delete {item}: {error}"
            )

    logger.info(
        "Local submissions folder is clean"
    )


# ============================================================
# COMPLETE ZIP FLOW
# ============================================================

def run_upload_flow(
    service,
    student_email: str,
):
    """
    Complete upload flow.

    Folder access remains available until:

        1. ZIP is uploaded
        OR
        2. 15 minutes expire

    Whichever happens first causes folder
    access to be revoked.
    """

    permission_id = None

    try:

        folder = get_folder(service)

        drive_clean = clean_drive_folder(
            service
        )

        if not drive_clean:

            raise RuntimeError(
                "Upload folder could not be "
                "cleaned completely."
            )

        permission_id = (
            give_student_edit_access(
                service,
                student_email,
            )
        )

        folder_link = folder.get(
            "webViewLink"
        )

        logger.info(
            "Upload link: %s",
            folder_link,
        )

        zip_file = wait_for_zip(
            service
        )

        # ----------------------------------------------------
        # TIMEOUT
        # ----------------------------------------------------

        if not zip_file:

            logger.warning(
                "No ZIP submitted within 15 minutes"
            )

            return None

        # ----------------------------------------------------
        # DOWNLOAD
        # ----------------------------------------------------

        local_zip = (
            SUBMISSIONS_DIR /
            zip_file["name"]
        )

        download_zip(
            service,
            zip_file["id"],
            local_zip,
        )

        # ----------------------------------------------------
        # ZIP RECEIVED → REVOKE ACCESS
        # ----------------------------------------------------

        revoke_student_access(
            service,
            permission_id,
            student_email,
        )

        permission_id = None

        # ----------------------------------------------------
        # CLEAN DRIVE
        # ----------------------------------------------------

        logger.info(
            "Removing submission from Drive"
        )

        remaining_items = (
            list_folder_items(service)
        )

        for item in remaining_items:

            remove_item_from_folder(
                service,
                item,
            )

        # ----------------------------------------------------
        # EXTRACT
        # ----------------------------------------------------

        project_directory = extract_zip(
            local_zip
        )

        logger.info(
            "Submission ready: %s",
            project_directory,
        )

        return project_directory

    finally:

        # ----------------------------------------------------
        # SAFETY: ALWAYS REVOKE FOLDER ACCESS
        # ----------------------------------------------------

        if permission_id:

            revoke_student_access(
                service,
                permission_id,
                student_email,
            )

            permission_id = None