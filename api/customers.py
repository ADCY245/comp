from flask import Blueprint, jsonify, request, current_app
from functools import wraps
from flask_login import current_user, login_required
from bson import ObjectId, json_util
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

def get_mongo_db():
    """Helper function to get MongoDB database instance."""
    try:
        # First try to get from Flask-PyMongo
        if hasattr(current_app, 'mongo') and current_app.mongo and hasattr(current_app.mongo, 'db'):
            return current_app.mongo.db
            
        # Fall back to direct PyMongo connection
        if hasattr(current_app, 'mongo_db') and current_app.mongo_db is not None:
            return current_app.mongo_db
            
        # If we get here, try to initialize the connection
        from app import app, MONGO_AVAILABLE, MONGODB_URI, DB_NAME
        if MONGO_AVAILABLE and MONGODB_URI:
            from pymongo import MongoClient
            client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            current_app.mongo_db = client[DB_NAME]
            return current_app.mongo_db
            
        return None
    except Exception as e:
        print(f"⚠️ Error getting MongoDB database: {str(e)}")
        return None
    return None

@bp.route('/customers', methods=['GET'])
@login_required
def get_customers():
    """Get all accessible customers.
    
    For admins: Returns all customers
    For regular users: Returns customers from assigned companies + directly assigned customers
    """
    try:
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Build query based on user role and permissions
        query = {}
        
        # If not admin, filter by accessible customers
        if not current_user.is_admin():
            # Get all accessible customer IDs
            accessible_customer_ids = current_user.get_accessible_customers()
            
            # If no accessible customers, return empty result
            if not accessible_customer_ids:
                return jsonify({
                    'success': True,
                    'data': [],
                    'pagination': {
                        'total': 0,
                        'page': page,
                        'per_page': per_page,
                        'total_pages': 0
                    }
                })
                
            # Convert string IDs to ObjectId for query
            from bson import ObjectId
            customer_object_ids = [ObjectId(cid) for cid in accessible_customer_ids]
            
            # Filter by accessible customer IDs
            query['_id'] = {'$in': customer_object_ids}
            
        # Handle search
        search = request.args.get('search', '').strip()
        if search:
            search_query = {
                '$or': [
                    {'name': {'$regex': search, '$options': 'i'}},
                    {'email': {'$regex': search, '$options': 'i'}},
                    {'phone': {'$regex': search, '$options': 'i'}}
                ]
            }
            
            # If we already have a query (from permission filtering), combine with AND
            if query:
                query = {'$and': [query, search_query]}
            else:
                query = search_query
        
        # Get total count
        total = db.customers.count_documents(query)
        
        # Get paginated results
        customers_cursor = db.customers.find(
            query,
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 'phone': 1, 
             'company_id': 1, 'assigned_to': 1, 'created_at': 1, 'updated_at': 1}
        )
        
        # Apply pagination
        customers = list(customers_cursor.skip((page - 1) * per_page).limit(per_page))
        
        # Convert ObjectId to string for assigned_to and company_id
        for customer in customers:
            if 'assigned_to' in customer and customer['assigned_to']:
                if isinstance(customer['assigned_to'], ObjectId):
                    customer['assigned_to'] = str(customer['assigned_to'])
            if 'company_id' in customer and customer['company_id']:
                if isinstance(customer['company_id'], ObjectId):
                    customer['company_id'] = str(customer['company_id'])
        
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
        
        # Get database instance
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database not available',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Get customer by ID
        customer = db.customers.find_one(
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
def create_customer():
    """Create a new customer."""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'email']
        for field in required_fields:
            if field not in data or not data[field].strip():
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Get MongoDB instance
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
        
        # Check if email already exists
        if db.customers.find_one({'email': data['email'].strip().lower()}):
            return jsonify({
                'success': False,
                'error': 'Email already exists',
                'message': 'A customer with this email already exists.'
            }), 400
        
        # Prepare customer data
        customer_data = {
            'name': data['name'].strip(),
            'email': data['email'].strip().lower(),
            'phone': data.get('phone', '').strip(),
            'notes': data.get('notes', '').strip(),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'created_by': ObjectId(current_user.id)
        }
        
        # Handle company assignment
        company_id = data.get('company_id')
        if company_id:
            # Verify the company exists and user has access to it
            company = db.companies.find_one({'_id': ObjectId(company_id)})
            if not company:
                return jsonify({
                    'success': False,
                    'error': 'Company not found',
                    'message': 'The specified company does not exist.'
                }), 404
                
            # If user is not admin, verify they have access to this company
            if not current_user.is_admin():
                if not hasattr(current_user, 'assigned_companies') or str(company_id) not in current_user.assigned_companies:
                    return jsonify({
                        'success': False,
                        'error': 'Access denied',
                        'message': 'You do not have permission to add customers to this company.'
                    }), 403
            
            customer_data['company_id'] = ObjectId(company_id)
        
        # For non-admin users, assign the customer to themselves
        if not current_user.is_admin():
            customer_data['assigned_to'] = ObjectId(current_user.id)
        # For admins, respect the assigned_to if provided
        elif 'assigned_to' in data and data['assigned_to']:
            customer_data['assigned_to'] = ObjectId(data['assigned_to'])
        
        # Insert new customer
        result = db.customers.insert_one(customer_data)
        
        # If assigned_to is provided, update the user's customers list
        if 'assigned_to' in customer_data and customer_data['assigned_to']:
            db.users.update_one(
                {'_id': customer_data['assigned_to']},
                {'$addToSet': {'customers': result.inserted_id}},
                upsert=True
            )
        
        # Get the created customer with proper ID conversion
        created_customer = db.customers.find_one(
            {'_id': result.inserted_id},
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 
             'phone': 1, 'company_id': 1, 'assigned_to': 1, 'created_at': 1, 'updated_at': 1}
        )
        
        # Convert ObjectId to string for assigned_to and company_id
        if 'assigned_to' in created_customer and created_customer['assigned_to']:
            if isinstance(created_customer['assigned_to'], ObjectId):
                created_customer['assigned_to'] = str(created_customer['assigned_to'])
        if 'company_id' in created_customer and created_customer['company_id']:
            if isinstance(created_customer['company_id'], ObjectId):
                created_customer['company_id'] = str(created_customer['company_id'])
        
        return jsonify({
            'success': True,
            'message': 'Customer created successfully',
            'data': created_customer
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
        # Get MongoDB instance
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Get existing customer
        existing_customer = db.customers.find_one(
            {'_id': ObjectId(customer_id)}
        )
        
        if not existing_customer:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'Customer not found.'
            }), 404
            
        # Check if user has permission to update this customer
        if not current_user.can_access_customer(customer_id):
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'You do not have permission to update this customer.'
            }), 403
            
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided',
                'message': 'No data provided for update.'
            }), 400
            
        # Prepare update data
        update_data = {
            'name': data.get('name', existing_customer.get('name', '')).strip(),
            'email': data.get('email', existing_customer.get('email', '')).strip().lower(),
            'phone': data.get('phone', existing_customer.get('phone', '')).strip(),
            'notes': data.get('notes', existing_customer.get('notes', '')).strip(),
            'updated_at': datetime.utcnow()
        }
        
        # Handle company_id update
        if 'company_id' in data:
            if data['company_id']:
                company_id = data['company_id']
                
                # Verify the company exists
                company = db.companies.find_one({'_id': ObjectId(company_id)})
                if not company:
                    return jsonify({
                        'success': False,
                        'error': 'Company not found',
                        'message': 'The specified company does not exist.'
                    }), 404
                
                # If user is not admin, verify they have access to this company
                if not current_user.is_admin():
                    if not hasattr(current_user, 'assigned_companies') or company_id not in current_user.assigned_companies:
                        return jsonify({
                            'success': False,
                            'error': 'Access denied',
                            'message': 'You do not have permission to assign customers to this company.'
                        }), 403
                
                update_data['company_id'] = ObjectId(company_id)
            else:
                update_data['$unset'] = {'company_id': ''}
        
        # Handle assigned_to update
        if 'assigned_to' in data:
            if not current_user.is_admin():
                return jsonify({
                    'success': False,
                    'error': 'Forbidden',
                    'message': 'Only administrators can change customer assignments.'
                }), 403
                
            if data['assigned_to']:
                update_data['assigned_to'] = ObjectId(data['assigned_to'])
            else:
                update_data['$unset'] = {'assigned_to': ''}
        
        # Update customer
        result = db.customers.update_one(
            {'_id': ObjectId(customer_id)},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'Customer not found.'
            }), 404
            
        # Handle assigned_to changes
        old_assigned_to = existing_customer.get('assigned_to')
        new_assigned_to = update_data.get('assigned_to')
        
        # If assigned_to changed, update user's customers list
        if old_assigned_to != new_assigned_to:
            # Remove from old user's customers list
            if old_assigned_to:
                db.users.update_one(
                    {'_id': old_assigned_to},
                    {'$pull': {'customers': ObjectId(customer_id)}}
                )
            
            # Add to new user's customers list
            if new_assigned_to:
                db.users.update_one(
                    {'_id': new_assigned_to},
                    {'$addToSet': {'customers': ObjectId(customer_id)}},
                    upsert=True
                )
        
        # Get updated customer with proper ID conversion
        updated_customer = db.customers.find_one(
            {'_id': ObjectId(customer_id)},
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 
             'phone': 1, 'company_id': 1, 'assigned_to': 1, 'created_at': 1, 'updated_at': 1}
        )
        
        # Convert ObjectId to string for assigned_to and company_id
        if 'assigned_to' in updated_customer and updated_customer['assigned_to']:
            if isinstance(updated_customer['assigned_to'], ObjectId):
                updated_customer['assigned_to'] = str(updated_customer['assigned_to'])
        if 'company_id' in updated_customer and updated_customer['company_id']:
            if isinstance(updated_customer['company_id'], ObjectId):
                updated_customer['company_id'] = str(updated_customer['company_id'])
        
        return jsonify({
            'success': True,
            'message': 'Customer updated successfully',
            'data': updated_customer
        })
        
    except Exception as e:
        current_app.logger.error(f'Error updating customer: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to update customer',
            'message': str(e)
        }), 500

