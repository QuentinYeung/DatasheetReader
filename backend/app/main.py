from fastapi import FastAPI, File, Path, Request, Response, UploadFile, status

from .storage import document_path, save_pdf

app = FastAPI(
    title="Datasheet Reader API",
    version="0.1.0",
    description="Local PDF import service for Datasheet Reader.",
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/documents", status_code=status.HTTP_201_CREATED)
async def import_document(file: UploadFile = File(...)) -> dict[str, str | int]:
    metadata = save_pdf(file)
    metadata["file_url"] = f"/api/documents/{metadata['document_id']}/file"
    return metadata


@app.get("/api/documents/{document_id}/file")
async def read_document(
    request: Request,
    document_id: str = Path(pattern=r"^[0-9a-f]{64}$"),
) -> Response:
    path = document_path(document_id)
    file_size = path.stat().st_size
    start = 0
    end = file_size - 1
    response_status = status.HTTP_200_OK
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
    }

    range_header = request.headers.get("range")
    if range_header:
        try:
            unit, raw_range = range_header.split("=", 1)
            if unit.strip().lower() != "bytes" or "," in raw_range:
                raise ValueError
            raw_start, raw_end = raw_range.strip().split("-", 1)
            if raw_start:
                start = int(raw_start)
                end = int(raw_end) if raw_end else file_size - 1
            else:
                suffix_length = int(raw_end)
                if suffix_length <= 0:
                    raise ValueError
                start = max(file_size - suffix_length, 0)
                end = file_size - 1
            if start < 0 or start >= file_size or end < start:
                raise ValueError
            end = min(end, file_size - 1)
        except (ValueError, TypeError):
            return Response(
                status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{file_size}"},
            )
        response_status = status.HTTP_206_PARTIAL_CONTENT
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    with path.open("rb") as pdf_file:
        pdf_file.seek(start)
        content = pdf_file.read(end - start + 1)

    headers["Content-Length"] = str(len(content))
    return Response(
        content=content,
        media_type="application/pdf",
        headers=headers,
        status_code=response_status,
    )
