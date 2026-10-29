from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path, PurePosixPath

from fastapi import HTTPException, UploadFile, status
from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PDF_SIZE = 50 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024


def data_directory() -> Path:
    """Return a per-user data directory without writing inside the repository."""
    override = os.getenv("DATASHEET_READER_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()

    if os.name == "nt":
        base = Path(os.getenv("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "DatasheetReader"


def _safe_filename(filename: str | None) -> str:
    normalized = (filename or "").replace("\\", "/")
    safe_name = PurePosixPath(normalized).name.strip()
    if not safe_name or safe_name in {".", ".."}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件名无效。")
    if Path(safe_name).suffix.lower() != ".pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请选择扩展名为 .pdf 的文件。")
    return safe_name


def _inspect_pdf(path: Path) -> int:
    try:
        reader = PdfReader(path, strict=True)
        if reader.is_encrypted:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "暂不支持加密或受密码保护的 PDF。",
            )
        page_count = len(reader.pages)
        if page_count < 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "PDF 中没有可显示的页面。")
        return page_count
    except HTTPException:
        raise
    except (PdfReadError, OSError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "文件不是有效的 PDF，或文件已经损坏。",
        ) from exc


def save_pdf(upload: UploadFile) -> dict[str, str | int]:
    """Validate an upload and keep a content-addressed application copy."""
    original_name = _safe_filename(upload.filename)
    root = data_directory()
    uploads = root / "documents"
    metadata_dir = root / "metadata"
    uploads.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha256()
    size = 0
    temporary_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, dir=uploads, suffix=".upload") as target:
            temporary_path = Path(target.name)
            while chunk := upload.file.read(UPLOAD_CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_PDF_SIZE:
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE,
                        "PDF 不能超过 50 MB。",
                    )
                digest.update(chunk)
                target.write(chunk)

        if size == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "PDF 文件为空。")

        with temporary_path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "文件内容不是 PDF。")

        page_count = _inspect_pdf(temporary_path)
        document_id = digest.hexdigest()
        final_path = uploads / f"{document_id}.pdf"
        if final_path.exists():
            temporary_path.unlink()
            temporary_path = None
        else:
            temporary_path.replace(final_path)
            temporary_path = None

        metadata = {
            "document_id": document_id,
            "filename": original_name,
            "size": size,
            "page_count": page_count,
        }
        (metadata_dir / f"{document_id}.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return metadata
    finally:
        upload.file.close()
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def document_path(document_id: str) -> Path:
    path = data_directory() / "documents" / f"{document_id}.pdf"
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "未找到这份 PDF。")
    return path
