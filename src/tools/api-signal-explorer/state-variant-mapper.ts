/**
 * State Variant Mapper - Handles state-dependent form variations
 * 
 * @module state-variant-mapper
 * @description Detects and maps form structure differences across states/regions.
 * Essential for multi-state quote builders where form options vary by location.
 * 
 * @example
 * ```typescript
 * // Test Colorado vs California
 * const variants = await detectStateVariants([
 *   { state: 'CO', zipcode: '80202' },
 *   { state: 'CA', zipcode: '90210' }
 * ]);
 * 
 * // Result: { CO: { plans: ['A', 'B', 'C'] }, CA: { plans: ['X', 'Y', 'Z'] } }
 * ```
 */

import type { DOMSnapshot, FormElement } from './form-correlator';

/**
 * Represents a test case for a specific state/zipcode
 */
export type StateTestCase = {
  state: string;              // e.g., "CO", "CA", "TX"
  zipcode: string;             // e.g., "80202", "90210"
  description?: string;        // e.g., "Colorado - Denver"
};

/**
 * Form structure for a specific state
 */
export type StateFormStructure = {
  state: string;
  zipcode: string;
  dropdowns: Array<{
    id: string;
    name: string;
    options: Array<{ value: string; text: string }>;
    xpath: string;
  }>;
  buttons: Array<{
    id: string;
    text: string;
    xpath: string;
  }>;
  hiddenFields: Record<string, string>;
  uniqueIdentifier: string;    // Hash of structure for comparison
};

/**
 * Detected variation between states
 */
export type StateVariation = {
  field: string;               // Field that varies (e.g., "planDropdown")
  type: 'dropdown_options' | 'field_presence' | 'button_text';
  states: Record<string, any>; // State → Value map
  impact: 'critical' | 'medium' | 'low';
};

/**
 * Complete state variant map
 */
export type StateVariantMap = {
  testedStates: string[];
  totalVariations: number;
  variations: StateVariation[];
  stateStructures: Record<string, StateFormStructure>;
  commonFields: string[];      // Fields present in all states
  stateSpecificFields: Record<string, string[]>; // State → unique fields
  adaptationStrategy: 'parameterized' | 'conditional' | 'separate_workflows';
};

/**
 * Extract form structure from a DOM snapshot
 * 
 * @param snapshot - DOM snapshot to analyze
 * @param state - State identifier (e.g., "CO")
 * @param zipcode - Zipcode used for this test
 * @returns Structured form data for this state
 */
export function extractStateFormStructure(
  snapshot: DOMSnapshot,
  state: string,
  zipcode: string
): StateFormStructure {
  const dropdowns: StateFormStructure['dropdowns'] = [];
  const buttons: StateFormStructure['buttons'] = [];
  const hiddenFields: Record<string, string> = {};

  // Extract dropdowns (select elements)
  if (snapshot.interactions) {
    snapshot.interactions.forEach(element => {
      if (element.type === 'select') {
        // In real implementation, this would parse the actual <option> tags
        // For now, we'll structure it to accept options from DOM
        dropdowns.push({
          id: element.id || element.name || 'unknown',
          name: element.name || '',
          options: [], // Would be populated from actual DOM parsing
          xpath: element.xpath || ''
        });
      } else if (element.type === 'button' || element.type === 'submit') {
        buttons.push({
          id: element.id || 'unknown',
          text: element.text || element.value || '',
          xpath: element.xpath || ''
        });
      }
    });
  }

  // Extract hidden fields from form state
  if (snapshot.formState) {
    Object.entries(snapshot.formState.customFields).forEach(([key, value]) => {
      hiddenFields[key] = value;
    });
  }

  // Generate unique identifier (hash of structure)
  const structureHash = generateStructureHash({
    dropdowns: dropdowns.map(d => `${d.id}:${d.options.length}`),
    buttons: buttons.map(b => b.id),
    hiddenFields: Object.keys(hiddenFields)
  });

  return {
    state,
    zipcode,
    dropdowns,
    buttons,
    hiddenFields,
    uniqueIdentifier: structureHash
  };
}

/**
 * Generate a hash representing the form structure
 * Used to quickly identify if two forms have the same structure
 */
