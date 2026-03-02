import os
import json
from uuid import uuid4
from PyPDF2 import PdfReader, PdfWriter

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "temp_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def save_uploaded_files(files):
    saved_paths = []

    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are allowed.")

        unique_name = f"{uuid4()}_{file.filename}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_name)

        file.save(file_path)
        saved_paths.append(file_path)

    return saved_paths


def merge_by_page(files, order_json):
    if not files:
        raise ValueError("No files uploaded.")

    if not order_json:
        raise ValueError("No page order provided.")

    page_order = json.loads(order_json)

    saved_paths = save_uploaded_files(files)

    writer = PdfWriter()

    try:
        for item in page_order:
            file_index = item["fileIndex"]
            page_number = item["pageNumber"]

            reader = PdfReader(saved_paths[file_index])

            if page_number < 1 or page_number > len(reader.pages):
                raise ValueError("Invalid page number.")

            writer.add_page(reader.pages[page_number - 1])

        output_filename = f"{uuid4()}_merged.pdf"
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)

        with open(output_path, "wb") as f:
            writer.write(f)

        # Cleanup original uploads
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)

        return output_path

    except Exception as e:
        # Cleanup on failure
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)
        raise e