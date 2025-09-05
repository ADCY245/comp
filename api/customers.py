from flask import Blueprint, jsonify, request, current_app
from functools import wraps
from flask_login import current_user, login_required
from bson import ObjectId
import json
from datetime import datetime

# Create blueprint for customer API routes
bp = Blueprint('customers', __name__, url_prefix='/api/v1')

def admin_required(f):
    """Decorator to ensure user has admin role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or getattr(current_user, 'role', None) != 'admin':
            return jsonify({
                'success': False,
                'error': 'Unauthorized: Admin access required',
                'message': 'You do not have permission to access this resource.'
            }), 403
        return f(*args, **kwargs)
    return decorated_function

@bp.route('/customers', methods=['GET'])
@login_required
@admin_required
def get_customers():
    """Get all customers."""
    try:
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        
        # Get search query
        search = request.args.get('search', '').strip()
        
        # Build query
        query = {}
        if search:
            query['$or'] = [
                {'name': {'$regex': search, '$options': 'i'}},
                {'email': {'$regex': search, '$options': 'i'}},
                {'phone': {'$regex': search, '$options': 'i'}}
            ]
        
        # Get total count
        total = current_app.mongo.db.customers.count_documents(query)
        
        # Get paginated results
        customers = list(current_app.mongo.db.customers.find(
            query,
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 'phone': 1, 
             'assigned_to': 1, 'created_at': 1, 'updated_at': 1}
        ).skip((page - 1) * per_page).limit(per_page))
        
        # Convert ObjectId to string for assigned_to
        for customer in customers:
            if 'assigned_to' in customer and customer['assigned_to']:
                if isinstance(customer['assigned_to'], ObjectId):
                    customer['assigned_to'] = str(customer['assigned_to'])
        
        return jsonify({
            'success': True,
            'data': customers,
            'pagination': {
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        current_app.logger.error(f'Error getting customers: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve customers',
            'message': str(e)
        }), 500

@bp.route('/customers/<customer_id>', methods=['GET'])
@login_required
def get_customer(customer_id):
    """Get a single customer by ID."""
    try:
        # Check if user is admin or assigned to this customer
        if not (current_user.role == 'admin' or 
                (hasattr(current_user, 'customers') and 
                 ObjectId(customer_id) in [ObjectId(cid) for cid in current_user.customers])):
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'You do not have permission to access this customer.'
            }), 403
        
        customer = current_app.mongo.db.customers.find_one(
            {'_id': ObjectId(customer_id)},
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 'phone': 1, 
             'assigned_to': 1, 'created_at': 1, 'updated_at': 1, 'notes': 1}
        )
        
        if not customer:
            return jsonify({
                'success': False,
                'error': 'Not Found',
                'message': 'Customer not found.'
            }), 404
        
        # Convert ObjectId to string for assigned_to
        if 'assigned_to' in customer and customer['assigned_to']:
            if isinstance(customer['assigned_to'], ObjectId):
                customer['assigned_to'] = str(customer['assigned_to'])
        
        return jsonify({
            'success': True,
            'data': customer
        })
    except Exception as e:
        current_app.logger.error(f'Error getting customer {customer_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve customer',
            'message': str(e)
        }), 500

@bp.route('/customers', methods=['POST'])
@login_required
@admin_required
def create_customer():
    """Create a new customer."""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({
                'success': False,
                'error': 'Validation Error',
                'message': 'Name is required.'
            }), 400
        
        # Prepare customer data
        customer_data = {
            'name': data['name'].strip(),
            'email': data.get('email', '').strip().lower(),
            'phone': data.get('phone', '').strip(),
            'assigned_to': ObjectId(data['assigned_to']) if data.get('assigned_to') else None,
            'notes': data.get('notes', '').strip(),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # Insert customer
        result = current_app.mongo.db.customers.insert_one(customer_data)
        
        # If assigned_to is provided, update the user's customers list
        if customer_data['assigned_to']:
            current_app.mongo.db.users.update_one(
                {'_id': customer_data['assigned_to']},
                {'$addToSet': {'customers': result.inserted_id}},
                upsert=True
            )
        
        # Prepare response
        customer_data['id'] = str(result.inserted_id)
        if 'assigned_to' in customer_data and customer_data['assigned_to']:
            customer_data['assigned_to'] = str(customer_data['assigned_to'])
        
        return jsonify({
            'success': True,
            'message': 'Customer created successfully.',
            'data': customer_data
        }), 201
    except Exception as e:
        current_app.logger.error(f'Error creating customer: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to create customer',
            'message': str(e)
        }), 500

@bp.route('/customers/<customer_id>', methods=['PUT'])
@login_required
def update_customer(customer_id):
    """Update an existing customer."""
    try:
        # Check if user is admin or assigned to this customer
        if not (current_user.role == 'admin' or 
                (hasattr(current_user, 'customers') and 
                 ObjectId(customer_id) in [ObjectId(cid) for cid in current_user.customers])):
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'You do not have permission to update this customer.'
            }), 403
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({
                'success': False,
                'error': 'Validation Error',
                'message': 'Name is required.'
            }), 400
        
        # Get existing customer to check for assigned_to changes
        existing_customer = current_app.mongo.db.customers.find_one(
            {'_id': ObjectId(customer_id)}
        )
        
        if not existing_customer:
            return jsonify({
                'success': False,
                'error': 'Not Found',
                'message': 'Customer not found.'
            }), 404
        
        # Prepare update data
        update_data = {
            'name': data['name'].strip(),
            'email': data.get('email', '').strip().lower(),
            'phone': data.get('phone', '').strip(),
            'assigned_to': ObjectId(data['assigned_to']) if data.get('assigned_to') else None,
            'notes': data.get('notes', '').strip(),
            'updated_at': datetime.utcnow()
        }
        
        # Update customer
        result = current_app.mongo.db.customers.update_one(
            {'_id': ObjectId(customer_id)},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return jsonify({
                'success': False,
                'error': 'Not Found',
                'message': 'Customer not found.'
            }), 404
        
        # Handle assigned_to changes
        old_assigned_to = existing_customer.get('assigned_to')
        new_assigned_to = update_data['assigned_to']
        
        # If assigned_to changed, update user's customers list
        if old_assigned_to != new_assigned_to:
            # Remove from old user's customers list
            if old_assigned_to:
                current_app.mongo.db.users.update_one(
                    {'_id': old_assigned_to},
                    {'$pull': {'customers': ObjectId(customer_id)}}
                )
            
            # Add to new user's customers list
            if new_assigned_to:
                current_app.mongo.db.users.update_one(
                    {'_id': new_assigned_to},
                    {'$addToSet': {'customers': ObjectId(customer_id)}},
                    'upsert': True
                )
        
        # Prepare response
        customer_data = {
            'id': customer_id,
            'name': update_data['name'],
            'email': update_data['email'],
            'phone': update_data['phone'],
            'assigned_to': str(new_assigned_to) if new_assigned_to else None,
            'notes': update_data['notes'],
            'created_at': existing_customer.get('created_at', datetime.utcnow()).isoformat(),
            'updated_at': update_data['updated_at'].isoformat()
        }
        
        return jsonify({
            'success': True,
            'message': 'Customer updated successfully.',
            'data': customer_data
        })
    except Exception as e:
        current_app.logger.error(f'Error updating customer {customer_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to update customer',
            'message': str(e)
        }), 500

@bp.route('/customers/<customer_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_customer(customer_id):
    """Delete a customer."""
    try:
        # Get customer to check for assigned_to
        customer = current_app.mongo.db.customers.find_one(
            {'_id': ObjectId(customer_id)}
        )
        
        if not customer:
            return jsonify({
                'success': False,
                'error': 'Not Found',
                'message': 'Customer not found.'
            }), 404
        
        # Remove from assigned user's customers list
        if customer.get('assigned_to'):
            current_app.mongo.db.users.update_one(
                {'_id': customer['assigned_to']},
                {'$pull': {'customers': ObjectId(customer_id)}}
            )
        
        # Delete customer
        result = current_app.mongo.db.customers.delete_one(
            {'_id': ObjectId(customer_id)}
        )
        
        if result.deleted_count == 0:
            return jsonify({
                'success': False,
                'error': 'Not Found',
                'message': 'Customer not found.'
            }), 404
        
        return jsonify({
            'success': True,
            'message': 'Customer deleted successfully.'
        })
    except Exception as e:
        current_app.logger.error(f'Error deleting customer {customer_id}: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to delete customer',
            'message': str(e)
        }), 500

# Add more customer-related API endpoints as needed

# Example of how to register this blueprint in your app:
# from api.customers import bp as customers_bp
# app.register_blueprint(customers_bp)
