<?php
/**
 * Admin Update Role API
 * Updates user roles
 */

require_once __DIR__ . '/../../classes/Auth.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit();
}

// Check authentication and admin role
$auth = new Auth();
if (!$auth->isAuthenticated() || !$auth->hasRole('admin')) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit();
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $userId = $input['userId'] ?? '';
    $newRole = $input['newRole'] ?? '';
    
    if (empty($userId) || empty($newRole)) {
        echo json_encode(['success' => false, 'message' => 'User ID and new role are required']);
        exit();
    }
    
    // Validate role
    $validRoles = ['user', 'dealer', 'admin'];
    if (!in_array($newRole, $validRoles)) {
        echo json_encode(['success' => false, 'message' => 'Invalid role']);
        exit();
    }
    
    $currentUser = $auth->getCurrentUser();
    $result = $auth->updateUserRole($userId, $newRole, $currentUser['id']);
    
    echo json_encode($result);
    
} catch (Exception $e) {
    error_log("Update role API error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Failed to update role'
    ]);
}
?>
