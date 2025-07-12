from flask import render_template, request, jsonify
from werkzeug.exceptions import HTTPException
import logging

def init_error_handlers(app):
    """Initialize error handlers for the application."""
    
    @app.errorhandler(400)
    def bad_request_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Bad Request',
                'message': str(error)
            }), 400
        return render_template('errors/400.html', error=error), 400
    
    @app.errorhandler(401)
    def unauthorized_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Unauthorized',
                'message': 'Authentication is required to access this resource.'
            }), 401
        return render_template('errors/401.html', error=error), 401
    
    @app.errorhandler(403)
    def forbidden_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'You do not have permission to access this resource.'
            }), 403
        return render_template('errors/403.html', error=error), 403
    
    @app.errorhandler(404)
    def not_found_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Not Found',
                'message': 'The requested resource was not found.'
            }), 404
        return render_template('errors/404.html', error=error), 404
    
    @app.errorhandler(405)
    def method_not_allowed_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Method Not Allowed',
                'message': 'The method is not allowed for the requested URL.'
            }), 405
        return render_template('errors/405.html', error=error), 405
    
    @app.errorhandler(413)
    def request_entity_too_large_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Request Entity Too Large',
                'message': 'The file is too large. Maximum file size is 16MB.'
            }), 413
        return render_template('errors/413.html', error=error), 413
    
    @app.errorhandler(500)
    def internal_error(error):
        # Log the error
        app.logger.error(f'Internal Server Error: {error}')
        
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Internal Server Error',
                'message': 'An internal server error occurred.'
            }), 500
        return render_template('errors/500.html', error=error), 500
    
    # Handle all other HTTP exceptions
    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': error.name,
                'message': error.description
            }), error.code
        return render_template(f'errors/{error.code}.html', error=error), error.code
    
    # Handle unhandled exceptions
    @app.errorhandler(Exception)
    def handle_exception(error):
        # Log the error
        app.logger.error(f'Unhandled Exception: {error}', exc_info=True)
        
        # Handle different types of exceptions
        if isinstance(error, HTTPException):
            return error
            
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'error': 'Internal Server Error',
                'message': 'An unexpected error occurred.'
            }), 500
            
        return render_template('errors/500.html', error=error), 500


def log_error(message, exc_info=False, level='error'):
    """Log an error message with the application's logger."""
    logger = logging.getLogger(__name__)
    log_level = getattr(logging, level.upper(), logging.ERROR)
    logger.log(log_level, message, exc_info=exc_info)
