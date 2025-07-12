from flask import Blueprint

# Create main blueprint
main_bp = Blueprint('main', __name__)

# Import routes after creating the blueprint to avoid circular imports
from . import routes
