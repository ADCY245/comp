<?php
/**
 * Dealer Interface
 * Main dealer dashboard with product calculator
 */

require_once __DIR__ . '/../classes/Auth.php';
require_once __DIR__ . '/../config/database.php';

// Check authentication and dealer role
$auth = new Auth();
if (!$auth->isAuthenticated() || !$auth->hasRole('dealer')) {
    header('Location: /php/auth/login.php');
    exit();
}

$currentUser = $auth->getCurrentUser();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dealer Dashboard - Product Calculator</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link rel="stylesheet" href="/static/styles/main.css">
    <style>
        .dealer-header {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 2rem 0;
        }
        .dealer-card {
            border: none;
            border-radius: 1rem;
            box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
            transition: transform 0.2s;
        }
        .dealer-card:hover {
            transform: translateY(-2px);
        }
        .dealer-badge {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 2rem;
            font-size: 0.875rem;
            font-weight: 500;
        }
        .product-section {
            margin-bottom: 3rem;
        }
        .price-display {
            font-size: 1.25rem;
            font-weight: bold;
            color: #28a745;
        }
        .dealer-discount {
            background: #e8f5e8;
            border: 1px solid #28a745;
            border-radius: 0.5rem;
            padding: 1rem;
            margin: 1rem 0;
        }
    </style>
</head>
<body>
    <!-- Header -->
    <header class="dealer-header">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-md-8">
                    <h1><i class="fas fa-user-tie me-2"></i>Dealer Dashboard</h1>
                    <p class="mb-0">Welcome back, <?php echo htmlspecialchars($currentUser['username']); ?>!</p>
                </div>
                <div class="col-md-4 text-end">
                    <span class="dealer-badge">
                        <i class="fas fa-star me-1"></i>Dealer Access
                    </span>
                    <div class="mt-2">
                        <a href="/php/auth/logout.php" class="btn btn-outline-light">
                            <i class="fas fa-sign-out-alt me-1"></i>Logout
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <div class="container mt-4">
        <!-- Company Selection Section -->
        <div id="companySelectionSection" class="mb-4">
            <div class="card dealer-card">
                <div class="card-header bg-success text-white">
                    <h4 class="mb-0"><i class="fas fa-building me-2"></i>Select Company</h4>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8">
                            <div class="form-group">
                                <label for="companyInput" class="form-label">Search Company:</label>
                                <input type="text" id="companyInput" class="form-control" placeholder="Type company name to search...">
                                <div id="searchResults" class="mt-2" style="display: none;"></div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="d-grid">
                                <button id="selectCompanyBtn" class="btn btn-success" disabled>
                                    <i class="fas fa-check me-2"></i>Select Company
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="dealer-discount">
                        <h6><i class="fas fa-percentage me-2"></i>Dealer Benefits</h6>
                        <ul class="mb-0">
                            <li>Special dealer pricing on all products</li>
                            <li>Bulk order discounts available</li>
                            <li>Priority customer support</li>
                            <li>Extended warranty options</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Product Selection Section -->
        <div id="productSelectionSection" style="display: none;">
            <div class="card dealer-card mb-4">
                <div class="card-header bg-success text-white d-flex justify-content-between align-items-center">
                    <h4 class="mb-0"><i class="fas fa-box me-2"></i>Product Calculator</h4>
                    <button id="changeCompanyBtn" class="btn btn-outline-light btn-sm">
                        <i class="fas fa-exchange-alt me-1"></i>Change Company
                    </button>
                </div>
                <div class="card-body">
                    <div id="selectedCompanyInfo" class="alert alert-success">
                        <!-- Company info will be displayed here -->
                    </div>
                    
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <div class="card h-100">
                                <div class="card-body text-center">
                                    <i class="fas fa-layer-group fa-3x text-primary mb-3"></i>
                                    <h5>M-Packs</h5>
                                    <p class="text-muted">Industrial packaging solutions</p>
                                    <div class="dealer-discount mb-3">
                                        <small><i class="fas fa-tag me-1"></i>Dealer Price: 15% off retail</small>
                                    </div>
                                    <a href="#" id="mpacksLink" class="btn btn-primary">
                                        <i class="fas fa-calculator me-2"></i>Calculate M-Packs
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <div class="card h-100">
                                <div class="card-body text-center">
                                    <i class="fas fa-square fa-3x text-info mb-3"></i>
                                    <h5>Blankets</h5>
                                    <p class="text-muted">Protective blanket solutions</p>
                                    <div class="dealer-discount mb-3">
                                        <small><i class="fas fa-tag me-1"></i>Dealer Price: 12% off retail</small>
                                    </div>
                                    <a href="#" id="blanketsLink" class="btn btn-info">
                                        <i class="fas fa-calculator me-2"></i>Calculate Blankets
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="row">
                <div class="col-md-4 mb-3">
                    <div class="card dealer-card">
                        <div class="card-body text-center">
                            <i class="fas fa-history fa-2x text-warning mb-2"></i>
                            <h6>My Quotations</h6>
                            <a href="/php/dealer/quotations.php" class="btn btn-outline-warning btn-sm">View History</a>
                        </div>
                    </div>
                </div>
                <div class="col-md-4 mb-3">
                    <div class="card dealer-card">
                        <div class="card-body text-center">
                            <i class="fas fa-shopping-cart fa-2x text-success mb-2"></i>
                            <h6>Current Cart</h6>
                            <span id="cartCount" class="badge bg-success">0</span>
                            <a href="/cart" class="btn btn-outline-success btn-sm d-block mt-2">View Cart</a>
                        </div>
                    </div>
                </div>
                <div class="col-md-4 mb-3">
                    <div class="card dealer-card">
                        <div class="card-body text-center">
                            <i class="fas fa-phone fa-2x text-info mb-2"></i>
                            <h6>Support</h6>
                            <a href="tel:+1234567890" class="btn btn-outline-info btn-sm">Contact Us</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Flash Messages Container -->
    <div id="flashContainer"></div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/php/dealer/js/dealer.js"></script>
</body>
</html>
