/**
 * Auto-Suggestions for Common Scenarios
 * Provides smart defaults and templates
 */

export type Scenario = {
  id: string;
  name: string;
  description: string;
  goal: string;
  constraints: string;
  targetData: string;
  icon: string;
  category: 'ecommerce' | 'social' | 'auth' | 'data' | 'cms' | 'saas';
  keywords: string[];
};

export const COMMON_SCENARIOS: Scenario[] = [
  // E-Commerce
  {
    id: 'ecom-products',
    name: 'Fetch Product Catalog',
    description: 'Get all products with prices, stock, and details',
    goal: 'Get all products with pricing and inventory data',
    constraints: 'May require authentication, handle pagination',
    targetData: 'Array of { id, name, price, stock, category, image_url }',
    icon: '🛍️',
    category: 'ecommerce',
    keywords: ['product', 'catalog', 'listing', 'inventory', 'price', 'shop'],
  },
  {
    id: 'ecom-orders',
    name: 'Fetch Customer Orders',
    description: 'Get order history with details',
    goal: 'Get all orders with customer and payment information',
    constraints: 'Requires authentication, may be paginated',
    targetData: 'Array of { order_id, customer, items, total, status, date }',
    icon: '📦',
    category: 'ecommerce',
    keywords: ['order', 'purchase', 'transaction', 'checkout', 'cart'],
  },
  {
    id: 'ecom-search',
    name: 'Product Search',
    description: 'Search products by keyword or filter',
    goal: 'Search products by keyword and filter by category/price',
    constraints: 'Must handle filters, sorting, and pagination',
    targetData: 'Array of { id, name, price, relevance_score }',
    icon: '🔍',
    category: 'ecommerce',
    keywords: ['search', 'filter', 'query', 'find'],
  },
  
  // Social Media
  {
    id: 'social-posts',
    name: 'Fetch User Posts',
    description: 'Get posts/tweets from a user profile',
    goal: 'Get all posts from a specific user with engagement data',
    constraints: 'Requires authentication, rate limited, paginated',
    targetData: 'Array of { post_id, content, likes, comments, date }',
    icon: '📱',
    category: 'social',
    keywords: ['post', 'tweet', 'social', 'content', 'feed'],
  },
  {
    id: 'social-profile',
    name: 'Get User Profile',
    description: 'Fetch user profile information',
    goal: 'Get user profile with followers, bio, and stats',
    constraints: 'May require authentication',
    targetData: '{ user_id, username, bio, followers, following, posts_count }',
    icon: '👤',
    category: 'social',
    keywords: ['profile', 'user', 'account', 'bio'],
  },
  
  // Authentication
  {
    id: 'auth-login',
    name: 'User Login Flow',
    description: 'Authenticate user and get access token',
    goal: 'Login with credentials and obtain authentication token',
    constraints: 'Must handle token expiry and refresh',
    targetData: '{ access_token, refresh_token, expires_in, user_id }',
    icon: '🔐',
    category: 'auth',
    keywords: ['login', 'auth', 'authenticate', 'signin', 'token'],
  },
  {
    id: 'auth-oauth',
    name: 'OAuth 2.0 Flow',
    description: 'Complete OAuth authentication flow',
    goal: 'Complete OAuth flow and obtain access token',
    constraints: 'Must handle redirect, code exchange, token refresh',
    targetData: '{ access_token, refresh_token, scope, expires_in }',
    icon: '🔑',
    category: 'auth',
    keywords: ['oauth', 'authorize', 'code', 'redirect'],
  },
  
  // Data APIs
  {
    id: 'data-list-all',
    name: 'List All Records',
    description: 'Fetch all records with pagination',
    goal: 'Get all records from a resource with automatic pagination',
    constraints: 'Must handle pagination, potentially large dataset',
    targetData: 'Array of { id, ...fields }',
    icon: '📊',
    category: 'data',
    keywords: ['list', 'all', 'records', 'data', 'fetch'],
  },
  {
    id: 'data-search-filter',
    name: 'Search with Filters',
    description: 'Query data with complex filters',
    goal: 'Search records with multiple filter criteria',
    constraints: 'Must handle query parameters, filters, sorting',
    targetData: 'Array of { id, ...filtered_fields }',
    icon: '🎯',
    category: 'data',
    keywords: ['search', 'filter', 'query', 'where'],
  },
  
  // CMS
  {
    id: 'cms-articles',
    name: 'Fetch Articles/Blog Posts',
    description: 'Get published articles with metadata',
    goal: 'Get all published articles with author and content',
    constraints: 'May require authentication, paginated',
    targetData: 'Array of { id, title, content, author, published_date, tags }',
    icon: '📝',
    category: 'cms',
    keywords: ['article', 'blog', 'post', 'content', 'cms'],
  },
  
  // SaaS
  {
    id: 'saas-analytics',
    name: 'Fetch Analytics Data',
    description: 'Get analytics metrics and reports',
    goal: 'Get analytics data for a specific time period',
    constraints: 'Requires authentication, date range filters',
    targetData: 'Array of { date, metric_name, value, change_percent }',
    icon: '📈',
    category: 'saas',
    keywords: ['analytics', 'metrics', 'stats', 'report'],
  },
];

