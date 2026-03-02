from flask import Flask
from flask_cors import CORS
from feature_merge.backend.routes import merge_bp

def create_app():
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(merge_bp)

    @app.route("/")
    def health():
        return {"status": "Phase 1 Structural API Running"}

    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)