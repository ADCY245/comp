from flask import render_template, redirect, url_for, flash, request, current_app
from flask_login import current_user
from . import main_bp

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/about')
def about():
    return render_template('about.html')

@main_bp.route('/contact', methods=['GET', 'POST'])
def contact():
    if request.method == 'POST':
        # Handle contact form submission
        name = request.form.get('name')
        email = request.form.get('email')
        message = request.form.get('message')
        
        # Here you would typically send an email
        # send_contact_email(name, email, message)
        
        flash('Thank you for your message. We will get back to you soon!', 'success')
        return redirect(url_for('main.contact'))
    
    return render_template('contact.html')

@main_bp.route('/pricing')
def pricing():
    return render_template('pricing.html')

@main_bp.route('/features')
def features():
    return render_template('features.html')

@main_bp.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy_policy.html')

@main_bp.route('/terms-of-service')
def terms_of_service():
    return render_template('terms_of_service.html')

# Error handlers
@main_bp.app_errorhandler(403)
def forbidden_error(error):
    return render_template('errors/403.html'), 403

@main_bp.app_errorhandler(404)
def not_found_error(error):
    return render_template('errors/404.html'), 404

@main_bp.app_errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('errors/500.html'), 500
