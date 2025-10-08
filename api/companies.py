from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user
from bson import ObjectId
from datetime import datetime
from functools import wraps
from bson.errors import InvalidId

def get_mongo_db():
    """Helper function to get MongoDB database instance."""
    try:
        # First try to get from Flask-PyMongo
        if hasattr(current_app, 'mongo') and current_app.mongo and hasattr(current_app.mongo, 'db'):
            return current_app.mongo.db
            
        # Fall back to direct PyMongo connection
        if hasattr(current_app, 'mongo_db') and current_app.mongo_db is not None:
            return current_app.mongo_db
            
        return None
    except Exception as e:
        print(f"⚠️ Error getting MongoDB database: {str(e)}")
        return None

# Create blueprint for company API routes
bp = Blueprint('companies', __name__, url_prefix='/api/v1')

def admin_required(f):
    """Decorator to ensure user has admin role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin():
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'Admin access required.'
            }), 403
        return f(*args, **kwargs)
    return decorated_function

@bp.route('/companies', methods=['GET'])
@login_required
def get_companies():
    """Get all companies.
    
    For admins: Returns all companies
    For regular users: Returns only assigned companies
    """
    try:
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Build query based on user role
        query = {}
        if not current_user.is_admin():
            if not hasattr(current_user, 'assigned_companies') or not current_user.assigned_companies:
                return jsonify({
                    'success': True,
                    'data': [],
                    'pagination': {
                        'total': 0,
                        'page': 1,
                        'per_page': 10,
                        'total_pages': 0
                    }
                })
                
            # Filter by assigned companies
            company_ids = [ObjectId(cid) for cid in current_user.assigned_companies if cid]
            query['_id'] = {'$in': company_ids}
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
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
        total = db.companies.count_documents(query)
        
        # Get paginated results
        companies_cursor = db.companies.find(
            query,
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 
             'phone': 1, 'address': 1, 'created_at': 1, 'updated_at': 1}
        ).skip((page - 1) * per_page).limit(per_page)
        
        companies = list(companies_cursor)
        
        return jsonify({
            'success': True,
            'data': companies,
            'pagination': {
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': (total + per_page - 1) // per_page
            }
        })
        
    except Exception as e:
        current_app.logger.error(f'Error getting companies: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve companies',
            'message': str(e)
        }), 500

@bp.route('/companies/<company_id>', methods=['GET'])
@login_required
def get_company(company_id):
    """Get a single company by ID."""
    try:
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Get the company
        company = db.companies.find_one(
            {'_id': ObjectId(company_id)},
            {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 
             'phone': 1, 'address': 1, 'created_at': 1, 'updated_at': 1}
        )
        
        if not company:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'Company not found.'
            }), 404
            
        # Check if user has access to this company
        if not current_user.is_admin():
            if not hasattr(current_user, 'assigned_companies') or company_id not in current_user.assigned_companies:
                return jsonify({
                    'success': False,
                    'error': 'Forbidden',
                    'message': 'You do not have permission to access this company.'
                }), 403
        
        return jsonify({
            'success': True,
            'data': company
        })
        
    except Exception as e:
        current_app.logger.error(f'Error getting company: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve company',
            'message': str(e)
        }), 500

@bp.route('/users/companies', methods=['GET'])
@login_required
@admin_required
def get_users_with_companies():
    """Get all users with their assigned companies.
    
    Returns a list of users with their assigned companies for the admin interface.
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
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '').strip()
        
        # Build query for users
        query = {}
        if search:
            search_regex = {'$regex': search, '$options': 'i'}
            query['$or'] = [
                {'username': search_regex},
                {'email': search_regex},
                {'name': search_regex}
            ]
        
        # Get total count
        total_users = db.users.count_documents(query)
        
        # Get paginated users with their assigned companies
        users_cursor = db.users.find(
            query,
            {'_id': 1, 'username': 1, 'email': 1, 'name': 1, 'role': 1, 'assigned_companies': 1}
        ).skip((page - 1) * per_page).limit(per_page)
        
        users = list(users_cursor)
        
        # Get all company IDs from all users
        all_company_ids = set()
        for user in users:
            if 'assigned_companies' in user and user['assigned_companies']:
                all_company_ids.update([ObjectId(cid) for cid in user['assigned_companies'] if cid])
        
        # Get company details in one query
        companies_map = {}
        if all_company_ids:
            companies_cursor = db.companies.find(
                {'_id': {'$in': list(all_company_ids)}},
                {'_id': 1, 'name': 1, 'email': 1}
            )
            companies_map = {str(company['_id']): company for company in companies_cursor}
        
        # Prepare response
        result = []
        for user in users:
            user_companies = []
            if 'assigned_companies' in user and user['assigned_companies']:
                for cid in user['assigned_companies']:
                    if cid and cid in companies_map:
                        company = companies_map[cid]
                        user_companies.append({
                            'id': cid,
                            'name': company.get('name', 'Unknown'),
                            'email': company.get('email', '')
                        })
            
            result.append({
                'id': str(user['_id']),
                'username': user.get('username', ''),
                'email': user.get('email', ''),
                'name': user.get('name', ''),
                'role': user.get('role', 'user'),
                'assigned_companies': user_companies
            })
        
        return jsonify({
            'success': True,
            'data': result,
            'pagination': {
                'total': total_users,
                'page': page,
                'per_page': per_page,
                'total_pages': (total_users + per_page - 1) // per_page
            }
        })
        
    except Exception as e:
        current_app.logger.error(f'Error getting users with companies: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve users with companies',
            'message': str(e)
        }), 500

