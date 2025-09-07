// Global variables
let companiesPerPage = 10; // Default number of companies per page
let currentCompanyPage = 1; // Current page number for companies pagination

// Initialize DataTables for admin tables
$(document).ready(function() {
    // Initialize companies table if it exists and not already initialized
    if ($('#companiesTable').length && !$.fn.DataTable.isDataTable('#companiesTable')) {
        try {
            $('#companiesTable').DataTable({
                "pageLength": companiesPerPage,
                "responsive": true,
                "order": [[0, "desc"]],
                "language": {
                    "search": "_INPUT_",
                    "searchPlaceholder": "Search companies..."
                },
                "columnDefs": [
                    {
                        "targets": -1, // Last column (actions)
                        "orderable": false,
                        "searchable": false
                    }
                ]
            });
        } catch (e) {
            console.error('Error initializing companies table:', e);
        }
    }

    // Initialize users table if it exists and not already initialized
    if ($('#usersTable').length && !$.fn.DataTable.isDataTable('#usersTable')) {
        try {
            $('#usersTable').DataTable({
                "pageLength": 10,
                "responsive": true,
                "order": [[0, "desc"]],
                "language": {
                    "search": "_INPUT_",
                    "searchPlaceholder": "Search users..."
                },
                "columnDefs": [
                    {
                        "targets": -1, // Last column (actions)
                        "orderable": false,
                        "searchable": false
                    }
                ]
            });
        } catch (e) {
            console.error('Error initializing users table:', e);
        }
    }

    // Initialize customers table if it exists and not already initialized
    if ($('#customersTable').length && !$.fn.DataTable.isDataTable('#customersTable')) {
        try {
            window.customersTable = $('#customersTable').DataTable({
                "pageLength": 10,
                "responsive": true,
                "order": [[0, "desc"]],
                "language": {
                    "search": "_INPUT_",
                    "searchPlaceholder": "Search customers..."
                },
                "columnDefs": [
                    {
                        "targets": -1, // Last column (actions)
                        "orderable": false,
                        "searchable": false
                    }
                ]
            });
        } catch (e) {
            console.error('Error initializing customers table:', e);
        }
    }
});

// Function to load companies with pagination
function loadCompanies(page = 1, search = '') {
    const url = `/api/companies?page=${page}&per_page=${companiesPerPage}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                populateCompaniesTable(data.companies);
                updatePagination(data.pagination);
            } else {
                throw new Error(data.error || 'Failed to load companies');
            }
        })
        .catch(error => {
            console.error('Error loading companies:', error);
            showToast(`Error: ${error.message}`, 'danger');
        });
}

// Function to populate companies table
function populateCompaniesTable(companies) {
    const tbody = $('#companiesTable tbody');
    tbody.empty();
    
    if (companies.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center">No companies found</td></tr>');
        return;
    }
    
    companies.forEach(company => {
        const row = `
            <tr>
                <td>${company.id || ''}</td>
                <td>${company.name || ''}</td>
                <td>${company.email || ''}</td>
                <td>${company.phone || ''}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editCompany('${company.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCompany('${company.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// Function to update pagination controls
function updatePagination(pagination) {
    const paginationEl = $('#pagination');
    if (!pagination || !paginationEl.length) return;
    
    let html = `
        <li class="page-item ${pagination.page === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadCompanies(${pagination.page - 1})" aria-label="Previous">
                <span aria-hidden="true">&laquo;</span>
            </a>
        </li>
    `;
    
    for (let i = 1; i <= pagination.pages; i++) {
        html += `
            <li class="page-item ${i === pagination.page ? 'active' : ''}">
                <a class="page-link" href="#" onclick="loadCompanies(${i})">${i}</a>
            </li>
        `;
    }
    
    html += `
        <li class="page-item ${pagination.page === pagination.pages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadCompanies(${pagination.page + 1})" aria-label="Next">
                <span aria-hidden="true">&raquo;</span>
            </a>
        </li>
    `;
    
    paginationEl.html(html);
}

// Function to show toast notifications
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toastId = 'toast-' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    
    // Add toast to container
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // Initialize and show toast
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: 5000
    });
    
    toast.show();
    
    // Remove toast after it's hidden
    toastElement.addEventListener('hidden.bs.toast', function() {
        toastElement.remove();
    });
}

// Search companies
function searchCompanies() {
    const searchInput = $('#searchCompanies');
    if (!searchInput.length) return;
    
    const searchTerm = searchInput.val().trim();
    loadCompanies(1, searchTerm);
}

// Initialize search functionality
$(document).ready(function() {
    // Search on enter key
    $('#searchCompanies').on('keyup', function(e) {
        if (e.key === 'Enter') {
            searchCompanies();
        }
    });
    
    // Search button click
    $('#searchButton').on('click', function() {
        searchCompanies();
    });
});