function generateStructureHash(structure: any): string {
  const str = JSON.stringify(structure);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Compare two state form structures and detect variations
 * 
 * @param structure1 - First state's form structure
 * @param structure2 - Second state's form structure
 * @returns Array of detected variations
 */
export function compareStateStructures(
  structure1: StateFormStructure,
  structure2: StateFormStructure
): StateVariation[] {
  const variations: StateVariation[] = [];

  // Compare dropdown options
  structure1.dropdowns.forEach(dropdown1 => {
    const dropdown2 = structure2.dropdowns.find(d => d.id === dropdown1.id || d.name === dropdown1.name);
    
    if (!dropdown2) {
      // Dropdown exists in state1 but not state2
      variations.push({
        field: dropdown1.id,
        type: 'field_presence',
        states: {
          [structure1.state]: 'present',
          [structure2.state]: 'absent'
        },
        impact: 'critical'
      });
    } else {
      // Compare options
      const options1 = dropdown1.options.map(o => o.value).sort();
      const options2 = dropdown2.options.map(o => o.value).sort();
      
      if (JSON.stringify(options1) !== JSON.stringify(options2)) {
        variations.push({
          field: dropdown1.id,
          type: 'dropdown_options',
          states: {
            [structure1.state]: dropdown1.options,
            [structure2.state]: dropdown2.options
          },
          impact: 'critical'
        });
      }
    }
  });

  // Check for dropdowns in state2 not in state1
  structure2.dropdowns.forEach(dropdown2 => {
    const dropdown1 = structure1.dropdowns.find(d => d.id === dropdown2.id || d.name === dropdown2.name);
    if (!dropdown1) {
      variations.push({
        field: dropdown2.id,
        type: 'field_presence',
        states: {
          [structure1.state]: 'absent',
          [structure2.state]: 'present'
        },
        impact: 'critical'
      });
    }
  });

  // Compare buttons
  structure1.buttons.forEach(button1 => {
    const button2 = structure2.buttons.find(b => b.id === button1.id);
    if (!button2) {
      variations.push({
        field: button1.id,
        type: 'field_presence',
        states: {
          [structure1.state]: button1.text,
          [structure2.state]: 'absent'
        },
        impact: 'medium'
      });
    } else if (button1.text !== button2.text) {
      variations.push({
        field: button1.id,
        type: 'button_text',
        states: {
          [structure1.state]: button1.text,
          [structure2.state]: button2.text
        },
        impact: 'low'
      });
    }
  });

  return variations;
}

/**
 * Build a complete state variant map from multiple snapshots
 * 
 * @param snapshots - Array of DOM snapshots (one per state tested)
 * @param testCases - Corresponding test cases for each snapshot
 * @returns Complete state variant map with all variations
 * 
 * @example
 * ```typescript
 * const variantMap = buildStateVariantMap(
 *   [coSnapshot, caSnapshot, txSnapshot],
 *   [
 *     { state: 'CO', zipcode: '80202' },
 *     { state: 'CA', zipcode: '90210' },
 *     { state: 'TX', zipcode: '75001' }
 *   ]
 * );
 * 
 * console.log(`Found ${variantMap.totalVariations} variations across ${variantMap.testedStates.length} states`);
 * ```
 */
export function buildStateVariantMap(
  snapshots: DOMSnapshot[],
  testCases: StateTestCase[]
): StateVariantMap {
  // Extract structure for each state
  const stateStructures: Record<string, StateFormStructure> = {};
  snapshots.forEach((snapshot, index) => {
    const testCase = testCases[index];
    stateStructures[testCase.state] = extractStateFormStructure(
      snapshot,
      testCase.state,
      testCase.zipcode
    );
  });

  // Find all variations
  const allVariations: StateVariation[] = [];
  const states = Object.keys(stateStructures);

  // Compare each pair of states
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const variations = compareStateStructures(
        stateStructures[states[i]],
        stateStructures[states[j]]
      );
      
      // Merge variations (avoid duplicates)
      variations.forEach(variation => {
        const existing = allVariations.find(v => v.field === variation.field && v.type === variation.type);
        if (existing) {
          // Merge state data
          Object.assign(existing.states, variation.states);
        } else {
          allVariations.push(variation);
        }
      });
    }
  }

  // Find common fields (present in all states)
  const commonFields: string[] = [];
  if (states.length > 0) {
    const firstState = stateStructures[states[0]];
    firstState.dropdowns.forEach(dropdown => {
      const presentInAll = states.every(state => 
        stateStructures[state].dropdowns.some(d => d.id === dropdown.id || d.name === dropdown.name)
      );
      if (presentInAll) {
        commonFields.push(dropdown.id);
      }
    });
  }

  // Find state-specific fields
  const stateSpecificFields: Record<string, string[]> = {};
  states.forEach(state => {
    const structure = stateStructures[state];
    const specificFields = structure.dropdowns
      .filter(dropdown => !commonFields.includes(dropdown.id))
      .map(dropdown => dropdown.id);
    if (specificFields.length > 0) {
      stateSpecificFields[state] = specificFields;
    }
  });

  // Determine adaptation strategy
  let adaptationStrategy: StateVariantMap['adaptationStrategy'];
  const criticalVariations = allVariations.filter(v => v.impact === 'critical').length;
  
  if (criticalVariations === 0) {
    adaptationStrategy = 'parameterized'; // Simple: just pass different params
  } else if (criticalVariations < 5) {
    adaptationStrategy = 'conditional'; // Medium: use if/else logic
  } else {
    adaptationStrategy = 'separate_workflows'; // Complex: need separate workflows per state
  }

  return {
    testedStates: states,
    totalVariations: allVariations.length,
    variations: allVariations,
    stateStructures,
    commonFields,
    stateSpecificFields,
    adaptationStrategy
  };
}

