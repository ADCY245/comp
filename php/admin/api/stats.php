<?php
/**
 * Admin Stats API
 * Returns dashboard statistics
 */

require_once __DIR__ . '/../../classes/Auth.php';
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: application/json');

// Check authentication and admin role
$auth = new Auth();
if (!$auth->isAuthenticated() || !$auth->hasRole('admin')) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

try {
    $db = DatabaseConfig::getInstance();
    $database = $db->getDatabase();
    
    // Get user counts by role
    $usersPipeline = [
        ['$group' => [
            '_id' => ['$ifNull' => ['$role', 'user']],
            'count' => ['$sum' => 1]
        ]]
    ];
    
    $userStats = $database->selectCollection('users')->aggregate($usersPipeline)->toArray();
    
    $totalUsers = 0;
    $totalDealers = 0;
    $totalAdmins = 0;
    
    foreach ($userStats as $stat) {
        $role = $stat['_id'];
        $count = $stat['count'];
        
        switch ($role) {
            case 'dealer':
                $totalDealers = $count;
                break;
            case 'admin':
                $totalAdmins = $count;
                break;
            case 'user':
            default:
                $totalUsers = $count;
                break;
        }
    }
    
    // Get total quotations
    $totalQuotations = $database->selectCollection('quotations')->countDocuments();
    
    // Get total companies
    $totalCompanies = $database->selectCollection('companies')->countDocuments();
    
    echo json_encode([
        'success' => true,
        'stats' => [
            'totalUsers' => $totalUsers,
            'totalDealers' => $totalDealers,
            'totalAdmins' => $totalAdmins,
            'totalQuotations' => $totalQuotations,
            'totalCompanies' => $totalCompanies
        ]
    ]);
    
} catch (Exception $e) {
    error_log("Stats API error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load statistics'
    ]);
}
?>
