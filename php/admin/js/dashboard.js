/**
 * Admin Dashboard JavaScript
 * Handles all admin dashboard functionality
 */

// Global variables
let userRoleChart, quotationChart;
let allUsers = [];
let allCompanies = [];
let allQuotations = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
    loadDashboardData();
});

function initializeDashboard() {
    // Initialize charts
    initializeCharts();
    
    // Show dashboard section by default
    showSection('dashboard');
}

function setupEventListeners() {
    // Navigation links
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            showSection(section);
            
            // Update active nav link
            document.querySelectorAll('.nav-link').forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Quotation filter
    const quotationFilter = document.getElementById('quotationFilter');
    if (quotationFilter) {
        quotationFilter.addEventListener('change', filterQuotations);
    }
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        
        // Load section-specific data
        switch(sectionId) {
            case 'users':
                loadUsers();
                break;
            case 'companies':
                loadCompanies();
                break;
            case 'quotations':
                loadQuotations();
                break;
        }
    }
}

function loadDashboardData() {
    Promise.all([
        loadStats(),
        loadUsers(),
        loadCompanies(),
        loadQuotations()
    ]).then(() => {
        updateCharts();
    });
}

async function loadStats() {
    try {
        const response = await fetch('/php/admin/api/stats.php');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalUsers').textContent = data.stats.totalUsers || 0;
            document.getElementById('totalDealers').textContent = data.stats.totalDealers || 0;
            document.getElementById('totalQuotations').textContent = data.stats.totalQuotations || 0;
            document.getElementById('totalCompanies').textContent = data.stats.totalCompanies || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/php/admin/api/users.php');
        const data = await response.json();
        
        if (data.success) {
            allUsers = data.users;
            displayUsers(allUsers);
        } else {
            showAlert('Failed to load users: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Error loading users', 'danger');
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>
                <span class="badge user-role-badge ${getRoleBadgeClass(user.role)}">
                    ${user.role || 'user'}
                </span>
            </td>
            <td>
                <span class="badge ${user.is_verified ? 'bg-success' : 'bg-warning'}">
                    ${user.is_verified ? 'Verified' : 'Pending'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="showRoleModal('${user.id}', '${escapeHtml(user.username)}', '${user.role || 'user'}')">
                    <i class="fas fa-edit"></i> Change Role
                </button>
            </td>
        </tr>
    `).join('');
}

function getRoleBadgeClass(role) {
    switch(role) {
        case 'admin': return 'bg-danger';
        case 'dealer': return 'bg-warning';
        case 'user':
        default: return 'bg-primary';
    }
}

async function loadCompanies() {
    try {
        const response = await fetch('/php/admin/api/companies.php');
        const data = await response.json();
        
        if (data.success) {
            allCompanies = data.companies;
            displayCompanies(allCompanies);
        } else {
            showAlert('Failed to load companies: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error loading companies:', error);
        showAlert('Error loading companies', 'danger');
    }
}

function displayCompanies(companies) {
    const tbody = document.getElementById('companiesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = companies.map(company => `
        <tr>
            <td>${escapeHtml(company.name || company.companyName || 'N/A')}</td>
            <td>${escapeHtml(company.email || company.emailId || 'N/A')}</td>
            <td>${escapeHtml(company.contact || company.phone || 'N/A')}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editCompany('${company.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteCompany('${company.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function loadQuotations() {
    try {
        const response = await fetch('/php/admin/api/quotations.php');
        const data = await response.json();
        
        if (data.success) {
            allQuotations = data.quotations;
            displayQuotations(allQuotations);
        } else {
            showAlert('Failed to load quotations: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error loading quotations:', error);
        showAlert('Error loading quotations', 'danger');
    }
}

function displayQuotations(quotations) {
    const tbody = document.getElementById('quotationsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = quotations.map(quote => `
        <tr>
            <td>${formatDate(quote.created_at)}</td>
            <td>${escapeHtml(quote.user_name || 'Unknown')}</td>
            <td>
                <span class="badge user-role-badge ${getRoleBadgeClass(quote.user_role)}">
                    ${quote.user_role || 'user'}
                </span>
            </td>
            <td>${escapeHtml(quote.company_name || 'N/A')}</td>
            <td>₹${(quote.total || 0).toLocaleString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-info" onclick="viewQuotation('${quote.id}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        </tr>
    `).join('');
}

function filterQuotations() {
    const filter = document.getElementById('quotationFilter').value;
    let filteredQuotations = allQuotations;
    
    if (filter) {
        filteredQuotations = allQuotations.filter(quote => quote.user_role === filter);
    }
    
    displayQuotations(filteredQuotations);
}

function initializeCharts() {
    // User Role Distribution Chart
    const userRoleCtx = document.getElementById('userRoleChart');
    if (userRoleCtx) {
        userRoleChart = new Chart(userRoleCtx, {
            type: 'pie',
            data: {
                labels: ['Users', 'Dealers', 'Admins'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#007bff', '#ffc107', '#dc3545'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    // Quotations Chart
    const quotationCtx = document.getElementById('quotationChart');
    if (quotationCtx) {
        quotationChart = new Chart(quotationCtx, {
            type: 'bar',
            data: {
                labels: ['Users', 'Dealers', 'Admins'],
                datasets: [{
                    label: 'Quotations',
                    data: [0, 0, 0],
                    backgroundColor: ['#007bff', '#ffc107', '#dc3545'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function updateCharts() {
    if (userRoleChart && allUsers.length > 0) {
        const roleCounts = {
            user: allUsers.filter(u => (u.role || 'user') === 'user').length,
            dealer: allUsers.filter(u => u.role === 'dealer').length,
            admin: allUsers.filter(u => u.role === 'admin').length
        };
        
        userRoleChart.data.datasets[0].data = [roleCounts.user, roleCounts.dealer, roleCounts.admin];
        userRoleChart.update();
    }
    
    if (quotationChart && allQuotations.length > 0) {
        const quotationCounts = {
            user: allQuotations.filter(q => (q.user_role || 'user') === 'user').length,
            dealer: allQuotations.filter(q => q.user_role === 'dealer').length,
            admin: allQuotations.filter(q => q.user_role === 'admin').length
        };
        
        quotationChart.data.datasets[0].data = [quotationCounts.user, quotationCounts.dealer, quotationCounts.admin];
        quotationChart.update();
    }
}

function showRoleModal(userId, username, currentRole) {
    document.getElementById('roleUserId').value = userId;
    document.getElementById('roleUserInfo').textContent = `${username} (${currentRole})`;
    document.getElementById('newRole').value = currentRole;
    
    const modal = new bootstrap.Modal(document.getElementById('roleModal'));
    modal.show();
}

async function updateUserRole() {
    const userId = document.getElementById('roleUserId').value;
    const newRole = document.getElementById('newRole').value;
    
    try {
        const response = await fetch('/php/admin/api/update-role.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                newRole: newRole
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Role updated successfully', 'success');
            loadUsers();
            loadDashboardData();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('roleModal'));
            modal.hide();
        } else {
            showAlert('Failed to update role: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error updating role:', error);
        showAlert('Error updating role', 'danger');
    }
}

// Utility functions
function refreshUsers() {
    loadUsers();
}

function refreshQuotations() {
    loadQuotations();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function showAlert(message, type = 'info') {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Placeholder functions for future implementation
function editCompany(companyId) {
    showAlert('Edit company functionality coming soon', 'info');
}

function deleteCompany(companyId) {
    if (confirm('Are you sure you want to delete this company?')) {
        showAlert('Delete company functionality coming soon', 'info');
    }
}

function viewQuotation(quotationId) {
    showAlert('View quotation functionality coming soon', 'info');
}

function showAddCompanyModal() {
    showAlert('Add company functionality coming soon', 'info');
}
