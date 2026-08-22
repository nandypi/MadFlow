# VivaFlow

A lightweight local tool for conducting **Modern Application Development (MAD) project vivas**.

VivaFlow creates a temporary Google Drive upload area for one student at a time. During the viva, the student uploads their project ZIP while being supervised. The tool automatically downloads the submission, makes the Drive folder private again, extracts the project locally, and prepares it for evaluation.

## Features

* Uses a personal Google Drive account.
* Uses the Google Drive API.
* Free to use for this workflow.
* OAuth authentication with Google.
* Automatically reuses `token.json` when valid.
* Re-authenticates if the token is missing, invalid, or cannot be refreshed.
* Cleans the Google Drive upload folder before each viva.
* Cleans the local `submissions/` directory before each viva.
* Temporarily makes the Drive folder publicly writable.
* Displays the upload link for the student.
* Waits for a ZIP submission.
* Maximum waiting time is configurable.
* Supports manual termination with `Ctrl+C`.
* Revokes public access when the script stops.
* Downloads the submitted ZIP locally.
* Removes the submission from the Drive upload folder.
* Extracts the project locally.
* Deletes the downloaded ZIP after extraction.
* Does **not execute student code**.

## Workflow

```text
Start VivaFlow
      │
      ▼
Authenticate with Google Drive
      │
      ▼
Clean local submissions/
      │
      ▼
Clean Google Drive upload folder
      │
      ▼
Make Drive folder publicly writable
      │
      ▼
Display upload link
      │
      ▼
Student uploads project.zip
      │
      ▼
Download ZIP
      │
      ▼
Revoke public access immediately
      │
      ▼
Remove submission from Drive folder
      │
      ▼
Extract ZIP locally
      │
      ▼
Delete local ZIP
      │
      ▼
Project ready for viva
```

## Requirements

* Python 3.10+
* A Google account
* A Google Drive folder
* Google Drive API enabled
* OAuth 2.0 Desktop Application credentials

## Project structure

```text
VivaFlow/
├── .venv/
├── submissions/
├── .env
├── .env.example
├── .gitignore
├── credentials.json
├── token.json
├── viva_upload.py
└── README.md
```

### Important files

| File               | Purpose                                      |
| ------------------ | -------------------------------------------- |
| `viva_upload.py`   | Main VivaFlow application                    |
| `.env`             | Local configuration                          |
| `.env.example`     | Example environment configuration            |
| `credentials.json` | Google OAuth client credentials              |
| `token.json`       | Google OAuth authorization token             |
| `submissions/`     | Temporary local project extraction directory |

`credentials.json` and `token.json` contain sensitive authentication information and **must not be committed to Git**.

## Configuration

Create `.env`:

```env
GDRIVE_FOLDER_ID=your_google_drive_folder_id
```

For example:

```env
GDRIVE_FOLDER_ID=1qQa62frhU44jHaLBZ2wBHK1uDtIMNl3x
```

`.env.example` should contain only:

```env
GDRIVE_FOLDER_ID=
```

Do not commit your actual `.env` file.

## Google Drive setup

### 1. Create a Google Cloud project

Open the [Google Cloud Console](https://console.cloud.google.com/).

Create a project for VivaFlow.

### 2. Enable Google Drive API

In the Google Cloud project:

```text
APIs & Services
    ↓
Library
    ↓
Google Drive API
    ↓
Enable
```

### 3. Create OAuth credentials

Create an OAuth 2.0 Client ID for a **Desktop application**.

Download the credentials JSON.

Place it in the project root as:

```text
credentials.json
```

Do not commit this file.

### 4. Create the Drive folder

Create a folder in your Google Drive, for example:

```text
Viva Zip Upload
```

Copy its folder ID into `.env`.

For a URL such as:

```text
https://drive.google.com/drive/folders/1qQa62frhU44jHaLBZ2wBHK1uDtIMNl3x
```

the folder ID is:

```text
1qQa62frhU44jHaLBZ2wBHK1uDtIMNl3x
```

## Installation

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib python-dotenv
```

## First run

Run:

```bash
python viva_upload.py
```

On the first run, a browser window will open for Google authentication.

Sign in with the Google account that owns the Viva upload folder.

After successful authentication, `token.json` will be created.

Future runs will normally reuse the existing authorization without requiring another login.

If the token is missing, invalid, expired and cannot be refreshed, or otherwise unusable, VivaFlow will request Google authentication again.

## Running a viva

Start the application:

```bash
python viva_upload.py
```

VivaFlow will:

1. Authenticate with Google.
2. Clean `submissions/`.
3. Clean the Google Drive upload folder.
4. Make the Drive folder publicly writable.
5. Display the upload link.
6. Wait for the student's ZIP.
7. Download the ZIP.
8. Immediately revoke public access.
9. Remove the submission from the Drive upload folder.
10. Extract the ZIP into `submissions/`.
11. Delete the local ZIP.

The student only needs to upload their project ZIP while you supervise the process.

## Waiting behavior

The default maximum waiting time is **15 minutes**.

The script does not require the student to upload within a fixed short period.

If the student uploads after 30 seconds:

```text
ZIP detected
→ Download
→ Revoke access
→ Extract
```

If the student takes several minutes, the script continues waiting.

You can manually stop the application with:

```text
Ctrl+C
```

When stopped while the folder is public, VivaFlow attempts to revoke public access before exiting.

## Local submissions

The extracted project is stored under:

```text
submissions/
```

For example:

```text
submissions/
└── MAD2camp1-11AM-main/
    ├── frontend/
    ├── backend/
    ├── requirements.txt
    └── ...
```

The downloaded ZIP itself is deleted after successful extraction.

At the beginning of the **next VivaFlow run**, everything inside `submissions/` is removed so the next student starts with a clean workspace.

## Google Drive cleanup

The Drive upload folder is also cleaned at the beginning of every run.

This prevents an old submission from appearing to be the next student's submission.

After a successful download, public access is revoked immediately before the local extraction process begins.

For files uploaded by another Google account, Google Drive API permissions can differ from the Drive web interface. VivaFlow therefore attempts to remove the submission from the upload folder rather than assuming it can permanently delete a file owned by another user.

## Security

VivaFlow is designed for supervised one-to-one viva sessions.

The Drive folder is public only while waiting for a submission.

Once the ZIP is detected and successfully downloaded:

```text
Public folder
     ↓
ZIP downloaded
     ↓
Public access revoked
     ↓
Drive cleanup
     ↓
Local extraction
```

Student project code is **never executed by VivaFlow**.

The application only downloads and extracts the submitted archive.

### Never commit these files

```text
.env
credentials.json
token.json
```

Your `.gitignore` should include:

```gitignore
.venv/
.env
credentials.json
token.json
__pycache__/
*.pyc
submissions/
```

## Free to use

VivaFlow is designed to run entirely on your own computer using:

* Python
* Google Drive
* Google Drive API
* Google OAuth

No paid hosting, server, database, Firebase, AWS, or third-party automation service is required.

## License

This project is intended for personal/educational use in conducting Modern Application Development project vivas.
