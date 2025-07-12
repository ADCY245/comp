"""
WSGI config for the application.

It exposes the WSGI callable as a module-level variable named ``application``.
"""
import os
from app import create_app

# Create application instance
application = create_app()

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    if os.environ.get('FLASK_ENV') == 'production':
        from waitress import serve
        serve(application, host="0.0.0.0", port=port)
    else:
        application.run(host='0.0.0.0', port=port, debug=True)
