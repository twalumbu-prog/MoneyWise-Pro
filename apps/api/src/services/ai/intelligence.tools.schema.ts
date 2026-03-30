export const intelligenceToolSchemas = [
    {
        name: "get_organization_info",
        description: "Discovery Tool: Get a list of departments, requisition types, and valid statuses present in the organization's system to understand the configuration before searching.",
        parameters: {
            type: "object",
            properties: {
                organizationId: { type: "string", description: "The UUID of the organization." }
            },
            required: ["organizationId"]
        }
    },
    {
        name: "get_requisition_details",
        description: "Detail Tool: Retrieve full details for a specific requisition ID, including all detailed line items (item descriptions, quantities, and individual costs). Use this for granular 'drill-down' analysis.",
        parameters: {
            type: "object",
            properties: {
                organizationId: { type: "string", description: "The UUID of the organization." },
                requisitionId: { type: "string", description: "The UUID of the requisition to inspect." }
            },
            required: ["organizationId", "requisitionId"]
        }
    },
    {
        name: "get_batch_requisition_details",
        description: "High-Efficiency Batch Tool: Retrieve full line-item details for multiple requisition IDs at once. Strongly recommended when analyzing a list of search results to avoid many individual calls.",
        parameters: {
            type: "object",
            properties: {
                organizationId: { type: "string", description: "The UUID of the organization." },
                requisitionIds: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of requisition UUIDs to fetch details for." 
                }
            },
            required: ["organizationId", "requisitionIds"]
        }
    },
    {
        name: "get_financial_summary",
        description: "Aggregation Tool: Get a high-level financial summary of spending, including totals and breakdowns by department and status for a given period.",
        parameters: {
            type: "object",
            properties: {
                organizationId: { type: "string", description: "The UUID of the organization." },
                params: {
                    type: "object",
                    properties: {
                        startDate: { type: "string", description: "ISO 8601 start date (e.g., '2026-03-20')." },
                        endDate: { type: "string", description: "ISO 8601 end date (e.g., '2026-03-26')." }
                    }
                }
            },
            required: ["organizationId"]
        }
    },
    {
        name: "search_requisitions",
        description: "Search Tool: Find requisitions matching a specific description, status, or department. Returns a list of matching records with their basic metadata and total amounts.",
        parameters: {
            type: "object",
            properties: {
                organizationId: { type: "string", description: "The UUID of the organization." },
                params: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Text to search for in descriptions (e.g., 'chicken')." },
                        status: { type: "string", description: "Filter by status (e.g., 'COMPLETED')." },
                        department: { type: "string", description: "Filter by department name (e.g., 'Catering')." },
                        limit: { type: "number", description: "Max results to return (default 20)." }
                    }
                }
            },
            required: ["organizationId"]
        }
    }
];
