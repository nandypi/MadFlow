from pathlib import Path
import shutil
import time
import zipfile

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload


# ============================================================
# CONFIGURATION
# ============================================================

FOLDER_ID = "1qQa62frhU44jHaLBZ2wBHK1uDtIMNl3x"

MAX_WAIT_MINUTES = 15
POLL_INTERVAL_SECONDS = 3

SCOPES = [
    "https://www.googleapis.com/auth/drive"
]

BASE_DIR = Path(__file__).resolve().parent

CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"

SUBMISSIONS_DIR = BASE_DIR / "submissions"


# ============================================================
# GOOGLE AUTHENTICATION
# ============================================================

def get_drive_service():
    """
    Load token.json if possible.

    If token.json is missing, empty, invalid, expired without
    a refresh token, or cannot be refreshed, ask for login.
    """

    credentials = None

    # --------------------------------------------------------
    # Try existing token
    # --------------------------------------------------------

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
            print(
                f"! Existing token could not be loaded: "
                f"{error}"
            )

            credentials = None

    # --------------------------------------------------------
    # Existing token is valid
    # --------------------------------------------------------

    if credentials and credentials.valid:

        print("✓ Existing Google authorization is valid.")

    # --------------------------------------------------------
    # Token expired but can be refreshed
    # --------------------------------------------------------

    elif (
        credentials
        and credentials.expired
        and credentials.refresh_token
    ):

        print("Google authorization expired.")
        print("Attempting to refresh...")

        try:

            credentials.refresh(Request())

            TOKEN_FILE.write_text(
                credentials.to_json()
            )

            print("✓ Google authorization refreshed.")

        except Exception as error:

            print(
                f"! Token refresh failed: {error}"
            )

            credentials = None

    # --------------------------------------------------------
    # Need new login
    # --------------------------------------------------------

    else:

        credentials = None

    if credentials is None:

        if not CREDENTIALS_FILE.exists():

            raise FileNotFoundError(
                f"Missing OAuth credentials file:\n"
                f"{CREDENTIALS_FILE}"
            )

        print()
        print("Google login required.")
        print("Opening browser...")

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

        print("✓ Google authorization successful.")

    return build(
        "drive",
        "v3",
        credentials=credentials,
    )


# ============================================================
# DRIVE HELPERS
# ============================================================

