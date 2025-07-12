/**
 * Admin Panel JavaScript
 * Handles client-side functionality for the admin panel
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Toggle sidebar
    const menuToggle = document.getElementById('menu-toggle');
    const wrapper = document.getElementById('wrapper');
    
    if (menuToggle) {
        menuToggle.addEventListener('click', function(e) {
            e.preventDefault();
            wrapper.classList.toggle('toggled');
        });
    }

    // Handle delete confirmation modals
    document.querySelectorAll('.delete-confirm').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const form = this.closest('form');
            const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
            
            // Set the form action in the modal's confirm button
            const confirmBtn = document.getElementById('confirmDeleteBtn');
            confirmBtn.onclick = function() {
                form.submit();
            };
            
            modal.show();
        });
    });

    // Handle status changes
    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', function() {
            const id = this.dataset.id;
            const status = this.value;
            const url = this.dataset.url;
            
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify({ id: id, status: status })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showAlert('Status updated successfully', 'success');
                    // Optionally update the UI to reflect the change
                    const badge = document.querySelector(`#status-badge-${id}`);
                    if (badge) {
                        badge.className = `badge bg-${getStatusBadgeClass(status)}`;
                        badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                    }
                } else {
                    showAlert(data.message || 'Failed to update status', 'danger');
                    // Revert the select to its previous value
                    this.value = this.dataset.previousValue;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showAlert('An error occurred while updating status', 'danger');
                this.value = this.dataset.previousValue;
            });
        });
        
        // Store the initial value for revert on error
        select.dataset.previousValue = select.value;
    });

    // Handle bulk actions
    const bulkActionForm = document.getElementById('bulk-action-form');
    const bulkActionSelect = document.getElementById('bulk-action');
    
    if (bulkActionForm && bulkActionSelect) {
        bulkActionForm.addEventListener('submit', function(e) {
            const selectedItems = document.querySelectorAll('input[name="selected_items[]"]:checked');
            
            if (selectedItems.length === 0) {
                e.preventDefault();
                showAlert('Please select at least one item', 'warning');
                return false;
            }
            
            if (bulkActionSelect.value === '') {
                e.preventDefault();
                showAlert('Please select an action', 'warning');
                return false;
            }
            
            return confirm(`Are you sure you want to ${bulkActionSelect.value} the selected ${selectedItems.length} item(s)?`);
        });
    }

    // Toggle all checkboxes
    const toggleAllCheckbox = document.getElementById('toggle-all');
    if (toggleAllCheckbox) {
        toggleAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('input[name="selected_items[]"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });
    }

    // Handle form submissions with loading state
    document.querySelectorAll('form[data-ajax="true"]').forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const submitButton = form.querySelector('[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            
            // Show loading state
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
            
            const formData = new FormData(form);
            
            fetch(form.action, {
                method: form.method,
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.redirect) {
                    window.location.href = data.redirect;
                } else if (data.success) {
                    showAlert(data.message || 'Operation completed successfully', 'success');
                    if (data.reload) {
                        setTimeout(() => window.location.reload(), 1500);
                    }
                } else {
                    showAlert(data.message || 'An error occurred', 'danger');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showAlert('An error occurred while processing your request', 'danger');
            })
            .finally(() => {
                // Restore button state
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
            });
        });
    });

    // Initialize data tables if DataTables is available
    if (typeof $.fn.DataTable === 'function') {
        $('.datatable').DataTable({
            responsive: true,
            pageLength: 25,
            order: [[0, 'desc']],
            language: {
                search: "_INPUT_",
                searchPlaceholder: "Search...",
                lengthMenu: "Show _MENU_ entries per page",
                info: "Showing _START_ to _END_ of _TOTAL_ entries",
                infoEmpty: "No entries found",
                infoFiltered: "(filtered from _MAX_ total entries)"
            }
        });
    }
});

/**
 * Show a flash message
 * @param {string} message - The message to display
 * @param {string} type - The alert type (success, danger, warning, info)
 */
function showAlert(message, type = 'info') {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    // Create a container for alerts if it doesn't exist
    let alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alert-container';
        alertContainer.style.position = 'fixed';
        alertContainer.style.top = '20px';
        alertContainer.style.right = '20px';
        alertContainer.style.zIndex = '1100';
        alertContainer.style.maxWidth = '400px';
        document.body.appendChild(alertContainer);
    }
    
    // Add the new alert
    const alertDiv = document.createElement('div');
    alertDiv.innerHTML = alertHtml;
    alertContainer.appendChild(alertDiv);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = new bootstrap.Alert(alertDiv.querySelector('.alert'));
        alert.close();
    }, 5000);
}

/**
 * Get the appropriate badge class for a status
 * @param {string} status - The status value
 * @returns {string} The appropriate Bootstrap badge class
 */
function getStatusBadgeClass(status) {
    const statusMap = {
        'active': 'success',
        'inactive': 'secondary',
        'pending': 'warning',
        'approved': 'success',
        'rejected': 'danger',
        'banned': 'dark',
        'suspended': 'warning',
        'completed': 'success',
        'failed': 'danger',
        'processing': 'info'
    };
    
    return statusMap[status.toLowerCase()] || 'secondary';
}

/**
 * Format a date string
 * @param {string} dateString - The date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
    if (!dateString) return '';
    
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    return new Date(dateString).toLocaleDateString(undefined, options);
}

/**
 * Format a number as currency
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code (default: 'USD')
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

/**
 * Toggle password visibility
 * @param {HTMLElement} button - The button element that was clicked
 */
function togglePassword(button) {
    const input = button.previousElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    }
}

// Make functions available globally
window.showAlert = showAlert;
window.formatDate = formatDate;
window.formatCurrency = formatCurrency;
window.togglePassword = togglePassword;
