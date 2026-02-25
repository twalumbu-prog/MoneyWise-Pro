import { AIScenario } from '../types';

export const generatedScenarios: AIScenario[] = [
  {
    "name": "Generated Scen 0: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #859",
      "amount": 4584,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 1: Travel (ambiguous)",
    "input": {
      "description": "Emi...",
      "amount": 1335,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 2: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #3",
      "amount": 451,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 3: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 1890,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 4: Staff Meals (ambiguous)",
    "input": {
      "description": "Sub...",
      "amount": 553,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 5: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 651,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 6: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #721",
      "amount": 752,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 7: Staff Meals (fuzzy)",
    "input": {
      "description": "Local Diner - Transaction #761",
      "amount": 393,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 8: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 1267,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 9: Utilities (ambiguous)",
    "input": {
      "description": "Ele...",
      "amount": 280,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 10: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 1286,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 11: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 693,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 12: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1795,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 13: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 773,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 14: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 1765,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 15: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 1003,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 16: Vendor Payments (exact)",
    "input": {
      "description": "Oracle",
      "amount": 1492,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 17: Vendor Payments (ambiguous)",
    "input": {
      "description": "Mic...",
      "amount": 1405,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 18: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 405,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 19: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 233,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 20: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 4287,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 21: Staff Meals (ambiguous)",
    "input": {
      "description": "KFC...",
      "amount": 14,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 22: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 14,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 23: Staff Meals (fuzzy)",
    "input": {
      "description": "KFC - Transaction #281",
      "amount": 536,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 24: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1735,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 25: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 1486,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 26: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zesco - Transaction #992",
      "amount": 1236,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 27: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zam...",
      "amount": 952,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 28: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 1579,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 29: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 103,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 30: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 5266,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 31: Staff Meals (fuzzy)",
    "input": {
      "description": "Coffee Shop - Transaction #883",
      "amount": 596,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 32: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 1837,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 33: Staff Meals (ambiguous)",
    "input": {
      "description": "Loc...",
      "amount": 1741,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 34: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 1735,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 35: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1075,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 36: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #827",
      "amount": 322,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 37: Office Supplies (ambiguous)",
    "input": {
      "description": "Off...",
      "amount": 482,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 38: Travel (exact)",
    "input": {
      "description": "Emirates",
      "amount": 1997,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 39: Travel (fuzzy)",
    "input": {
      "description": "Uber - Transaction #377",
      "amount": 700,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 40: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zamtel - Transaction #841",
      "amount": 5468,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 41: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 943,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 42: Staff Meals (ambiguous)",
    "input": {
      "description": "Sub...",
      "amount": 1101,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 43: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1966,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 44: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #517",
      "amount": 1507,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 45: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1594,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 46: Vendor Payments (exact)",
    "input": {
      "description": "Zesco",
      "amount": 736,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 47: Staff Meals (fuzzy)",
    "input": {
      "description": "Local Diner - Transaction #924",
      "amount": 408,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 48: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ora...",
      "amount": 1447,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 49: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #652",
      "amount": 513,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 50: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 2276,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 51: Utilities (fuzzy)",
    "input": {
      "description": "Waste Mgmt - Transaction #531",
      "amount": 1524,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 52: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1401,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 53: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #997",
      "amount": 1425,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 54: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 1575,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 55: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 606,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 56: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ora...",
      "amount": 1430,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 57: Vendor Payments (exact)",
    "input": {
      "description": "Zamtel",
      "amount": 890,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 58: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #353",
      "amount": 565,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 59: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 984,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 60: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 14370,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 61: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #937",
      "amount": 128,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 62: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #433",
      "amount": 697,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 63: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 368,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 64: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 726,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 65: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #17",
      "amount": 1178,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 66: Vendor Payments (exact)",
    "input": {
      "description": "Microsoft",
      "amount": 180,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 67: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 1903,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 68: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 291,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 69: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 1237,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 70: Travel (fuzzy)",
    "input": {
      "description": "Yellow Cab - Transaction #63",
      "amount": 4414,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 71: Staff Meals (ambiguous)",
    "input": {
      "description": "Loc...",
      "amount": 1068,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 72: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 173,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 73: Staff Meals (fuzzy)",
    "input": {
      "description": "Local Diner - Transaction #643",
      "amount": 146,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 74: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1304,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 75: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 560,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 76: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 1543,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 77: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 1032,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 78: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 678,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 79: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 711,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 80: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 3764,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 81: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zam...",
      "amount": 1760,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 82: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #180",
      "amount": 560,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 83: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 1511,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 84: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #734",
      "amount": 1090,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 85: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 1492,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 86: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #979",
      "amount": 744,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 87: Staff Meals (exact)",
    "input": {
      "description": "Subway",
      "amount": 1464,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 88: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #223",
      "amount": 1049,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 89: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #510",
      "amount": 1710,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 90: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 12649,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 91: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #788",
      "amount": 118,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 92: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 794,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 93: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 613,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 94: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #577",
      "amount": 756,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 95: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 894,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 96: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 1499,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 97: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 100,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 98: Office Supplies (ambiguous)",
    "input": {
      "description": "Off...",
      "amount": 1185,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 99: Travel (fuzzy)",
    "input": {
      "description": "Yellow Cab - Transaction #620",
      "amount": 372,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 100: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 10404,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 101: Vendor Payments (exact)",
    "input": {
      "description": "Zamtel",
      "amount": 1291,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 102: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 1890,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 103: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #469",
      "amount": 1833,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 104: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #505",
      "amount": 1745,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 105: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zamtel - Transaction #744",
      "amount": 1061,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 106: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #304",
      "amount": 736,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 107: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 1031,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 108: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 1237,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 109: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #196",
      "amount": 1315,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 110: Vendor Payments (exact)",
    "input": {
      "description": "Amazon Web Services",
      "amount": 6126,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 111: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 1101,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 112: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 1418,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 113: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 714,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 114: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 1863,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 115: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 948,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 116: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 23,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 117: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 1536,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 118: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 749,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 119: Travel (fuzzy)",
    "input": {
      "description": "Yellow Cab - Transaction #66",
      "amount": 1145,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 120: Vendor Payments (fuzzy)",
    "input": {
      "description": "Microsoft - Transaction #334",
      "amount": 9370,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 121: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #29",
      "amount": 986,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 122: Travel (exact)",
    "input": {
      "description": "Hilton",
      "amount": 571,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 123: Travel (fuzzy)",
    "input": {
      "description": "Uber - Transaction #495",
      "amount": 621,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 124: Staff Meals (ambiguous)",
    "input": {
      "description": "Loc...",
      "amount": 283,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 125: Travel (ambiguous)",
    "input": {
      "description": "Emi...",
      "amount": 341,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 126: Vendor Payments (exact)",
    "input": {
      "description": "Zesco",
      "amount": 724,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 127: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #360",
      "amount": 617,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 128: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 805,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 129: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #52",
      "amount": 1505,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 130: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #906",
      "amount": 2302,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 131: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 728,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 132: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 1689,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 133: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 76,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 134: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ora...",
      "amount": 1333,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 135: Staff Meals (fuzzy)",
    "input": {
      "description": "KFC - Transaction #687",
      "amount": 54,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 136: Travel (exact)",
    "input": {
      "description": "Hilton",
      "amount": 1687,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 137: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zamtel - Transaction #847",
      "amount": 1604,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 138: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #744",
      "amount": 1982,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 139: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 725,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 140: Vendor Payments (exact)",
    "input": {
      "description": "Zamtel",
      "amount": 13923,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 141: Vendor Payments (exact)",
    "input": {
      "description": "Zamtel",
      "amount": 1525,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 142: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #251",
      "amount": 112,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 143: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #832",
      "amount": 1920,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 144: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #184",
      "amount": 389,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 145: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 904,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 146: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 1447,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 147: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #53",
      "amount": 319,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 148: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 1477,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 149: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 1195,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 150: Staff Meals (exact)",
    "input": {
      "description": "Subway",
      "amount": 14850,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 151: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #461",
      "amount": 318,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 152: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #795",
      "amount": 386,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 153: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 696,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 154: Staff Meals (ambiguous)",
    "input": {
      "description": "KFC...",
      "amount": 1032,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 155: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 222,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 156: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #337",
      "amount": 1099,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 157: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 633,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 158: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 1716,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 159: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 1865,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 160: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 14945,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 161: Vendor Payments (fuzzy)",
    "input": {
      "description": "Microsoft - Transaction #588",
      "amount": 1008,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 162: Vendor Payments (exact)",
    "input": {
      "description": "Zamtel",
      "amount": 190,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 163: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 377,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 164: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 17,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 165: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 1044,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 166: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 1386,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 167: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 1218,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 168: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 905,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 169: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 1445,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 170: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #721",
      "amount": 3621,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 171: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1896,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 172: Staff Meals (exact)",
    "input": {
      "description": "Subway",
      "amount": 1117,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 173: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 178,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 174: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 881,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 175: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 1054,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 176: Travel (exact)",
    "input": {
      "description": "Emirates",
      "amount": 489,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 177: Staff Meals (exact)",
    "input": {
      "description": "KFC",
      "amount": 1316,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 178: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ora...",
      "amount": 1936,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 179: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 105,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 180: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #812",
      "amount": 8734,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 181: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 950,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 182: Staff Meals (fuzzy)",
    "input": {
      "description": "KFC - Transaction #203",
      "amount": 625,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 183: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 992,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 184: Staff Meals (fuzzy)",
    "input": {
      "description": "Pizza Hut - Transaction #364",
      "amount": 34,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 185: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 88,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 186: Staff Meals (exact)",
    "input": {
      "description": "Subway",
      "amount": 1286,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 187: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 431,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 188: Travel (exact)",
    "input": {
      "description": "Hilton",
      "amount": 239,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 189: Utilities (ambiguous)",
    "input": {
      "description": "Ele...",
      "amount": 432,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 190: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 1275,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 191: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #973",
      "amount": 618,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 192: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 583,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 193: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #591",
      "amount": 1754,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 194: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 1991,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 195: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 989,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 196: Vendor Payments (ambiguous)",
    "input": {
      "description": "Mic...",
      "amount": 726,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 197: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 1912,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 198: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 875,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 199: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #81",
      "amount": 822,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 200: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zam...",
      "amount": 4246,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 201: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 309,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 202: Travel (ambiguous)",
    "input": {
      "description": "Emi...",
      "amount": 1792,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 203: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 1220,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 204: Staff Meals (exact)",
    "input": {
      "description": "KFC",
      "amount": 1270,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 205: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 35,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 206: Staff Meals (ambiguous)",
    "input": {
      "description": "KFC...",
      "amount": 167,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 207: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 1249,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 208: Staff Meals (ambiguous)",
    "input": {
      "description": "Loc...",
      "amount": 1088,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 209: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 478,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 210: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 11223,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 211: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 1209,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 212: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 585,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 213: Staff Meals (ambiguous)",
    "input": {
      "description": "Sub...",
      "amount": 582,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 214: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 760,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 215: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 537,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 216: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 1397,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 217: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #753",
      "amount": 653,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 218: Vendor Payments (fuzzy)",
    "input": {
      "description": "Microsoft - Transaction #869",
      "amount": 1773,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 219: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #442",
      "amount": 1840,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 220: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #1",
      "amount": 13074,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 221: Vendor Payments (exact)",
    "input": {
      "description": "Amazon Web Services",
      "amount": 242,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 222: Staff Meals (ambiguous)",
    "input": {
      "description": "KFC...",
      "amount": 925,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 223: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 1230,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 224: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 452,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 225: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 663,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 226: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 204,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 227: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #132",
      "amount": 547,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 228: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 700,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 229: Utilities (ambiguous)",
    "input": {
      "description": "Ele...",
      "amount": 1553,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 230: Staff Meals (exact)",
    "input": {
      "description": "KFC",
      "amount": 10818,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 231: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 1950,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 232: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 976,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 233: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #62",
      "amount": 1822,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 234: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1688,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 235: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 1617,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 236: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 493,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 237: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 104,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 238: Staff Meals (fuzzy)",
    "input": {
      "description": "Coffee Shop - Transaction #133",
      "amount": 1047,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 239: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #836",
      "amount": 36,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 240: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #934",
      "amount": 7834,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 241: Travel (exact)",
    "input": {
      "description": "Emirates",
      "amount": 1376,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 242: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 980,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 243: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 1113,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 244: Staff Meals (fuzzy)",
    "input": {
      "description": "Subway - Transaction #910",
      "amount": 570,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 245: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #66",
      "amount": 784,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 246: Office Supplies (ambiguous)",
    "input": {
      "description": "Off...",
      "amount": 1454,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 247: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 551,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 248: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 821,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 249: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 1006,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 250: Vendor Payments (exact)",
    "input": {
      "description": "Microsoft",
      "amount": 5330,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 251: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 201,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 252: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1522,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 253: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #606",
      "amount": 1617,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 254: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 329,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 255: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 1411,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 256: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #719",
      "amount": 244,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 257: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 271,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 258: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 1199,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 259: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 1884,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 260: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 9694,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 261: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 1242,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 262: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #602",
      "amount": 1248,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 263: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 1269,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 264: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 493,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 265: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 1219,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 266: Staff Meals (exact)",
    "input": {
      "description": "Local Diner",
      "amount": 718,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 267: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zesco - Transaction #1",
      "amount": 1747,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 268: Utilities (ambiguous)",
    "input": {
      "description": "Ele...",
      "amount": 1740,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 269: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 341,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 270: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 8343,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 271: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #1",
      "amount": 1013,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 272: Staff Meals (fuzzy)",
    "input": {
      "description": "Subway - Transaction #648",
      "amount": 1227,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 273: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #889",
      "amount": 1897,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 274: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 1352,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 275: Staff Meals (exact)",
    "input": {
      "description": "KFC",
      "amount": 1959,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 276: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #173",
      "amount": 367,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 277: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 1247,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 278: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #453",
      "amount": 1969,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 279: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #182",
      "amount": 1932,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 280: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 8806,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 281: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 981,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 282: Travel (exact)",
    "input": {
      "description": "Hilton",
      "amount": 1551,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 283: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #164",
      "amount": 1989,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 284: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ora...",
      "amount": 1817,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 285: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #503",
      "amount": 1302,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 286: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 1067,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 287: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 300,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 288: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #698",
      "amount": 1125,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 289: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 240,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 290: Utilities (fuzzy)",
    "input": {
      "description": "Waste Mgmt - Transaction #214",
      "amount": 6603,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 291: Vendor Payments (exact)",
    "input": {
      "description": "Amazon Web Services",
      "amount": 1696,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 292: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 360,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 293: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 450,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 294: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #15",
      "amount": 917,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 295: Staff Meals (fuzzy)",
    "input": {
      "description": "Subway - Transaction #213",
      "amount": 1744,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 296: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 1746,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 297: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 361,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 298: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 783,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 299: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 708,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 300: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 4408,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 301: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 172,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 302: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #252",
      "amount": 1476,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 303: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 409,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 304: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 1077,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 305: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #72",
      "amount": 1566,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 306: Staff Meals (fuzzy)",
    "input": {
      "description": "Local Diner - Transaction #69",
      "amount": 243,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 307: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1287,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 308: Vendor Payments (exact)",
    "input": {
      "description": "Oracle",
      "amount": 455,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 309: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #445",
      "amount": 1998,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 310: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ora...",
      "amount": 2309,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 311: Travel (exact)",
    "input": {
      "description": "Hilton",
      "amount": 911,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 312: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1467,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 313: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #698",
      "amount": 232,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 314: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zam...",
      "amount": 1400,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 315: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #436",
      "amount": 1402,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 316: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 1867,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 317: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #239",
      "amount": 1121,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 318: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 1293,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 319: Staff Meals (fuzzy)",
    "input": {
      "description": "Coffee Shop - Transaction #421",
      "amount": 1272,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 320: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 2579,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 321: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 1912,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 322: Utilities (fuzzy)",
    "input": {
      "description": "Waste Mgmt - Transaction #476",
      "amount": 1422,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 323: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zamtel - Transaction #563",
      "amount": 1999,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 324: Travel (ambiguous)",
    "input": {
      "description": "Emi...",
      "amount": 1640,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 325: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 1550,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 326: Utilities (fuzzy)",
    "input": {
      "description": "Electric Co - Transaction #948",
      "amount": 264,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 327: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 809,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 328: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1798,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 329: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 1055,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 330: Income (fuzzy)",
    "input": {
      "description": "Product Sale - Transaction #680",
      "amount": 5813,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 331: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1640,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 332: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 1920,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 333: Utilities (fuzzy)",
    "input": {
      "description": "Waste Mgmt - Transaction #99",
      "amount": 1820,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 334: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 900,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 335: Staff Meals (ambiguous)",
    "input": {
      "description": "Loc...",
      "amount": 465,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 336: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1022,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 337: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 946,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 338: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #987",
      "amount": 1901,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 339: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 36,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 340: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #961",
      "amount": 1401,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 341: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 348,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 342: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 78,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 343: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #71",
      "amount": 523,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 344: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 945,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 345: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zam...",
      "amount": 1633,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 346: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 1948,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 347: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 991,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 348: Vendor Payments (exact)",
    "input": {
      "description": "Zesco",
      "amount": 1588,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 349: Travel (exact)",
    "input": {
      "description": "Emirates",
      "amount": 814,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 350: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #804",
      "amount": 5401,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 351: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 1778,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 352: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1623,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 353: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #600",
      "amount": 1542,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 354: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 258,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 355: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #157",
      "amount": 932,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 356: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zamtel - Transaction #382",
      "amount": 90,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 357: Vendor Payments (ambiguous)",
    "input": {
      "description": "Mic...",
      "amount": 1200,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 358: Vendor Payments (exact)",
    "input": {
      "description": "Amazon Web Services",
      "amount": 378,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 359: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 644,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 360: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 13269,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 361: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 1277,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 362: Office Supplies (ambiguous)",
    "input": {
      "description": "Off...",
      "amount": 731,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 363: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #281",
      "amount": 938,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 364: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 1914,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 365: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 182,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 366: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 1079,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 367: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 847,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 368: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 130,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 369: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 320,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 370: Travel (fuzzy)",
    "input": {
      "description": "Yellow Cab - Transaction #999",
      "amount": 11409,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 371: Staff Meals (exact)",
    "input": {
      "description": "Local Diner",
      "amount": 1749,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 372: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 245,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 373: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 934,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 374: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #456",
      "amount": 121,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 375: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 20,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 376: Travel (fuzzy)",
    "input": {
      "description": "Hilton - Transaction #237",
      "amount": 1415,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 377: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 1130,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 378: Staff Meals (fuzzy)",
    "input": {
      "description": "Pizza Hut - Transaction #996",
      "amount": 1054,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 379: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 150,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 380: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 10016,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 381: Travel (ambiguous)",
    "input": {
      "description": "Emi...",
      "amount": 1637,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 382: Income (fuzzy)",
    "input": {
      "description": "Consulting Fee - Transaction #722",
      "amount": 295,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 383: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 1663,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 384: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 931,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 385: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #693",
      "amount": 566,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 386: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 610,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 387: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 1172,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 388: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 525,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 389: Utilities (ambiguous)",
    "input": {
      "description": "Ele...",
      "amount": 1696,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 390: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 12224,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 391: Staff Meals (fuzzy)",
    "input": {
      "description": "KFC - Transaction #185",
      "amount": 785,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 392: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 328,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 393: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 1867,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 394: Income (exact)",
    "input": {
      "description": "Consulting Fee",
      "amount": 268,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 395: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 212,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 396: Vendor Payments (exact)",
    "input": {
      "description": "Zamtel",
      "amount": 173,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 397: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 1882,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 398: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #834",
      "amount": 1646,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 399: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #909",
      "amount": 1376,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 400: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 5387,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 401: Income (ambiguous)",
    "input": {
      "description": "Pro...",
      "amount": 1875,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 402: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 990,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 403: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #391",
      "amount": 123,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 404: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zesco - Transaction #760",
      "amount": 1655,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 405: Vendor Payments (exact)",
    "input": {
      "description": "Amazon Web Services",
      "amount": 324,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 406: Travel (fuzzy)",
    "input": {
      "description": "Hilton - Transaction #211",
      "amount": 268,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 407: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 627,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 408: Staff Meals (fuzzy)",
    "input": {
      "description": "Pizza Hut - Transaction #896",
      "amount": 1583,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 409: Staff Meals (exact)",
    "input": {
      "description": "Coffee Shop",
      "amount": 1716,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 410: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 6173,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 411: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 1029,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 412: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #170",
      "amount": 908,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 413: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 520,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 414: Income (fuzzy)",
    "input": {
      "description": "Service Revenue - Transaction #720",
      "amount": 966,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 415: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 1648,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 416: Office Supplies (fuzzy)",
    "input": {
      "description": "Ink & Paper - Transaction #947",
      "amount": 1119,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 417: Staff Meals (exact)",
    "input": {
      "description": "Subway",
      "amount": 821,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 418: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zesco - Transaction #921",
      "amount": 1553,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 419: Vendor Payments (exact)",
    "input": {
      "description": "Zesco",
      "amount": 561,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 420: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 3336,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 421: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 1290,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 422: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 1771,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 423: Staff Meals (ambiguous)",
    "input": {
      "description": "KFC...",
      "amount": 1439,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 424: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #530",
      "amount": 175,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 425: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 1234,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 426: Income (ambiguous)",
    "input": {
      "description": "Con...",
      "amount": 520,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 427: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1626,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 428: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #356",
      "amount": 2007,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 429: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 544,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 430: Travel (exact)",
    "input": {
      "description": "Yellow Cab",
      "amount": 7063,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 431: Staff Meals (fuzzy)",
    "input": {
      "description": "Subway - Transaction #865",
      "amount": 1547,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 432: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #603",
      "amount": 216,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 433: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #461",
      "amount": 51,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 434: Vendor Payments (fuzzy)",
    "input": {
      "description": "Microsoft - Transaction #679",
      "amount": 78,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 435: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 410,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 436: Office Supplies (ambiguous)",
    "input": {
      "description": "Sta...",
      "amount": 1772,
      "department": "IT"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 437: Vendor Payments (fuzzy)",
    "input": {
      "description": "Oracle - Transaction #660",
      "amount": 241,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 438: Utilities (fuzzy)",
    "input": {
      "description": "Water Corp - Transaction #424",
      "amount": 970,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 439: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1668,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 440: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 14534,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 441: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1012,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 442: Utilities (exact)",
    "input": {
      "description": "Water Corp",
      "amount": 70,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 443: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 1430,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 444: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 727,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 445: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #80",
      "amount": 1103,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 446: Staff Meals (ambiguous)",
    "input": {
      "description": "Piz...",
      "amount": 187,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 447: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 28,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 448: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 1785,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 449: Office Supplies (exact)",
    "input": {
      "description": "Stationery World",
      "amount": 1591,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "MEMORY",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 450: Staff Meals (exact)",
    "input": {
      "description": "KFC",
      "amount": 451,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 451: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 761,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 452: Vendor Payments (exact)",
    "input": {
      "description": "Amazon Web Services",
      "amount": 391,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 453: Staff Meals (exact)",
    "input": {
      "description": "KFC",
      "amount": 762,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 454: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 417,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 455: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 1493,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 456: Office Supplies (exact)",
    "input": {
      "description": "Ink & Paper",
      "amount": 10,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 457: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 1023,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 458: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 1937,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 459: Utilities (ambiguous)",
    "input": {
      "description": "Wat...",
      "amount": 1558,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 460: Office Supplies (exact)",
    "input": {
      "description": "Office Depot",
      "amount": 2370,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Office Supplies",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 461: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 1399,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 462: Income (exact)",
    "input": {
      "description": "Service Revenue",
      "amount": 1669,
      "department": "IT"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 463: Staff Meals (fuzzy)",
    "input": {
      "description": "Subway - Transaction #978",
      "amount": 663,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 464: Travel (ambiguous)",
    "input": {
      "description": "Ube...",
      "amount": 270,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 465: Travel (fuzzy)",
    "input": {
      "description": "Emirates - Transaction #839",
      "amount": 30,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 466: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 167,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 467: Vendor Payments (ambiguous)",
    "input": {
      "description": "Ama...",
      "amount": 1601,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 468: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 1041,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 469: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 472,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 470: Staff Meals (fuzzy)",
    "input": {
      "description": "Pizza Hut - Transaction #227",
      "amount": 1247,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 471: Utilities (ambiguous)",
    "input": {
      "description": "Was...",
      "amount": 1194,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 472: Utilities (ambiguous)",
    "input": {
      "description": "Ele...",
      "amount": 1414,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Utilities",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 473: Travel (exact)",
    "input": {
      "description": "Hilton",
      "amount": 711,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 474: Staff Meals (ambiguous)",
    "input": {
      "description": "Loc...",
      "amount": 123,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 475: Utilities (exact)",
    "input": {
      "description": "Waste Mgmt",
      "amount": 117,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 476: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 116,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 477: Travel (exact)",
    "input": {
      "description": "Uber",
      "amount": 1275,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Travel",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 478: Staff Meals (fuzzy)",
    "input": {
      "description": "Pizza Hut - Transaction #342",
      "amount": 719,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 479: Office Supplies (ambiguous)",
    "input": {
      "description": "Ink...",
      "amount": 295,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 480: Income (exact)",
    "input": {
      "description": "Product Sale",
      "amount": 12908,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 481: Staff Meals (ambiguous)",
    "input": {
      "description": "Sub...",
      "amount": 1482,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 482: Travel (ambiguous)",
    "input": {
      "description": "Yel...",
      "amount": 1249,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 483: Staff Meals (fuzzy)",
    "input": {
      "description": "Pizza Hut - Transaction #194",
      "amount": 1208,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 484: Travel (ambiguous)",
    "input": {
      "description": "Hil...",
      "amount": 436,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Travel",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 485: Staff Meals (exact)",
    "input": {
      "description": "Pizza Hut",
      "amount": 245,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 486: Staff Meals (fuzzy)",
    "input": {
      "description": "Local Diner - Transaction #44",
      "amount": 43,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "HARD"
    }
  },
  {
    "name": "Generated Scen 487: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 200,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 488: Staff Meals (exact)",
    "input": {
      "description": "Subway",
      "amount": 1051,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Staff Meals",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 489: Utilities (exact)",
    "input": {
      "description": "Electric Co",
      "amount": 489,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Utilities",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 490: Vendor Payments (exact)",
    "input": {
      "description": "Zesco",
      "amount": 9277,
      "department": "HR"
    },
    "expected": {
      "decision_path": "MEMORY",
      "risk_level": "HIGH",
      "requires_review": true,
      "min_confidence": 0.92,
      "should_learn": false
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "MEMORY",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 491: Staff Meals (ambiguous)",
    "input": {
      "description": "Cof...",
      "amount": 27,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Staff Meals",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 492: Vendor Payments (fuzzy)",
    "input": {
      "description": "Zesco - Transaction #838",
      "amount": 41,
      "department": "HR"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 493: Vendor Payments (ambiguous)",
    "input": {
      "description": "Zes...",
      "amount": 154,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 494: Vendor Payments (fuzzy)",
    "input": {
      "description": "Amazon Web Services - Transaction #743",
      "amount": 706,
      "department": "FINANCE"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": true,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 495: Office Supplies (fuzzy)",
    "input": {
      "description": "Office Depot - Transaction #292",
      "amount": 828,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 496: Income (ambiguous)",
    "input": {
      "description": "Ser...",
      "amount": 1671,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "RULE",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.9,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Income",
      "source": "RULE",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 497: Office Supplies (fuzzy)",
    "input": {
      "description": "Stationery World - Transaction #862",
      "amount": 775,
      "department": "IT"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "fuzzy",
      "category_expected": "Office Supplies",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 498: Vendor Payments (ambiguous)",
    "input": {
      "description": "Mic...",
      "amount": 1686,
      "department": "SALES"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "MEDIUM",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": false
    },
    "metadata": {
      "type": "ambiguous",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  },
  {
    "name": "Generated Scen 499: Vendor Payments (exact)",
    "input": {
      "description": "Zesco",
      "amount": 641,
      "department": "HR"
    },
    "expected": {
      "decision_path": "AI",
      "risk_level": "LOW",
      "requires_review": false,
      "min_confidence": 0.7,
      "should_learn": true
    },
    "metadata": {
      "type": "exact",
      "category_expected": "Vendor Payments",
      "source": "AI",
      "conflict": "NONE"
    }
  }
];
