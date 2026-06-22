/**
 * Fix TypeScript typecheck errors across the codebase:
 * 1. Remove `Link` from lucide-react imports where react-router-dom already provides it
 * 2. Replace non-existent lucide-react icons (Figma→PenTool, Chrome→Globe, Slack→MessageSquare, Trello→Columns)
 * 3. Fix any other common import issues
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Icon replacements for names that don't exist in lucide-react
const ICON_REPLACEMENTS = {
  'Figma': 'PenTool',
  'Chrome': 'Globe',
  'Slack': 'MessageSquare',
  'Trello': 'Columns',
  'Sidebar': 'PanelRight',
  'Kanban': 'Columns',
  'Badge': 'BadgeCheck',
  'Verified': 'BadgeCheck',
  'List': 'List',
  'Delete': 'Trash2',
  'View': 'Eye',
  'Type': 'Type',
  'Tags': 'Tags',
  'Info': 'Info',
  'Filter': 'Filter',
  'Files': 'Files',
  'Space': 'Space',
  'Timer': 'Timer',
  'Contrast': 'Contrast',
  'Images': 'Images',
  'Database': 'Database',
  'Network': 'Network',
  'Navigation': 'Navigation',
  'Search': 'Search',
  'Link': '', // This one needs special handling - will be removed if react-router-dom Link exists
};

// Files with duplicate 'Link' from lucide-react (from the typecheck output)
const filesWithDuplicateLink = [
  'src/pages/AboutPage.tsx',
  'src/pages/CategoriesPage.tsx',
  'src/pages/ClientContestsPage.tsx',
  'src/pages/ClientContractsPage.tsx',
  'src/pages/ClientDashboard.tsx',
  'src/pages/ClientFreelancerSearchPage.tsx',
  'src/pages/ClientInvitesPage.tsx',
  'src/pages/ClientMatchesPage.tsx',
  'src/pages/ClientPaymentsPage.tsx',
  'src/pages/ClientProjectsPage.tsx',
  'src/pages/ClientProposalsPage.tsx',
  'src/pages/ClientReferralsPage.tsx',
  'src/pages/ClientReviewsPage.tsx',
  'src/pages/ClientServicesPage.tsx',
  'src/pages/ClientSupportTicketsPage.tsx',
  'src/pages/ContactPage.tsx',
  'src/pages/ContestDetailPage.tsx',
  'src/pages/ContestsPage.tsx',
  'src/pages/CookiesPage.tsx',
  'src/pages/dashboard/ContractsPage.tsx',
  'src/pages/dashboard/DisputeResolutionPage.tsx',
  'src/pages/dashboard/InboxPage.tsx',
  'src/pages/dashboard/InvitesPage.tsx',
  'src/pages/dashboard/OverviewPage.tsx',
  'src/pages/dashboard/PortfolioPage.tsx',
  'src/pages/dashboard/ProjectFeedPage.tsx',
  'src/pages/dashboard/ProposalsPage.tsx',
  'src/pages/dashboard/SkillCertificationsPage.tsx',
  'src/pages/dashboard/SupportTicketsPage.tsx',
  'src/pages/EscrowPolicyPage.tsx',
  'src/pages/FeaturesPage.tsx',
  'src/pages/FreelancersSearchPage.tsx',
  'src/pages/GuidelinesPage.tsx',
  'src/pages/HelpCenterPage.tsx',
  'src/pages/HomePage.tsx',
  'src/pages/HowItWorksPage.tsx',
  'src/pages/InternshipsPage.tsx',
  'src/pages/NotFoundPage.tsx',
  'src/pages/PaymentCallbackPage.tsx',
  'src/pages/PhilosophyPage.tsx',
  'src/pages/PricingPage.tsx',
  'src/pages/PrivacyPage.tsx',
  'src/pages/ProjectDetailsPage.tsx',
  'src/pages/ProSubscriptionPage.tsx',
  'src/pages/PublicFreelancerProfilePage.tsx',
  'src/pages/SafetyPage.tsx',
  'src/pages/ServiceDetailPage.tsx',
  'src/pages/ServicesCatalogPage.tsx',
  'src/pages/StatusPage.tsx',
  'src/pages/SubcategoryDetailPage.tsx',
  'src/pages/TermsPage.tsx',
];

// Files with missing lucide-react exports
const filesWithMissingIcons = {
  'src/pages/ClientContestCreatePage.tsx': ['Figma'],
  'src/pages/FeaturesPage.tsx': ['Figma'],
  'src/pages/HowItWorksPage.tsx': ['Figma'],
  'src/pages/InternshipsPage.tsx': ['Figma'],
  'src/pages/SafetyPage.tsx': ['Figma'],
  'src/pages/dashboard/ProfessionalProfilePage.tsx': ['Chrome'],
  'src/pages/HelpCenterPage.tsx': ['Slack', 'Trello'],
  'src/pages/PhilosophyPage.tsx': ['Slack', 'Trello'],
  'src/pages/TermsPage.tsx': ['Slack'],
};

function removeLinkFromLucideImport(content) {
  // Match the full lucide-react import block
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/;
  const match = content.match(importRegex);
  if (!match) return content;

  const importBlock = match[0];
  const imports = match[1].split(',').map(s => s.trim());

  // Remove 'Link' and 'Link,' from the imports
  const filteredImports = imports.filter(name => {
    const cleanName = name.replace(/^type\s+/, '').trim();
    return cleanName !== 'Link';
  });

  if (filteredImports.length === imports.length) return content; // No Link found

  const newImportBlock = importBlock.replace(
    /\{([^}]+)\}/,
    '{ ' + filteredImports.join(', ') + ' }'
  );

  return content.replace(importBlock, newImportBlock);
}

function replaceMissingIcons(content, replacements) {
  let newContent = content;
  for (const [oldName, newName] of Object.entries(replacements)) {
    if (newName === '') continue;
    
    // Check if this icon name is in a lucide-react import
    const importRegex = new RegExp(`(import\\s*\\{[^}]*?)\\b${oldName}\\b([^}]*?\\}\\s*from\\s*['"]lucide-react['"])`);
    if (importRegex.test(newContent)) {
      newContent = newContent.replace(importRegex, (match, before, after) => {
        return before + newName + after;
      });
      console.log(`  → Replaced '${oldName}' with '${newName}' in lucide-react import`);
    }
    
    // Check if used as JSX component
    const jsxRegex = new RegExp(`<${oldName}(\\s|>|/)`, 'g');
    if (jsxRegex.test(newContent)) {
      newContent = newContent.replace(jsxRegex, `<${newName}$1`);
      console.log(`  → Replaced <${oldName} with <${newName} in JSX`);
    }
    
    // Check if used as icon reference (icon: IconName)
    const objRegex = new RegExp(`\\b${oldName}\\b`, 'g');
    // Only replace if it's a reference pattern, not a string
    newContent = newContent.replace(objRegex, (match) => {
      return match === oldName ? newName : match;
    });
  }
  return newContent;
}

// Process files with duplicate Link
console.log('\n🔗 Fixing duplicate Link identifiers...');
let linkFixedCount = 0;
for (const filePath of filesWithDuplicateLink) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ File not found: ${filePath}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const newContent = removeLinkFromLucideImport(content);
  
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`  ✅ Fixed: ${filePath}`);
    linkFixedCount++;
  } else {
    console.log(`  ⏭️ No Link in lucide-react import: ${filePath}`);
  }
}
console.log(`  Total: ${linkFixedCount} files fixed\n`);

// Process files with missing icons
console.log('🎨 Fixing missing lucide-react icon names...');
for (const [filePath, missingIcons] of Object.entries(filesWithMissingIcons)) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ File not found: ${filePath}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const replacements = {};
  for (const icon of missingIcons) {
    if (ICON_REPLACEMENTS[icon]) {
      replacements[icon] = ICON_REPLACEMENTS[icon];
    }
  }
  
  const newContent = replaceMissingIcons(content, replacements);
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`  ✅ Fixed: ${filePath} (${missingIcons.join(', ')})`);
  } else {
    console.log(`  ⏭️ No changes needed: ${filePath}`);
  }
}
console.log('\n✨ All fixes applied!');
