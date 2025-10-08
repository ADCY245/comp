<?php
/**
 * Admin Companies API
 * Returns all companies for admin management
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
    $companiesCollection = $db->getCompaniesCollection();
    
    $companies = $companiesCollection->find([], [
        'projection' => [
            'name' => 1,
            'companyName' => 1,
            'email' => 1,
            'emailId' => 1,
            'contact' => 1,
            'phone' => 1,
            'address' => 1,
            'created_at' => 1
        ]
    ]);
    
    $companiesList = [];
    foreach ($companies as $company) {
        $companiesList[] = [
            'id' => (string)$company['_id'],
            'name' => $company['name'] ?? $company['companyName'] ?? '',
            'companyName' => $company['companyName'] ?? $company['name'] ?? '',
            'email' => $company['email'] ?? $company['emailId'] ?? '',
            'emailId' => $company['emailId'] ?? $company['email'] ?? '',
            'contact' => $company['contact'] ?? $company['phone'] ?? '',
            'phone' => $company['phone'] ?? $company['contact'] ?? '',
            'address' => $company['address'] ?? '',
            'created_at' => $company['created_at'] ?? null
        ];
    }
    
    echo json_encode([
        'success' => true,
        'companies' => $companiesList
    ]);
    
} catch (Exception $e) {
    error_log("Companies API error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load companies'
    ]);
}
?>
