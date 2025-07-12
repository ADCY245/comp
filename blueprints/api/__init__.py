from flask import Blueprint

# Create API blueprint
api_bp = Blueprint('api', __name__)

def init_api(app):
    # Any API-specific initialization can go here
    pass

# Import routes after creating the blueprint to avoid circular imports
from . import routes
