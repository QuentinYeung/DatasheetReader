from __future__ import annotations

import io

import pytest
from httpx import ASGITransport, AsyncClient
from pypdf import PdfWriter

from backend.app.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def isolated_data_directory(tmp_path, monkeypatch):
    monkeypatch.setenv("DATASHEET_READER_DATA_DIR", str(tmp_path / "data"))


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as test_client:
        yield test_client


def pdf_bytes(*, encrypted: bool = False) -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    if encrypted:
        writer.encrypt("secret")
    writer.write(output)
    return output.getvalue()


async def test_health_check(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_import_and_read_pdf_copy(client: AsyncClient):
    original = pdf_bytes()
    response = await client.post(
        "/api/documents",
        files={"file": ("controller.pdf", original, "application/pdf")},
    )

    assert response.status_code == 201
    metadata = response.json()
    assert metadata["filename"] == "controller.pdf"
    assert metadata["page_count"] == 1
    assert metadata["size"] == len(original)

    downloaded = await client.get(metadata["file_url"])
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == "application/pdf"
    assert downloaded.content == original

    partial = await client.get(metadata["file_url"], headers={"Range": "bytes=0-4"})
    assert partial.status_code == 206
    assert partial.headers["content-range"] == f"bytes 0-4/{len(original)}"
    assert partial.content == b"%PDF-"


@pytest.mark.parametrize(
    ("filename", "content", "expected_message"),
    [
        ("notes.txt", b"plain text", "扩展名为 .pdf"),
        ("fake.pdf", b"plain text", "内容不是 PDF"),
        ("broken.pdf", b"%PDF-this is broken", "有效的 PDF"),
    ],
)
async def test_rejects_invalid_files(client, filename, content, expected_message):
    response = await client.post(
        "/api/documents",
        files={"file": (filename, content, "application/octet-stream")},
    )
    assert response.status_code == 400
    assert expected_message in response.json()["detail"]


async def test_rejects_encrypted_pdf(client: AsyncClient):
    response = await client.post(
        "/api/documents",
        files={"file": ("locked.pdf", pdf_bytes(encrypted=True), "application/pdf")},
    )
    assert response.status_code == 400
    assert "密码保护" in response.json()["detail"]


async def test_rejects_files_over_size_limit(client: AsyncClient, monkeypatch):
    monkeypatch.setattr("backend.app.storage.MAX_PDF_SIZE", 10)
    response = await client.post(
        "/api/documents",
        files={"file": ("large.pdf", b"%PDF-123456", "application/pdf")},
    )
    assert response.status_code == 413
    assert "50 MB" in response.json()["detail"]


async def test_document_id_cannot_be_used_as_a_path(client: AsyncClient):
    response = await client.get("/api/documents/..%2FREADME.md/file")
    assert response.status_code in {404, 422}