@bp.route('/customers/<customer_id>', methods=['DELETE'])
@login_required
def delete_customer(customer_id):
    """Delete a customer.
    
    Admins can delete any customer.
    Regular users can only delete customers they have access to.
    """
    try:
        # Get MongoDB instance
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Get customer to check permissions
        customer = db.customers.find_one(
            {'_id': ObjectId(customer_id)},
            {'assigned_to': 1, 'company_id': 1}
        )
        
        if not customer:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'Customer not found.'
            }), 404
            
        # Check if user has permission to delete this customer
        if not current_user.can_access_customer(customer_id):
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'You do not have permission to delete this customer.'
            }), 403
            
        # If user is not admin, check company access for company-assigned customers
        if not current_user.is_admin() and 'company_id' in customer and customer['company_id']:
            company_id = str(customer['company_id'])
            if not hasattr(current_user, 'assigned_companies') or company_id not in current_user.assigned_companies:
                return jsonify({
                    'success': False,
                    'error': 'Forbidden',
                    'message': 'You do not have permission to delete customers from this company.'
                }), 403
            
        # Remove from user's customers list if assigned
        if customer.get('assigned_to'):
            db.users.update_one(
                {'_id': customer['assigned_to']},
                {'$pull': {'customers': ObjectId(customer_id)}}
            )
        
        # Delete the customer
        result = db.customers.delete_one({'_id': ObjectId(customer_id)})
        
        if result.deleted_count == 0:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'Customer not found.'
            }), 404
            
        return jsonify({
            'success': True,
            'message': 'Customer deleted successfully'
        })
        
    except Exception as e:
        current_app.logger.error(f'Error deleting customer: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to delete customer',
            'message': str(e)
        }), 500

# Add more customer-related API endpoints as needed

# Example of how to register this blueprint in your app:
# from api.customers import bp as customers_bp
# app.register_blueprint(customers_bp)
