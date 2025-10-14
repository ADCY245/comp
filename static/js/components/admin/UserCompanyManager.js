import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UserCompanyManager = () => {
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage] = useState(10);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);

  // Fetch users with their company assignments
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/users/companies?page=${currentPage}&per_page=${perPage}&search=${searchTerm}`);
      const data = await response.json();
      
      if (data.success) {
        const filteredUsers = Array.isArray(data.data)
          ? data.data.filter(user => ['user', 'admin'].includes((user.role || '').toLowerCase()))
          : [];
        setUsers(filteredUsers);
        setTotalPages(data.pagination.total_pages);
      } else {
        throw new Error(data.error || 'Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all companies for the assign modal
  const fetchAllCompanies = async () => {
    try {
      const response = await fetch('/api/v1/companies?per_page=1000'); // Large number to get all companies
      const data = await response.json();
      
      if (data.success) {
        setAllCompanies(data.data);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  // Handle company assignment
  const handleAssignCompanies = async () => {
    if (!selectedUser) return;
    
    try {
      const response = await fetch(`/api/v1/users/${selectedUser.id}/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
          company_ids: selectedCompanies
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Companies assigned successfully');
        setShowAssignModal(false);
        fetchUsers(); // Refresh the user list
      } else {
        throw new Error(data.error || 'Failed to assign companies');
      }
    } catch (error) {
      console.error('Error assigning companies:', error);
      toast.error(`Error: ${error.message}`);
    }
  };

  // Open assign modal
  const openAssignModal = (user) => {
    setSelectedUser(user);
    setSelectedCompanies(user.assigned_companies.map(c => c.id));
    setShowAssignModal(true);
  };

  // Toggle company selection
  const toggleCompany = (companyId) => {
    setSelectedCompanies(prev => 
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchUsers();
  };

  // Pagination
  const goToPage = (page) => {
    setCurrentPage(page);
  };

  // Get CSRF token from cookies
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
  };

  // Initial data fetch
  useEffect(() => {
    fetchUsers();
    fetchAllCompanies();
  }, [currentPage, searchTerm]);

  return (
    <div className="container-fluid">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">User Company Assignments</h3>
          <div className="card-tools">
            <form className="form-inline" onSubmit={handleSearch}>
              <div className="input-group input-group-sm">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="input-group-append">
                  <button type="submit" className="btn btn-primary">
                    <i className="fas fa-search"></i>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        
        <div className="card-body table-responsive p-0">
          {loading ? (
            <div className="text-center p-4">
              <div className="spinner-border text-primary" role="status">
                <span className="sr-only">Loading...</span>
              </div>
            </div>
          ) : (
            <table className="table table-hover text-nowrap">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Assigned Companies</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center">No users found</td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.name || '-'}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`badge ${user.role === 'admin' ? 'bg-danger' : 'bg-primary'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        {user.assigned_companies.length > 0 ? (
                          <div>
                            {user.assigned_companies.slice(0, 2).map(company => (
                              <span key={company.id} className="badge bg-info me-1 mb-1">
                                {company.name}
                              </span>
                            ))}
                            {user.assigned_companies.length > 2 && (
                              <span className="badge bg-secondary">
                                +{user.assigned_companies.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">No companies assigned</span>
                        )}
                      </td>
                      <td>
                        <button 
                          className="btn btn-sm btn-primary"
                          onClick={() => openAssignModal(user)}
                        >
                          <i className="fas fa-edit me-1"></i> Manage
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        
        <div className="card-footer clearfix">
          <ul className="pagination pagination-sm m-0 float-right">
            <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
              <button 
                className="page-link" 
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                &laquo;
              </button>
            </li>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <li key={pageNum} className={`page-item ${currentPage === pageNum ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => goToPage(pageNum)}>
                    {pageNum}
                  </button>
                </li>
              );
            })}
            
            <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
              <button 
                className="page-link" 
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                &raquo;
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Assign Companies Modal */}
      {showAssignModal && selectedUser && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Manage Companies for {selectedUser.name || selectedUser.username}
                </h5>
                <button 
                  type="button" 
                  className="close" 
                  onClick={() => setShowAssignModal(false)}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  {allCompanies.map(company => (
                    <div key={company.id} className="col-md-6 mb-2">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          id={`company-${company.id}`}
                          className="form-check-input"
                          checked={selectedCompanies.includes(company.id)}
                          onChange={() => toggleCompany(company.id)}
                        />
                        <label 
                          className="form-check-label" 
                          htmlFor={`company-${company.id}`}
                        >
                          {company.name} 
                          {company.email && <small className="text-muted">({company.email})</small>}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowAssignModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleAssignCompanies}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserCompanyManager;
