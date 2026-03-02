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


def merge_by_page(files, order_json, metadata_json=None, compress=False):
    if not files:
        raise ValueError("No files uploaded.")

    if not order_json:
        raise ValueError("No page order provided.")

    page_order = json.loads(order_json)
    saved_paths = save_uploaded_files(files)

    writer = PdfWriter()
    
    # Bulletproof file handle caching (fixes the "White Pages" bug)
    open_file_handles = []
    readers = {}

    try:
        # 1. Loop through requested order and apply rotation
        for item in page_order:
            file_index = item["fileIndex"]
            page_number = item["pageNumber"]
            rotation_angle = item.get("rotation", 0)

            # Keep file streams explicitly open
            if file_index not in readers:
                file_stream = open(saved_paths[file_index], "rb")
                open_file_handles.append(file_stream)
                readers[file_index] = PdfReader(file_stream)
            
            reader = readers[file_index]

            if page_number < 1 or page_number > len(reader.pages):
                raise ValueError("Invalid page number.")

            page = reader.pages[page_number - 1]
            
            if rotation_angle != 0:
                page.rotate(rotation_angle)

            writer.add_page(page)

        # 2. Apply Compression
        if compress:
            for page in writer.pages:
                page.compress_content_streams()

        # 3. Apply Enhanced Metadata (Forces Windows Explorer to try and read it)
        if metadata_json:
            meta = json.loads(metadata_json)
            formatted_meta = {}
            
            if meta.get("title"): 
                formatted_meta["/Title"] = meta["title"]
            
            if meta.get("author"): 
                formatted_meta["/Author"] = meta["author"]
                # Adding Creator and Producer helps Windows OS read the metadata
                formatted_meta["/Creator"] = meta["author"] 
            
            formatted_meta["/Producer"] = "React & Flask PDF Merger"
            
            if formatted_meta:
                writer.add_metadata(formatted_meta)

        # 4. Save file
        output_filename = f"{uuid4()}_merged.pdf"
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)

        with open(output_path, "wb") as f:
            writer.write(f)

        # 5. Safely close all explicit file streams
        for file_stream in open_file_handles:
            file_stream.close()

        # Cleanup original uploads
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)

        return output_path

    except Exception as e:
        # Cleanup on failure
        for file_stream in open_file_handles:
            try:
                file_stream.close()
            except:
                pass
                
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)
        raise e