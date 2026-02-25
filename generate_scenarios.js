
const fs = require('fs');

const categories = ['Staff Meals', 'Vendor Payments', 'Office Supplies', 'Travel', 'Utilities', 'Income'];
const types = ['exact', 'fuzzy', 'ambiguous'];
const accounts = {
    'Staff Meals': '1001',
    'Vendor Payments': '4000',
    'Office Supplies': '6101',
    'Travel': '6200',
    'Utilities': '6100',
    'Income': '4100'
};

const vendors = {
    'Staff Meals': ['KFC', 'Subway', 'Pizza Hut', 'Coffee Shop', 'Local Diner'],
    'Vendor Payments': ['Microsoft', 'Amazon Web Services', 'Zesco', 'Zamtel', 'Oracle'],
    'Office Supplies': ['Stationery World', 'Office Depot', 'Ink & Paper'],
    'Travel': ['Uber', 'Emirates', 'Hilton', 'Yellow Cab'],
    'Utilities': ['Water Corp', 'Electric Co', 'Waste Mgmt'],
    'Income': ['Consulting Fee', 'Product Sale', 'Service Revenue']
};

function generateScenarios(count) {
    const scenarios = [];
    for (let i = 0; i < count; i++) {
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const type = types[Math.floor(Math.random() * types.length)];
        const vendor = vendors[cat][Math.floor(Math.random() * vendors[cat].length)];
        const amount = Math.floor(Math.random() * (i % 10 === 0 ? 15000 : 2000)) + 10;

        let description = vendor;
        if (type === 'fuzzy') description = `${vendor} - Transaction #${Math.floor(Math.random() * 1000)}`;
        if (type === 'ambiguous') description = vendor.substring(0, 3) + '...';

        const risk_level = amount >= 5000 ? 'HIGH' : (amount >= 1000 ? 'MEDIUM' : 'LOW');

        // Scenario source/path logic
        let decision_path = 'AI';
        if (type === 'exact' && Math.random() > 0.5) decision_path = 'MEMORY';
        if (i % 4 === 0) decision_path = 'RULE';

        const scenario = {
            name: `Generated Scen ${i}: ${cat} (${type})`,
            input: {
                description,
                amount,
                department: ['FINANCE', 'SALES', 'HR', 'IT'][Math.floor(Math.random() * 4)]
            },
            expected: {
                decision_path,
                risk_level,
                requires_review: risk_level === 'HIGH' || decision_path === 'AI' && Math.random() > 0.7,
                min_confidence: decision_path === 'MEMORY' ? 0.92 : (decision_path === 'RULE' ? 0.9 : 0.7),
                should_learn: decision_path === 'AI' && Math.random() > 0.5
            },
            // Extra fields requested by user for the "report" part
            metadata: {
                type,
                category_expected: cat,
                source: decision_path,
                conflict: Math.random() > 0.9 ? 'HARD' : 'NONE'
            }
        };
        scenarios.push(scenario);
    }
    return scenarios;
}

const data = generateScenarios(500);
fs.writeFileSync('generated_scenarios.json', JSON.stringify(data, null, 2));
console.log('Successfully generated 500 scenarios.');