/**
 * Find matching scenarios based on user input
 */
export function findMatchingScenarios(
  goal: string,
  targetData: string,
  limit = 3
): Scenario[] {
  const combined = `${goal} ${targetData}`.toLowerCase();
  const scored = COMMON_SCENARIOS.map(scenario => {
    let score = 0;
    
    // Check keyword matches
    for (const keyword of scenario.keywords) {
      if (combined.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }
    
    // Check name match
    if (combined.includes(scenario.name.toLowerCase())) {
      score += 5;
    }
    
    // Check description match
    const descWords = scenario.description.toLowerCase().split(' ');
    for (const word of descWords) {
      if (combined.includes(word)) {
        score += 0.5;
      }
    }
    
    return { scenario, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.scenario);
}

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: Scenario['category']): Scenario[] {
  return COMMON_SCENARIOS.filter(s => s.category === category);
}

/**
 * Get all categories
 */
export function getAllCategories(): Array<{ id: Scenario['category']; name: string; icon: string }> {
  return [
    { id: 'ecommerce', name: 'E-Commerce', icon: '🛍️' },
    { id: 'social', name: 'Social Media', icon: '📱' },
    { id: 'auth', name: 'Authentication', icon: '🔐' },
    { id: 'data', name: 'Data APIs', icon: '📊' },
    { id: 'cms', name: 'CMS', icon: '📝' },
    { id: 'saas', name: 'SaaS', icon: '📈' },
  ];
}

/**
 * Generate smart defaults based on partial input
 */
export function generateSmartDefaults(partialGoal: string): {
  suggestedGoal?: string;
  suggestedConstraints?: string;
  suggestedTarget?: string;
} {
  const goalLower = partialGoal.toLowerCase();
  
  // Detect intent and suggest completion
  if (goalLower.includes('get') && goalLower.includes('product')) {
    return {
      suggestedGoal: 'Get all products with pricing and inventory data',
      suggestedConstraints: 'May require authentication, handle pagination',
      suggestedTarget: 'Array of { id, name, price, stock, category }',
    };
  }
  
  if (goalLower.includes('login') || goalLower.includes('auth')) {
    return {
      suggestedGoal: 'Login with credentials and obtain authentication token',
      suggestedConstraints: 'Must handle token expiry and refresh',
      suggestedTarget: '{ access_token, refresh_token, expires_in }',
    };
  }
  
  if (goalLower.includes('user') && (goalLower.includes('get') || goalLower.includes('fetch'))) {
    return {
      suggestedGoal: 'Get user profile information',
      suggestedConstraints: 'May require authentication',
      suggestedTarget: '{ user_id, username, email, profile_data }',
    };
  }
  
  if (goalLower.includes('search')) {
    return {
      suggestedGoal: 'Search records with filters and sorting',
      suggestedConstraints: 'Handle query parameters and pagination',
      suggestedTarget: 'Array of { id, ...relevant_fields }',
    };
  }
  
  return {};
}

/**
 * Provide contextual hints based on current state
 */
export function getContextualHints(state: {
  hasGoal: boolean;
  hasConstraints: boolean;
  hasTarget: boolean;
  hasEndpoints: boolean;
  lockedStepsCount: number;
}): string[] {
  const hints: string[] = [];
  
  if (!state.hasGoal) {
    hints.push('💡 Start by defining your goal. What data do you want to extract?');
    hints.push('💡 Try a template: Click a scenario below to auto-fill');
  } else if (!state.hasTarget) {
    hints.push('💡 Define your target data structure for accurate validation');
    hints.push('💡 Example: { id, name, price } or Array of { ... }');
  } else if (!state.hasEndpoints) {
    hints.push('💡 Launch the browser and interact with the site to capture API traffic');
    hints.push('💡 Login, browse pages, click buttons - all network requests are recorded');
  } else if (state.hasEndpoints && state.lockedStepsCount === 0) {
    hints.push('💡 Activate AI Agent to get intelligent step suggestions');
    hints.push('💡 Or manually select an endpoint below to start testing');
  } else if (state.lockedStepsCount > 0 && state.lockedStepsCount < 3) {
    hints.push('💡 Great progress! Lock more steps to build your complete workflow');
    hints.push('💡 AI will suggest the next logical step based on locked steps');
  } else if (state.lockedStepsCount >= 3) {
    hints.push('💡 Workflow looking good! Consider exporting to generate executable code');
  }
  
  return hints;
}
