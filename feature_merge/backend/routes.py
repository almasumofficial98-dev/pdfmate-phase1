import os
from flask import Blueprint, request, send_file, jsonify
from .service import merge_by_page

merge_bp = Blueprint("merge", __name__)


@merge_bp.route("/merge/", methods=["POST"])
def merge():
    files = request.files.getlist("files")
    order_json = request.form.get("order")
    
    # Layer 4 Data Extraction
    metadata_json = request.form.get("metadata")
    compress = request.form.get("compress") == "true"

    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    if not order_json:
        return jsonify({"error": "No page order provided."}), 400

    try:
        # Pass the new compression and metadata variables to the service
        output_path = merge_by_page(files, order_json, metadata_json, compress)

        if not os.path.exists(output_path):
            return jsonify({"error": "Merged file not created."}), 500

        response = send_file(
            output_path,
            as_attachment=True,
            download_name="merged.pdf",
            mimetype="application/pdf"
        )

        # Auto-delete merged file after sending
        @response.call_on_close
        def cleanup():
            if os.path.exists(output_path):
                os.remove(output_path)

        return response

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500