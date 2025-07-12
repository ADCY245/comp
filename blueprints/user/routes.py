from flask import render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_required, current_user
from .. import db
from functools import wraps

@user_bp.route('/dashboard')
@login_required
def dashboard():
    # user_quotes = current_user.quotations.order_by(Quotation.created_at.desc()).limit(5).all()
    return render_template('user/dashboard.html', quotes=[])

@user_bp.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        # Update user profile logic here
        pass
    return render_template('user/profile.html')

@user_bp.route('/quotations')
@login_required
def my_quotations():
    # quotations = current_user.quotations.order_by(Quotation.created_at.desc()).all()
    return render_template('user/quotations.html', quotations=[])

@user_bp.route('/quotations/new', methods=['GET', 'POST'])
@login_required
def new_quotation():
    if request.method == 'POST':
        # Handle new quotation submission
        pass
    return render_template('user/new_quotation.html')

@user_bp.route('/quotations/<int:quote_id>')
@login_required
def view_quotation(quote_id):
    # quote = Quotation.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    return render_template('user/view_quotation.html', quote={})
