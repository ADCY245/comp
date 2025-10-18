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

// Initialize search functionality
$(document).ready(function() {
    // Search on enter key
    $('#searchCompanies').on('keyup', function(e) {
        if (e.key === 'Enter') {
            const searchInput = $('#searchCompanies');
            if (!searchInput.length) return;
            
            const searchTerm = searchInput.val().trim();
            loadCompanies(1, searchTerm);
        }
    });
    
    // Search button click
    $('#searchButton').on('click', function() {
        const searchInput = $('#searchCompanies');
        if (!searchInput.length) return;
        
        const searchTerm = searchInput.val().trim();
        loadCompanies(1, searchTerm);
    });
});
