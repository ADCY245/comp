<?php
/**
 * Authentication Class
 * Handles user authentication and role-based redirection
 */

require_once __DIR__ . '/../config/database.php';

class Auth {
    private $db;
    private $usersCollection;
    
    public function __construct() {
        $this->db = DatabaseConfig::getInstance();
        $this->usersCollection = $this->db->getUsersCollection();
    }
    
    /**
     * Authenticate user with email/username and password
     */
    public function login($login, $password) {
        try {
            // Find user by email or username
            $user = $this->usersCollection->findOne([
                '$or' => [
                    ['email' => strtolower(trim($login))],
                    ['username' => trim($login)]
                ]
            ]);
            
            if (!$user) {
                return ['success' => false, 'message' => 'User not found'];
            }
            
            // Verify password
            if (!password_verify($password, $user['password_hash'])) {
                return ['success' => false, 'message' => 'Invalid password'];
            }
            
            // Check if user is verified
            if (!$user['is_verified'] || !$user['otp_verified']) {
                return ['success' => false, 'message' => 'Account not verified'];
            }
            
            // Start session and store user data
            session_start();
            $_SESSION['user_id'] = (string)$user['_id'];
            $_SESSION['user_email'] = $user['email'];
            $_SESSION['user_username'] = $user['username'];
            $_SESSION['user_role'] = $user['role'] ?? 'user'; // Default to 'user' if no role
            $_SESSION['is_authenticated'] = true;
            
            return [
                'success' => true,
                'user' => [
                    'id' => (string)$user['_id'],
                    'email' => $user['email'],
                    'username' => $user['username'],
                    'role' => $user['role'] ?? 'user'
                ],
                'redirect_url' => $this->getRedirectUrl($user['role'] ?? 'user')
            ];
            
        } catch (Exception $e) {
            error_log("Login error: " . $e->getMessage());
            return ['success' => false, 'message' => 'Login failed'];
        }
    }
    
    /**
     * Get redirect URL based on user role
     */
    private function getRedirectUrl($role) {
        switch (strtolower($role)) {
            case 'admin':
                return '/php/admin/dashboard.php';
            case 'dealer':
                return '/php/dealer/index.php';
            case 'user':
            default:
                return '/index.html'; // Your existing user interface
        }
    }
    
    /**
     * Check if user is authenticated
     */
    public function isAuthenticated() {
        session_start();
        return isset($_SESSION['is_authenticated']) && $_SESSION['is_authenticated'] === true;
    }
    
    /**
     * Get current user data
     */
    public function getCurrentUser() {
        if (!$this->isAuthenticated()) {
            return null;
        }
        
        return [
            'id' => $_SESSION['user_id'],
            'email' => $_SESSION['user_email'],
            'username' => $_SESSION['user_username'],
            'role' => $_SESSION['user_role']
        ];
    }
    
    /**
     * Check if user has specific role
     */
    public function hasRole($role) {
        $user = $this->getCurrentUser();
        return $user && strtolower($user['role']) === strtolower($role);
    }
    
    /**
     * Logout user
     */
    public function logout() {
        session_start();
        session_destroy();
        return true;
    }
    
    /**
     * Update user role (admin only)
     */
    public function updateUserRole($userId, $newRole, $adminUserId) {
        try {
            // Check if current user is admin
            $adminUser = $this->usersCollection->findOne(['_id' => new MongoDB\BSON\ObjectId($adminUserId)]);
            if (!$adminUser || ($adminUser['role'] ?? 'user') !== 'admin') {
                return ['success' => false, 'message' => 'Unauthorized'];
            }
            
            // Update user role
            $result = $this->usersCollection->updateOne(
                ['_id' => new MongoDB\BSON\ObjectId($userId)],
                ['$set' => ['role' => $newRole]]
            );
            
            if ($result->getModifiedCount() > 0) {
                return ['success' => true, 'message' => 'Role updated successfully'];
            } else {
                return ['success' => false, 'message' => 'User not found or role unchanged'];
            }
            
        } catch (Exception $e) {
            error_log("Role update error: " . $e->getMessage());
            return ['success' => false, 'message' => 'Failed to update role'];
        }
    }
    
    /**
     * Get all users (admin only)
     */
    public function getAllUsers($adminUserId) {
        try {
            // Check if current user is admin
            $adminUser = $this->usersCollection->findOne(['_id' => new MongoDB\BSON\ObjectId($adminUserId)]);
            if (!$adminUser || ($adminUser['role'] ?? 'user') !== 'admin') {
                return ['success' => false, 'message' => 'Unauthorized'];
            }
            
            $users = $this->usersCollection->find([], [
                'projection' => [
                    'email' => 1,
                    'username' => 1,
                    'role' => 1,
                    'is_verified' => 1,
                    'created_at' => 1
                ]
            ]);
            
            $userList = [];
            foreach ($users as $user) {
                $userList[] = [
                    'id' => (string)$user['_id'],
                    'email' => $user['email'],
                    'username' => $user['username'],
                    'role' => $user['role'] ?? 'user',
                    'is_verified' => $user['is_verified'] ?? false,
                    'created_at' => $user['created_at'] ?? null
                ];
            }
            
            return ['success' => true, 'users' => $userList];
            
        } catch (Exception $e) {
            error_log("Get users error: " . $e->getMessage());
            return ['success' => false, 'message' => 'Failed to fetch users'];
        }
    }
}
?>