@bp.route('/users/<user_id>/companies', methods=['GET'])
@login_required
def get_user_companies(user_id):
    """Get all companies assigned to a specific user.
    
    For admins: Can view any user's companies
    For regular users: Can only view their own companies
    """
    try:
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Check if the requested user is the current user or if current user is admin
        if not current_user.is_admin() and str(current_user.id) != user_id:
            return jsonify({
                'success': False,
                'error': 'Forbidden',
                'message': 'You do not have permission to view these companies.'
            }), 403
            
        # Get the user
        try:
            user = db.users.find_one(
                {'_id': ObjectId(user_id)},
                {'assigned_companies': 1, 'username': 1, 'email': 1, 'name': 1}
            )
        except InvalidId:
            return jsonify({
                'success': False,
                'error': 'Invalid user ID',
                'message': 'The provided user ID is not valid.'
            }), 400
        
        if not user:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'User not found.'
            }), 404
            
        # Get assigned companies
        company_ids = [ObjectId(cid) for cid in user.get('assigned_companies', []) if cid]
        
        companies = []
        if company_ids:
            companies = list(db.companies.find(
                {'_id': {'$in': company_ids}},
                {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 'phone': 1}
            ))
        
        # Include user details in the response
        user_data = {
            'id': str(user['_id']),
            'username': user.get('username', ''),
            'email': user.get('email', ''),
            'name': user.get('name', '')
        }
        
        return jsonify({
            'success': True,
            'user': user_data,
            'companies': companies
        })
        
    except Exception as e:
        current_app.logger.error(f'Error getting user companies: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve user companies',
            'message': str(e)
        }), 500

@bp.route('/users/<user_id>/companies', methods=['POST'])
@login_required
@admin_required
def assign_companies_to_user(user_id):
    """Assign companies to a user."""
    try:
        data = request.get_json()
        
        # Validate required fields
        if 'company_ids' not in data or not isinstance(data['company_ids'], list):
            return jsonify({
                'success': False,
                'error': 'Invalid request',
                'message': 'company_ids array is required.'
            }), 400
            
        # Get MongoDB instance
        db = get_mongo_db()
        if db is None:
            return jsonify({
                'success': False,
                'error': 'Database connection failed',
                'message': 'Could not connect to the database.'
            }), 500
            
        # Verify the user exists
        user = db.users.find_one({'_id': ObjectId(user_id)})
        if not user:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'User not found.'
            }), 404
            
        # Convert company IDs to ObjectId
        company_ids = [ObjectId(cid) for cid in data['company_ids'] if cid]
        
        # Verify all companies exist
        if company_ids:
            existing_companies = db.companies.count_documents({
                '_id': {'$in': company_ids}
            })
            
            if existing_companies != len(company_ids):
                return jsonify({
                    'success': False,
                    'error': 'Invalid companies',
                    'message': 'One or more companies do not exist.'
                }), 400
        
        # Update user's assigned companies
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': {'assigned_companies': [str(cid) for cid in company_ids]}}
        )
        
        if result.matched_count == 0:
            return jsonify({
                'success': False,
                'error': 'Not found',
                'message': 'User not found.'
            }), 404
            
        # Get updated user with populated companies
        updated_user = db.users.find_one(
            {'_id': ObjectId(user_id)},
            {'assigned_companies': 1}
        )
        
        # Get company details
        assigned_company_ids = [ObjectId(cid) for cid in updated_user.get('assigned_companies', []) if cid]
        
        companies = []
        if assigned_company_ids:
            companies = list(db.companies.find(
                {'_id': {'$in': assigned_company_ids}},
                {'_id': 0, 'id': {'$toString': '$_id'}, 'name': 1, 'email': 1, 'phone': 1}
            ))
        
        return jsonify({
            'success': True,
            'message': 'Companies assigned successfully',
            'data': companies
        })
        
    except Exception as e:
        current_app.logger.error(f'Error assigning companies to user: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Failed to assign companies',
            'message': str(e)
        }), 500