/**
 * Generate a parameterized workflow that adapts to different states
 * 
 * @param variantMap - State variant map from buildStateVariantMap()
 * @returns Workflow template with conditional logic
 * 
 * @example
 * ```typescript
 * const workflow = generateAdaptiveWorkflow(variantMap);
 * 
 * // Result:
 * // {
 * //   steps: [
 * //     {
 * //       action: "select_plan",
 * //       selector: "[name='planDropdown']",
 * //       value: {
 * //         CO: "Plan A",
 * //         CA: "Plan X",
 * //         TX: "Plan Y"
 * //       }
 * //     }
 * //   ]
 * // }
 * ```
 */
export function generateAdaptiveWorkflow(variantMap: StateVariantMap): {
  strategy: string;
  steps: Array<{
    action: string;
    selector: string;
    conditionalValues?: Record<string, any>;
    staticValue?: any;
  }>;
  metadata: {
    requiresStateParameter: boolean;
    supportedStates: string[];
    criticalVariations: number;
  };
} {
  const steps: any[] = [];

  // Group variations by field
  const fieldVariations = new Map<string, StateVariation>();
  variantMap.variations.forEach(v => {
    if (!fieldVariations.has(v.field)) {
      fieldVariations.set(v.field, v);
    }
  });

  // Generate steps for each common field
  variantMap.commonFields.forEach(fieldId => {
    const variation = fieldVariations.get(fieldId);
    
    if (variation && variation.type === 'dropdown_options') {
      // Field exists in all states but has different options
      steps.push({
        action: `select_${fieldId}`,
        selector: `[id='${fieldId}']`,
        conditionalValues: variation.states,
        note: 'Options vary by state - use state parameter to select correct option'
      });
    } else {
      // Field is common and consistent
      steps.push({
        action: `interact_${fieldId}`,
        selector: `[id='${fieldId}']`,
        staticValue: 'consistent across states'
      });
    }
  });

  // Add state-specific fields
  Object.entries(variantMap.stateSpecificFields).forEach(([state, fields]) => {
    fields.forEach(fieldId => {
      steps.push({
        action: `select_${fieldId}`,
        selector: `[id='${fieldId}']`,
        conditionalValues: {
          [state]: 'available',
          _others: 'not present - skip this step'
        },
        note: `Only available in state: ${state}`
      });
    });
  });

  const criticalVariations = variantMap.variations.filter(v => v.impact === 'critical').length;

  return {
    strategy: variantMap.adaptationStrategy,
    steps,
    metadata: {
      requiresStateParameter: variantMap.totalVariations > 0,
      supportedStates: variantMap.testedStates,
      criticalVariations
    }
  };
}

/**
 * Validate that a workflow works for a specific state
 * Tests if all required fields for that state are present in the workflow
 * 
 * @param workflow - Generated adaptive workflow
 * @param state - State to validate (e.g., "CO")
 * @param variantMap - State variant map
 * @returns Validation result with missing fields
 */
export function validateWorkflowForState(
  workflow: ReturnType<typeof generateAdaptiveWorkflow>,
  state: string,
  variantMap: StateVariantMap
): {
  valid: boolean;
  missingFields: string[];
  extraFields: string[];
  coverage: number; // 0-1
} {
  const stateStructure = variantMap.stateStructures[state];
  if (!stateStructure) {
    return {
      valid: false,
      missingFields: [],
      extraFields: [],
      coverage: 0
    };
  }

  const requiredFields = [
    ...stateStructure.dropdowns.map(d => d.id),
    ...stateStructure.buttons.map(b => b.id)
  ];

  const workflowFields = workflow.steps
    .filter(step => !step.conditionalValues || state in step.conditionalValues)
    .map(step => step.selector.match(/\[id='(.+?)'\]/)?.[1] || '');

  const missingFields = requiredFields.filter(f => !workflowFields.includes(f));
  const extraFields = workflowFields.filter(f => f && !requiredFields.includes(f));

  const coverage = requiredFields.length > 0 
    ? (requiredFields.length - missingFields.length) / requiredFields.length
    : 1;

  return {
    valid: missingFields.length === 0,
    missingFields,
    extraFields,
    coverage
  };
}
