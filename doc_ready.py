import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


load_dotenv()

GDOC_FILE_ID = os.getenv("GDOC_FILE_ID")

if not GDOC_FILE_ID:
    raise ValueError("GDOC_FILE_ID is missing from .env")


SCOPES = [
    "https://www.googleapis.com/auth/drive"
]


def get_drive_service():
    creds = Credentials.from_authorized_user_file(
        "token.json",
        SCOPES
    )

    return build("drive", "v3", credentials=creds)


def give_temporary_edit_access(student_email):
    service = get_drive_service()

    # Access expires 30 minutes from now
    expiration_time = (
        datetime.now(timezone.utc) + timedelta(minutes=30)
    ).isoformat().replace("+00:00", "Z")

    permission = {
        "type": "user",
        "role": "writer",
        "emailAddress": student_email,
        "expirationTime": expiration_time
    }

    result = service.permissions().create(
        fileId=GDOC_FILE_ID,
        body=permission,
        sendNotificationEmail=True
    ).execute()

    print("\nAccess granted successfully!")
    print(f"Student: {student_email}")
    print("Permission: EDITOR")
    print("Duration: 30 minutes")
    print(f"Expires at: {expiration_time}")
    print(f"Permission ID: {result['id']}")


def main():
    student_email = input("Enter student email: ").strip()

    if not student_email:
        print("Student email cannot be empty.")
        return

    give_temporary_edit_access(student_email)


if __name__ == "__main__":
    main()