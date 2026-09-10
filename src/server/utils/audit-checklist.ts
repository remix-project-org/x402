import auditChecklistData from '../data/audit-checklist.json' with { type: 'json' };

/**
 * Structure of an audit checklist item
 */
export interface AuditChecklistItem {
  id: string;
  question: string;
  description: string;
  remediation: string;
  references: string[];
  tags: string[];
}

/**
 * Structure of a category in the checklist
 */
export interface AuditCategory {
  category: string;
  description: string;
  data: (AuditChecklistItem | AuditCategory)[];
}

/**
 * Flattened category for AI prompt
 */
export interface FlattenedCategory {
  path: string;
  itemCount: number;
  description: string;
  items: AuditChecklistItem[];
}

/**
 * AI match result
 */
export interface AuditMatch {
  path: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Load and parse the audit checklist JSON file
 */
export function loadAuditChecklist(): AuditCategory[] {
  return auditChecklistData as AuditCategory[];
}

/**
 * Flatten the hierarchical checklist into a list of category paths
 * Format: "Parent::Child (N items): Description"
 */
export function flattenCategoriesForPrompt(categories: AuditCategory[], parentPath: string = ''): FlattenedCategory[] {
  const flattened: FlattenedCategory[] = [];

  for (const category of categories) {
    const currentPath = parentPath ? `${parentPath}::${category.category}` : category.category;

    // Count items in this category (leaf items only)
    const items: AuditChecklistItem[] = [];
    const subCategories: AuditCategory[] = [];

    for (const item of category.data) {
      if ('id' in item) {
        items.push(item as AuditChecklistItem);
      } else {
        subCategories.push(item as AuditCategory);
      }
    }

    // If this category has items, add it to the list
    if (items.length > 0) {
      flattened.push({
        path: currentPath,
        itemCount: items.length,
        description: category.description,
        items: items
      });
    }

    // Recursively flatten sub-categories
    if (subCategories.length > 0) {
      flattened.push(...flattenCategoriesForPrompt(subCategories, currentPath));
    }
  }

  return flattened;
}

/**
 * Generate the category list string for the AI prompt
 */
export function generateCategoryListPrompt(flattenedCategories: FlattenedCategory[]): string {
  return flattenedCategories
    .map(cat => `- ${cat.path} (${cat.itemCount} items): ${cat.description}`)
    .join('\n');
}

/**
 * Strip a Solidity contract to its skeleton (declarations only, no function bodies)
 */
export function stripToSkeleton(sourceCode: string): string {
  const lines = sourceCode.split('\n');
  const skeletonLines: string[] = [];

  let inMultiLineComment = false;
  let inFunctionBody = false;
  let braceDepth = 0;
  let collectedFunctionSignature: string[] = [];

  // Sections to track
  let inPragma = false;
  let inImport = false;
  let inContract = false;
  let inStateVars = false;
  let inEvents = false;
  let inModifiers = false;
  let inFunctions = false;

  // Section markers
  const sections = {
    pragma: '// === PRAGMA ===',
    imports: '// === IMPORTS ===',
    contract: '// === CONTRACT DECLARATION & INHERITANCE ===',
    stateVars: '// === STATE VARIABLES ===',
    events: '// === EVENTS ===',
    modifiers: '// === MODIFIERS ===',
    functions: '// === FUNCTION SIGNATURES ==='
  };

  for (let line of lines) {
    const trimmedLine = line.trim();

    // Handle multi-line comments
    if (trimmedLine.startsWith('/*')) {
      inMultiLineComment = true;
    }
    if (inMultiLineComment) {
      if (trimmedLine.endsWith('*/')) {
        inMultiLineComment = false;
      }
      continue;
    }

    // Skip single-line comments (but keep SPDX)
    if (trimmedLine.startsWith('//') && !trimmedLine.includes('SPDX')) {
      continue;
    }

    // Skip empty lines temporarily (we'll add them back for sections)
    if (trimmedLine === '') {
      continue;
    }

    // Pragma directives
    if (trimmedLine.startsWith('pragma ')) {
      if (!inPragma) {
        skeletonLines.push(sections.pragma);
        inPragma = true;
      }
      skeletonLines.push(line);
      continue;
    }

    // Import statements
    if (trimmedLine.startsWith('import ')) {
      if (inPragma) {
        skeletonLines.push('');
        inPragma = false;
      }
      if (!inImport) {
        skeletonLines.push(sections.imports);
        inImport = true;
      }
      skeletonLines.push(line);
      continue;
    }

    // Contract/interface/library declaration
    if (trimmedLine.match(/^(contract|interface|library|abstract contract)\s+\w+/)) {
      if (inImport) {
        skeletonLines.push('');
        inImport = false;
      }
      if (!inContract) {
        skeletonLines.push(sections.contract);
        inContract = true;
      }
      skeletonLines.push(line);
      inStateVars = false;
      inEvents = false;
      inModifiers = false;
      inFunctions = false;
      continue;
    }

    // Inside contract body
    if (inContract) {
      // State variables
      if (trimmedLine.match(/^(uint|int|bool|address|string|bytes|mapping|.*\[\])\s+/) ||
          trimmedLine.match(/^(public|private|internal|constant|immutable)\s+/)) {
        if (!inStateVars) {
          if (inContract && !inStateVars && !inEvents && !inModifiers && !inFunctions) {
            skeletonLines.push('');
          }
          skeletonLines.push(sections.stateVars);
          inStateVars = true;
        }
        skeletonLines.push(line);
        continue;
      }

      // Events
      if (trimmedLine.startsWith('event ')) {
        if (!inEvents) {
          skeletonLines.push('');
          skeletonLines.push(sections.events);
          inEvents = true;
        }
        skeletonLines.push(line);
        continue;
      }

      // Modifiers
      if (trimmedLine.startsWith('modifier ')) {
        if (!inModifiers) {
          skeletonLines.push('');
          skeletonLines.push(sections.modifiers);
          inModifiers = true;
        }
        // Collect modifier signature until we hit the opening brace
        if (trimmedLine.includes('{')) {
          const signaturePart = trimmedLine.substring(0, trimmedLine.indexOf('{')).trim();
          skeletonLines.push(line.substring(0, line.indexOf('{')));
          inFunctionBody = true;
          braceDepth = 1;
        } else {
          collectedFunctionSignature.push(line);
        }
        continue;
      }

      // Functions
      if (trimmedLine.startsWith('function ') || trimmedLine.startsWith('constructor ')) {
        if (!inFunctions) {
          skeletonLines.push('');
          skeletonLines.push(sections.functions);
          inFunctions = true;
        }

        // Check if this is a single-line function signature with opening brace
        if (trimmedLine.includes('{')) {
          const signaturePart = trimmedLine.substring(0, trimmedLine.indexOf('{')).trim();
          skeletonLines.push(line.substring(0, line.indexOf('{')));
          inFunctionBody = true;
          braceDepth = 1;
        } else if (trimmedLine.endsWith(';')) {
          // Abstract/interface function (no body)
          skeletonLines.push(line);
        } else {
          // Multi-line function signature
          collectedFunctionSignature.push(line);
        }
        continue;
      }

      // Handle multi-line function signatures
      if (collectedFunctionSignature.length > 0 && !inFunctionBody) {
        if (trimmedLine.includes('{')) {
          collectedFunctionSignature.push(line.substring(0, line.indexOf('{')));
          skeletonLines.push(...collectedFunctionSignature);
          collectedFunctionSignature = [];
          inFunctionBody = true;
          braceDepth = 1;
        } else if (trimmedLine.endsWith(';')) {
          collectedFunctionSignature.push(line);
          skeletonLines.push(...collectedFunctionSignature);
          collectedFunctionSignature = [];
        } else {
          collectedFunctionSignature.push(line);
        }
        continue;
      }

      // Skip function/modifier bodies
      if (inFunctionBody) {
        // Count braces to track nested blocks
        for (const char of line) {
          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;
        }
        if (braceDepth === 0) {
          inFunctionBody = false;
        }
        continue;
      }

      // Keep closing braces for contract/interface/library
      if (trimmedLine === '}') {
        skeletonLines.push(line);
        continue;
      }
    }
  }

  return skeletonLines.join('\n');
}

/**
 * Find checklist items by category path
 */
export function findItemsByPath(flattenedCategories: FlattenedCategory[], path: string): AuditChecklistItem[] {
  const category = flattenedCategories.find(cat => cat.path === path);
  return category ? category.items : [];
}

/**
 * Format matched audit items as Markdown
 */
export function formatAuditReportMarkdown(
  matches: AuditMatch[],
  flattenedCategories: FlattenedCategory[],
  contractName: string
): string {
  const lines: string[] = [];

  lines.push(`# Security Audit Checklist Report`);
  lines.push(`\n**Contract**: ${contractName}`);
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push(`**Matched Categories**: ${matches.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (matches.length === 0) {
    lines.push('No relevant audit categories were identified for this contract.');
    return lines.join('\n');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('The following audit categories were identified as relevant for this contract:');
  lines.push('');

  for (const match of matches) {
    const confidenceEmoji = match.confidence === 'high' ? '🔴' : match.confidence === 'medium' ? '🟡' : '🟢';
    lines.push(`- **${match.path}** ${confidenceEmoji} \`${match.confidence}\``);
    lines.push(`  - ${match.reason}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Detailed checklist for each matched category
  lines.push('## Detailed Audit Checklist');
  lines.push('');

  for (const match of matches) {
    const items = findItemsByPath(flattenedCategories, match.path);
    const category = flattenedCategories.find(cat => cat.path === match.path);

    if (!category || items.length === 0) continue;

    lines.push(`### ${match.path}`);
    lines.push('');
    lines.push(`**Confidence**: ${match.confidence.toUpperCase()}`);
    lines.push(`**Reason**: ${match.reason}`);
    lines.push(`**Description**: ${category.description}`);
    lines.push('');
    lines.push('#### Checklist Items');
    lines.push('');

    for (const item of items) {
      lines.push(`#### ${item.id}`);
      lines.push('');
      lines.push(`**Question**: ${item.question}`);
      lines.push('');
      lines.push(`**Description**: ${item.description}`);
      lines.push('');
      lines.push(`**Remediation**: ${item.remediation}`);
      lines.push('');

      if (item.references.length > 0) {
        lines.push(`**References**:`);
        for (const ref of item.references) {
          lines.push(`- ${ref}`);
        }
        lines.push('');
      }

      if (item.tags.length > 0) {
        lines.push(`**Tags**: ${item.tags.join(', ')}`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by x402 Audit Checklist Service powered by OpenRouter*');

  return lines.join('\n');
}
