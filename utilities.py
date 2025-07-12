import os
import string
import random
import logging
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, current_app
import jwt
from bson import ObjectId

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_random_string(length=12):
    """Generate a random string of fixed length."""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

def generate_verification_token(user_id, expires_in=3600):
    """Generate a JWT token for email verification."""
    payload = {
        'user_id': str(user_id),
        'exp': datetime.utcnow() + timedelta(seconds=expires_in),
        'type': 'verification'
    }
    return jwt.encode(
        payload,
        current_app.config['SECRET_KEY'],
        algorithm='HS256'
    )

def verify_token(token, token_type='verification'):
    """Verify a JWT token and return the payload if valid."""
    try:
        payload = jwt.decode(
            token,
            current_app.config['SECRET_KEY'],
            algorithms=['HS256']
        )
        if payload.get('type') != token_type:
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError) as e:
        logger.error(f"Token verification failed: {str(e)}")
        return None

def allowed_file(filename, allowed_extensions=None):
    """Check if the file has an allowed extension."""
    if allowed_extensions is None:
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions

def save_uploaded_file(file, upload_folder, allowed_extensions=None):
    """Save an uploaded file to the specified folder."""
    if file and allowed_file(file.filename, allowed_extensions):
        # Create upload folder if it doesn't exist
        os.makedirs(upload_folder, exist_ok=True)
        
        # Generate a secure filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{generate_random_string(8)}.{file_ext}"
        filepath = os.path.join(upload_folder, filename)
        
        # Save the file
        file.save(filepath)
        return filename, filepath
    return None, None

def json_response(success=True, message="", data=None, status_code=200):
    """Create a standardized JSON response."""
    response = {
        'success': success,
        'message': message,
        'data': data
    }
    return jsonify(response), status_code

def admin_required(f):
    """Decorator to ensure the user has admin privileges."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            if request.path.startswith('/api/'):
                return jsonify({
                    'success': False,
                    'message': 'Admin privileges required',
                    'error': 'forbidden'
                }), 403
            return current_app.login_manager.unauthorized()
        return f(*args, **kwargs)
    return decorated_function

def validate_object_id(id_param):
    """Decorator to validate MongoDB ObjectId in route parameters."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if id_param in kwargs:
                try:
                    # This will raise an exception if the ID is invalid
                    ObjectId(kwargs[id_param])
                except:
                    if request.path.startswith('/api/'):
                        return jsonify({
                            'success': False,
                            'message': 'Invalid ID format',
                            'error': 'bad_request'
                        }), 400
                    from flask import abort
                    abort(400, 'Invalid ID format')
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def paginate(query, page=1, per_page=20):
    """Paginate a MongoDB query."""
    return query.skip((page - 1) * per_page).limit(per_page)

def format_currency(amount, currency='USD'):
    """Format a number as currency."""
    try:
        amount = float(amount)
        return f"{currency} {amount:,.2f}"
    except (ValueError, TypeError):
        return f"{currency} 0.00"

def format_date(date_value, format_str='%Y-%m-%d %H:%M:%S'):
    """Format a datetime object as a string."""
    if not date_value:
        return ''
    if isinstance(date_value, str):
        # Try to parse the string as a datetime
        try:
            date_value = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        except ValueError:
            return date_value  # Return as-is if we can't parse it
    return date_value.strftime(format_str)

def get_pagination_info(page, per_page, total_items, endpoint, **kwargs):
    """Generate pagination information for templates."""
    total_pages = (total_items + per_page - 1) // per_page
    
    return {
        'page': page,
        'per_page': per_page,
        'total_items': total_items,
        'total_pages': total_pages,
        'has_prev': page > 1,
        'has_next': page < total_pages,
        'prev_num': page - 1 if page > 1 else None,
        'next_num': page + 1 if page < total_pages else None,
        'iter_pages': range(1, total_pages + 1)
    }

def send_email(subject, recipients, text_body, html_body=None, sender=None):
    """Send an email using Flask-Mail."""
    from flask_mail import Message
    from . import mail
    
    if not sender:
        sender = current_app.config['MAIL_DEFAULT_SENDER']
    
    msg = Message(
        subject=subject,
        sender=sender,
        recipients=recipients
    )
    msg.body = text_body
    
    if html_body:
        msg.html = html_body
    
    try:
        mail.send(msg)
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return False

def log_activity(user_id, action, details=None):
    """Log user activity to the database."""
    from . import db
    
    activity = {
        'user_id': user_id,
        'action': action,
        'details': details or {},
        'ip_address': request.remote_addr,
        'user_agent': request.user_agent.string if request.user_agent else None,
        'created_at': datetime.utcnow()
    }
    
    db.activity_logs.insert_one(activity)
