"""
WSGI config for Moneda project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/wsgi/
"""
import os
from app import create_app

# Create application instance
application = create_app()

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 3000))
    if os.environ.get('FLASK_ENV') == 'production':
        from waitress import serve
        serve(application, host="0.0.0.0", port=port)
    else:
        application.run(host='0.0.0.0', port=port, debug=True)
