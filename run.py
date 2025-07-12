#!/usr/bin/env python
"""
Run the Flask application.

This script serves as the main entry point for running the application.
It can be used for both development and production environments.
"""
import os
from app import create_app

# Create the Flask application
app = create_app()

if __name__ == '__main__':
    # Run the application
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_ENV') == 'development')
