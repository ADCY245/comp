from flask import render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from .. import db
from functools import wraps

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash('You do not have permission to access this page.', 'danger')
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

@admin_bp.route('/')
@login_required
@admin_required
def dashboard():
    # Get counts for dashboard
    # user_count = User.query.count()
    # quote_count = Quotation.query.count()
    # recent_quotes = Quotation.query.order_by(Quotation.created_at.desc()).limit(5).all()
    
    return render_template('admin/dashboard.html', 
                         user_count=0, 
                         quote_count=0,
                         recent_quotes=[])

@admin_bp.route('/users')
@login_required
@admin_required
def manage_users():
    # users = User.query.all()
    return render_template('admin/manage_users.html', users=[])

@admin_bp.route('/quotations')
@login_required
@admin_required
def quotation_history():
    # quotations = Quotation.query.order_by(Quotation.created_at.desc()).all()
    return render_template('admin/quotation_history.html', quotations=[])

@admin_bp.route('/quotations/<int:quote_id>')
@login_required
@admin_required
def view_quote(quote_id):
    # quote = Quotation.query.get_or_404(quote_id)
    return render_template('admin/view_quote.html', quote={})

# API Endpoints for AJAX calls
@admin_bp.route('/api/users/<int:user_id>/role', methods=['POST'])
@login_required
@admin_required
def update_user_role(user_id):
    # user = User.query.get_or_404(user_id)
    # data = request.get_json()
    # user.role = data.get('role')
    # db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_user(user_id):
    # user = User.query.get_or_404(user_id)
    # db.session.delete(user)
    # db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/api/quotations/<int:quote_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_quote(quote_id):
    # quote = Quotation.query.get_or_404(quote_id)
    # db.session.delete(quote)
    # db.session.commit()
    return jsonify({'success': True})