def get_folder(service):

    folder = service.files().get(
        fileId=FOLDER_ID,
        fields="id,name,mimeType,webViewLink",
    ).execute()

    if (
        folder["mimeType"]
        != "application/vnd.google-apps.folder"
    ):
        raise RuntimeError(
            "FOLDER_ID does not point to a Google Drive folder."
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
# DRIVE CLEANUP
# ============================================================

def remove_item_from_folder(service, item):
    """
    Remove an item from the Viva upload folder.

    First try to permanently delete it.

    If the item is owned by another user and Google refuses
    deletion, remove the Viva folder from its parents instead.
    """

    file_id = item["id"]
    file_name = item["name"]

    # --------------------------------------------------------
    # First attempt: permanently delete
    # --------------------------------------------------------

    try:

        service.files().delete(
            fileId=file_id
        ).execute()

        print(
            f"  ✓ Permanently deleted: "
            f"{file_name}"
        )

        return True

    except HttpError as delete_error:

        # ----------------------------------------------------
        # If deletion isn't allowed, remove from our folder.
        # ----------------------------------------------------

        try:

            service.files().update(
                fileId=file_id,
                removeParents=FOLDER_ID,
                fields="id,parents",
            ).execute()

            print(
                f"  ✓ Removed from Viva folder: "
                f"{file_name}"
            )

            return True

        except HttpError as remove_error:

            print()
            print(
                f"  ✗ Could not remove: "
                f"{file_name}"
            )

            print(
                f"    Delete error: "
                f"{delete_error}"
            )

            print(
                f"    Remove error: "
                f"{remove_error}"
            )

            return False


def clean_drive_folder(service):
    """
    Make sure the Viva upload folder is empty.
    """

    print()
    print("Cleaning Google Drive upload folder...")

    items = list_folder_items(service)

    if not items:

        print("✓ Google Drive folder is already empty.")
        return True

    success = True

    for item in items:

        result = remove_item_from_folder(
            service,
            item,
        )

        if not result:
            success = False

    # --------------------------------------------------------
    # Verify
    # --------------------------------------------------------

    remaining = list_folder_items(
        service
    )

    if remaining:

        print()
        print(
            "✗ Google Drive folder is NOT empty."
        )

        print()
        print("Remaining items:")

        for item in remaining:

            print(
                f"  - {item['name']}"
            )

        return False

    print()
    print("✓ Google Drive folder is completely empty.")

    return success


# ============================================================
# LOCAL CLEANUP
# ============================================================

def clean_local_submissions():
    """
    Delete everything inside submissions/.

    Keep the submissions directory itself.
    """

    print()
    print("Cleaning local submissions folder...")

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

            print(
                f"  ✓ Deleted: {item.name}"
            )

        except Exception as error:

            raise RuntimeError(
                f"Could not delete "
                f"{item}: {error}"
            )

    print(
        "✓ Local submissions folder is clean."
    )


# ============================================================
# PUBLIC ACCESS
# ============================================================

def make_folder_public(service):

    print()
    print(
        "Making Viva folder publicly writable..."
    )

    permission = service.permissions().create(
        fileId=FOLDER_ID,
        body={
            "type": "anyone",
            "role": "writer",
        },
        fields="id,type,role",
    ).execute()

    permission_id = permission["id"]

    print(
        "✓ Folder is publicly writable."
    )

    return permission_id


def revoke_public_access(
    service,
    permission_id,
):

    if not permission_id:
        return

    print()
    print(
        "Revoking public access..."
    )

    try:

        service.permissions().delete(
            fileId=FOLDER_ID,
            permissionId=permission_id,
        ).execute()

        print(
            "✓ Public access revoked."
        )

    except HttpError as error:

        print(
            "! WARNING: Could not revoke "
            f"public access: {error}"
        )


# ============================================================
# ZIP DETECTION
# ============================================================

def find_zip(service):

    items = list_folder_items(
        service
    )

    for item in items:

        if item["name"].lower().endswith(
            ".zip"
        ):

            return item

    return None


# ============================================================
# DOWNLOAD
# ============================================================

def download_zip(
    service,
    file_id,
    destination,
):

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    print()
    print(
        f"Downloading: {destination.name}"
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

                print(
                    f"\rDownload progress: "
                    f"{progress}%",
                    end="",
                    flush=True,
                )

    print()
    print("✓ Download completed.")


# ============================================================
# ZIP EXTRACTION
# ============================================================

def extract_zip(zip_path):

    project_name = zip_path.stem

    extraction_dir = (
        SUBMISSIONS_DIR /
        project_name
    )

    # --------------------------------------------------------
    # If the same name somehow exists, use _2, _3, etc.
    # --------------------------------------------------------

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

    print()
    print("Extracting project to:")
    print(
        f"  {extraction_dir}"
    )

    with zipfile.ZipFile(
        zip_path,
        "r",
    ) as archive:

        destination_root = (
            extraction_dir.resolve()
        )

        # ----------------------------------------------------
        # Basic ZIP path safety check
        # ----------------------------------------------------

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

    print(
        "✓ ZIP extracted."
    )

    return extraction_dir


# ============================================================
# MAIN WORKFLOW
# ============================================================

def run_viva_flow():

    service = None
    public_permission_id = None

    try:

        print("=" * 60)
        print(
            "        MODERN APPLICATION DEVELOPMENT VIVA"
        )
        print("=" * 60)

        # ----------------------------------------------------
        # AUTHENTICATION
        # ----------------------------------------------------

        print()
        print(
            "Connecting to Google Drive..."
        )

        service = get_drive_service()

        folder = get_folder(
            service
        )

        print()
        print(
            "✓ Connected to Google Drive"
        )

        print(
            f"Folder: {folder['name']}"
        )

        # ----------------------------------------------------
        # CLEAN LOCAL SUBMISSIONS
        # ----------------------------------------------------

        clean_local_submissions()

        # ----------------------------------------------------
        # CLEAN GOOGLE DRIVE
        # ----------------------------------------------------

        drive_clean = (
            clean_drive_folder(
                service
            )
        )

        if not drive_clean:

            raise RuntimeError(
                "Google Drive folder could not "
                "be cleaned completely. "
                "Folder will NOT be made public."
            )

        # ----------------------------------------------------
        # MAKE PUBLIC
        # ----------------------------------------------------

        public_permission_id = (
            make_folder_public(
                service
            )
        )

        folder_link = (
            folder.get("webViewLink")
        )

        print()
        print("=" * 60)
        print("UPLOAD LINK")
        print("=" * 60)
        print(folder_link)
        print("=" * 60)

        print()
        print(
            "Give this link to the student."
        )

        print(
            "Waiting for ZIP submission..."
        )

        print(
            "Press Ctrl+C to stop manually."
        )

        print(
            f"Maximum waiting time: "
            f"{MAX_WAIT_MINUTES} minutes."
        )

        # ----------------------------------------------------
        # WAIT FOR ZIP
        # ----------------------------------------------------

        start_time = time.monotonic()

        zip_file = None

        while True:

            elapsed = (
                time.monotonic()
                - start_time
            )

            if (
                elapsed
                >= MAX_WAIT_MINUTES * 60
            ):

                print()
                print(
                    "Maximum waiting time reached."
                )

                break

            zip_file = find_zip(
                service
            )

            if zip_file:

                print()
                print(
                    f"✓ ZIP detected: "
                    f"{zip_file['name']}"
                )

                break

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

            print(
                f"\rWaiting... "
                f"{minutes:02d}:"
                f"{seconds:02d}",
                end="",
                flush=True,
            )

            time.sleep(
                POLL_INTERVAL_SECONDS
            )

        # ----------------------------------------------------
        # NO SUBMISSION
        # ----------------------------------------------------

        if not zip_file:

            print()
            print(
                "No ZIP submission received."
            )

            return

        # ----------------------------------------------------
        # DOWNLOAD ZIP
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
        # VERIFY LOCAL DOWNLOAD
        # ----------------------------------------------------

        if (
            not local_zip.exists()
            or local_zip.stat().st_size == 0
        ):

            raise RuntimeError(
                "ZIP download could not "
                "be verified."
            )

        print(
            "✓ Local ZIP verified."
        )

        # ----------------------------------------------------
        # REVOKE PUBLIC ACCESS IMMEDIATELY
        # ----------------------------------------------------

        revoke_public_access(
            service,
            public_permission_id,
        )

        public_permission_id = None

        # ----------------------------------------------------
        # REMOVE ZIP FROM DRIVE FOLDER
        # ----------------------------------------------------

        print()
        print(
            "Removing submission from "
            "Google Drive..."
        )

        remaining_items = (
            list_folder_items(
                service
            )
        )

        cleanup_success = True

        for item in remaining_items:

            if not remove_item_from_folder(
                service,
                item,
            ):

                cleanup_success = False

        if not cleanup_success:

            print()
            print(
                "WARNING: Some Drive items "
                "could not be removed."
            )

        # ----------------------------------------------------
        # VERIFY DRIVE FOLDER
        # ----------------------------------------------------

        remaining_items = (
            list_folder_items(
                service
            )
        )

        if remaining_items:

            print()
            print(
                "WARNING: Drive folder still "
                "contains:"
            )

            for item in remaining_items:

                print(
                    f"  - {item['name']}"
                )

        else:

            print()
            print(
                "✓ Google Drive folder is empty."
            )

        # ----------------------------------------------------
        # EXTRACT
        # ----------------------------------------------------

        project_directory = (
            extract_zip(
                local_zip
            )
        )

        # ----------------------------------------------------
        # DELETE LOCAL ZIP
        # ----------------------------------------------------

        print()
        print(
            "Deleting local ZIP..."
        )

        local_zip.unlink()

        print(
            "✓ Local ZIP deleted."
        )

        # ----------------------------------------------------
        # FINAL STATUS
        # ----------------------------------------------------

        print()
        print("=" * 60)
        print(
            "             SUBMISSION READY"
        )
        print("=" * 60)

        print()
        print(
            "Project location:"
        )

        print(
            project_directory
        )

        print()
        print(
            "Google Drive folder is private."
        )

        print(
            "Local submissions folder "
            "contains this submission."
        )

    except KeyboardInterrupt:

        print()
        print()
        print(
            "Ctrl+C received."
        )

        print(
            "Stopping safely..."
        )

    except Exception as error:

        print()
        print("=" * 60)
        print("ERROR")
        print("=" * 60)

        print(error)

    finally:

        # ----------------------------------------------------
        # ALWAYS REVOKE PUBLIC ACCESS
        # ----------------------------------------------------

        if (
            service
            and public_permission_id
        ):

            revoke_public_access(
                service,
                public_permission_id,
            )

        print()

        if public_permission_id:

            print(
                "✓ Safety cleanup completed."
            )

        print(
            "Exiting."
        )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    run_viva_flow()