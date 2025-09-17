<?php
/**
 * Admin Quotations API
 * Returns all quotations for admin management
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
    $quotationsCollection = $db->getQuotationsCollection();
    $usersCollection = $db->getUsersCollection();
    $companiesCollection = $db->getCompaniesCollection();
    
    // Get quotations with user and company info
    $quotations = $quotationsCollection->aggregate([
        [
            '$lookup' => [
                'from' => 'users',
                'localField' => 'user_id',
                'foreignField' => '_id',
                'as' => 'user_info'
            ]
        ],
        [
            '$lookup' => [
                'from' => 'companies',
                'localField' => 'company_id',
                'foreignField' => '_id',
                'as' => 'company_info'
            ]
        ],
        [
            '$sort' => ['created_at' => -1]
        ]
    ]);
    
    $quotationsList = [];
    foreach ($quotations as $quotation) {
        $userInfo = $quotation['user_info'][0] ?? null;
        $companyInfo = $quotation['company_info'][0] ?? null;
        
        $quotationsList[] = [
            'id' => (string)$quotation['_id'],
            'user_name' => $userInfo ? $userInfo['username'] : 'Unknown',
            'user_role' => $userInfo ? ($userInfo['role'] ?? 'user') : 'user',
            'company_name' => $companyInfo ? ($companyInfo['name'] ?? $companyInfo['companyName'] ?? 'Unknown') : 'Unknown',
            'total' => $quotation['total'] ?? 0,
            'created_at' => $quotation['created_at'] ?? null,
            'products' => $quotation['products'] ?? []
        ];
    }
    
    echo json_encode([
        'success' => true,
        'quotations' => $quotationsList
    ]);
    
} catch (Exception $e) {
    error_log("Quotations API error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Failed to load quotations'
    ]);
}
?>
