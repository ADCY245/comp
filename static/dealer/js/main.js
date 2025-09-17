// Dealer-specific main JavaScript file
console.log('Dealer JavaScript loaded');

// Initialize tooltips and other common functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips with red theme
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            customClass: 'dealer-tooltip',
            template: '<div class="tooltip dealer-tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
        });
    });

    // Update active nav links for dealer pages
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') && currentPath.includes(link.getAttribute('href'))) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });

    // Add red theme to modals
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('dealer-theme');
    });

    // Initialize any other common dealer-specific functionality here
});

// Utility function to show loading state
function showLoading(element) {
    if (element) {
        const originalText = element.innerHTML;
        element.setAttribute('data-original-text', originalText);
        element.disabled = true;
        element.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...';
    }
}

// Utility function to hide loading state
function hideLoading(element) {
    if (element && element.hasAttribute('data-original-text')) {
        const originalText = element.getAttribute('data-original-text');
        element.innerHTML = originalText;
        element.disabled = false;
        element.removeAttribute('data-original-text');
    }
}

// Make utility functions available globally
window.showLoading = showLoading;
window.hideLoading = hideLoading;
