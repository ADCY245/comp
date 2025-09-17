<?php
/**
 * Admin Dashboard
 * Main admin interface with user management, company info, and analytics
 */

require_once __DIR__ . '/../classes/Auth.php';
require_once __DIR__ . '/../config/database.php';

// Check authentication and admin role
$auth = new Auth();
if (!$auth->isAuthenticated() || !$auth->hasRole('admin')) {
    header('Location: /php/auth/login.php');
    exit();
}

$currentUser = $auth->getCurrentUser();
$db = DatabaseConfig::getInstance();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - Product Calculator</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        .sidebar {
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .sidebar .nav-link {
            color: rgba(255,255,255,0.8);
            padding: 0.75rem 1rem;
            margin: 0.25rem 0;
            border-radius: 0.5rem;
            transition: all 0.3s;
        }
        .sidebar .nav-link:hover,
        .sidebar .nav-link.active {
            color: white;
            background: rgba(255,255,255,0.1);
        }
        .card {
            border: none;
            border-radius: 1rem;
            box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .content-section {
            display: none;
        }
        .content-section.active {
            display: block;
        }
        .user-role-badge {
            font-size: 0.75rem;
            padding: 0.25rem 0.5rem;
        }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row">
            <!-- Sidebar -->
            <nav class="col-md-3 col-lg-2 d-md-block sidebar collapse">
                <div class="position-sticky pt-3">
                    <div class="text-center mb-4">
                        <h4 class="text-white">Admin Panel</h4>
                        <p class="text-white-50">Welcome, <?php echo htmlspecialchars($currentUser['username']); ?></p>
                    </div>
                    
                    <ul class="nav flex-column">
                        <li class="nav-item">
                            <a class="nav-link active" href="#" data-section="dashboard">
                                <i class="fas fa-tachometer-alt me-2"></i>
                                Dashboard
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" data-section="users">
                                <i class="fas fa-users me-2"></i>
                                User Management
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" data-section="companies">
                                <i class="fas fa-building me-2"></i>
                                Company Info
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" data-section="quotations">
                                <i class="fas fa-file-invoice me-2"></i>
                                Quotation History
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" data-section="calculator">
                                <i class="fas fa-calculator me-2"></i>
                                Product Calculator
                            </a>
                        </li>
                        <li class="nav-item mt-3">
                            <a class="nav-link" href="/php/auth/logout.php">
                                <i class="fas fa-sign-out-alt me-2"></i>
                                Logout
                            </a>
                        </li>
                    </ul>
                </div>
            </nav>

            <!-- Main content -->
            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
                <!-- Dashboard Section -->
                <div id="dashboard" class="content-section active">
                    <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                        <h1 class="h2">Dashboard</h1>
                    </div>

                    <!-- Stats Cards -->
                    <div class="row mb-4">
                        <div class="col-md-3 mb-3">
                            <div class="card stat-card">
                                <div class="card-body text-center">
                                    <i class="fas fa-users fa-2x mb-2"></i>
                                    <h3 id="totalUsers">0</h3>
                                    <p class="mb-0">Total Users</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="card stat-card">
                                <div class="card-body text-center">
                                    <i class="fas fa-user-tie fa-2x mb-2"></i>
                                    <h3 id="totalDealers">0</h3>
                                    <p class="mb-0">Dealers</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="card stat-card">
                                <div class="card-body text-center">
                                    <i class="fas fa-file-invoice fa-2x mb-2"></i>
                                    <h3 id="totalQuotations">0</h3>
                                    <p class="mb-0">Quotations</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="card stat-card">
                                <div class="card-body text-center">
                                    <i class="fas fa-building fa-2x mb-2"></i>
                                    <h3 id="totalCompanies">0</h3>
                                    <p class="mb-0">Companies</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Charts -->
                    <div class="row">
                        <div class="col-md-6 mb-4">
                            <div class="card">
                                <div class="card-header">
                                    <h5>User Distribution by Role</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="userRoleChart"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-4">
                            <div class="card">
                                <div class="card-header">
                                    <h5>Quotations by User Type</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="quotationChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- User Management Section -->
                <div id="users" class="content-section">
                    <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                        <h1 class="h2">User Management</h1>
                        <button class="btn btn-primary" onclick="refreshUsers()">
                            <i class="fas fa-refresh me-2"></i>Refresh
                        </button>
                    </div>

                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="usersTableBody">
                                        <!-- Users will be loaded here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Company Info Section -->
                <div id="companies" class="content-section">
                    <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                        <h1 class="h2">Company Information</h1>
                        <button class="btn btn-success" onclick="showAddCompanyModal()">
                            <i class="fas fa-plus me-2"></i>Add Company
                        </button>
                    </div>

                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>Company Name</th>
                                            <th>Email</th>
                                            <th>Contact</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="companiesTableBody">
                                        <!-- Companies will be loaded here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quotation History Section -->
                <div id="quotations" class="content-section">
                    <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                        <h1 class="h2">Quotation History</h1>
                        <div>
                            <select class="form-select d-inline-block w-auto me-2" id="quotationFilter">
                                <option value="">All Users</option>
                                <option value="user">Users Only</option>
                                <option value="dealer">Dealers Only</option>
                                <option value="admin">Admins Only</option>
                            </select>
                            <button class="btn btn-primary" onclick="refreshQuotations()">
                                <i class="fas fa-refresh me-2"></i>Refresh
                            </button>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>User</th>
                                            <th>Role</th>
                                            <th>Company</th>
                                            <th>Total</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="quotationsTableBody">
                                        <!-- Quotations will be loaded here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Product Calculator Section -->
                <div id="calculator" class="content-section">
                    <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
                        <h1 class="h2">Product Calculator Access</h1>
                    </div>

                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <div class="card">
                                <div class="card-body text-center">
                                    <i class="fas fa-user fa-3x mb-3 text-primary"></i>
                                    <h5>User Product Calculator</h5>
                                    <p class="text-muted">Access the user interface for product calculations</p>
                                    <a href="/index.html" class="btn btn-primary" target="_blank">
                                        <i class="fas fa-external-link-alt me-2"></i>Open User Calculator
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <div class="card">
                                <div class="card-body text-center">
                                    <i class="fas fa-user-tie fa-3x mb-3 text-success"></i>
                                    <h5>Dealer Product Calculator</h5>
                                    <p class="text-muted">Access the dealer interface for product calculations</p>
                                    <a href="/php/dealer/index.php" class="btn btn-success" target="_blank">
                                        <i class="fas fa-external-link-alt me-2"></i>Open Dealer Calculator
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    </div>

    <!-- Role Change Modal -->
    <div class="modal fade" id="roleModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Change User Role</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="roleForm">
                        <input type="hidden" id="roleUserId">
                        <div class="mb-3">
                            <label class="form-label">User:</label>
                            <p id="roleUserInfo" class="fw-bold"></p>
                        </div>
                        <div class="mb-3">
                            <label for="newRole" class="form-label">New Role:</label>
                            <select class="form-select" id="newRole" required>
                                <option value="user">User</option>
                                <option value="dealer">Dealer</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="updateUserRole()">Update Role</button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/php/admin/js/dashboard.js"></script>
</body>
</html>
