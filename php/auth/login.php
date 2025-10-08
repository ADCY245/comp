<?php
/**
 * PHP Login Handler
 * Handles login requests and role-based redirection
 */

require_once __DIR__ . '/../classes/Auth.php';

// Set content type for JSON responses
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
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

try {
    // Get input data
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        // Try form data if JSON fails
        $login = $_POST['login'] ?? '';
        $password = $_POST['password'] ?? '';
    } else {
        $login = $input['login'] ?? '';
        $password = $input['password'] ?? '';
    }
    
    // Validate input
    if (empty($login) || empty($password)) {
        echo json_encode([
            'success' => false,
            'message' => 'Email/username and password are required'
        ]);
        exit();
    }
    
    // Authenticate user
    $auth = new Auth();
    $result = $auth->login($login, $password);
    
    if ($result['success']) {
        // Log successful login
        error_log("Successful login for user: " . $login . " with role: " . $result['user']['role']);
        
        echo json_encode([
            'success' => true,
            'message' => 'Login successful',
            'redirectTo' => $result['redirect_url'],
            'user' => $result['user']
        ]);
    } else {
        // Log failed login attempt
        error_log("Failed login attempt for: " . $login . " - " . $result['message']);
        
        echo json_encode([
            'success' => false,
            'message' => $result['message']
        ]);
    }
    
} catch (Exception $e) {
    error_log("Login error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'An error occurred during login'
    ]);
}
?>
