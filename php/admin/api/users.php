<?php
/**
 * Admin Users API
 * Returns all users for admin management
 */

require_once __DIR__ . '/../../classes/Auth.php';

header('Content-Type: application/json');

// Check authentication and admin role
$auth = new Auth();
if (!$auth->isAuthenticated() || !$auth->hasRole('admin')) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

try {
    $currentUser = $auth->getCurrentUser();
    $result = $auth->getAllUsers($currentUser['id']);
    
    echo json_encode($result);
    
} catch (Exception $e) {
    error_log("Users API error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load users'
    ]);
}
?>
