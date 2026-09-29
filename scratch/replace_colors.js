const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walk(filePath, fileList);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = walk('src');

const classMap = {
  // Brand Primary replacements (Purple, Indigo, Teal used for main UI elements)
  'bg-purple-600': 'bg-evenvibe-primary',
  'bg-indigo-600': 'bg-evenvibe-primary',
  'bg-teal-600': 'bg-evenvibe-primary',
  'bg-emerald-600': 'bg-evenvibe-primary',
  'bg-purple-500': 'bg-evenvibe-primary',
  'bg-indigo-500': 'bg-evenvibe-primary',
  'bg-blue-600': 'bg-evenvibe-primary',
  
  'hover:bg-purple-700': 'hover:bg-evenvibe-deep',
  'hover:bg-indigo-700': 'hover:bg-evenvibe-deep',
  'hover:bg-emerald-700': 'hover:bg-evenvibe-deep',
  
  'bg-purple-50': 'bg-evenvibe-light',
  'bg-indigo-50': 'bg-evenvibe-light',
  'bg-emerald-50': 'bg-evenvibe-light',
  
  'text-purple-600': 'text-evenvibe-primary',
  'text-indigo-600': 'text-evenvibe-primary',
  'text-teal-600': 'text-evenvibe-primary',
  'text-emerald-600': 'text-evenvibe-primary',
  
  'text-purple-700': 'text-evenvibe-deep',
  'text-indigo-700': 'text-evenvibe-deep',
  'text-emerald-700': 'text-evenvibe-deep',
  
  'border-purple-600': 'border-evenvibe-primary',
  'border-indigo-600': 'border-evenvibe-primary',
  'border-emerald-600': 'border-evenvibe-primary',

  'ring-purple-600': 'ring-evenvibe-primary',
  'ring-indigo-500': 'ring-evenvibe-primary',
  'ring-indigo-600': 'ring-evenvibe-primary',
  'ring-emerald-500': 'ring-evenvibe-primary',

  // Semantic Status Colors
  // Success
  'bg-emerald-500': 'bg-status-success',
  'text-emerald-500': 'text-status-success',
  
  // Warning
  'bg-amber-500': 'bg-status-warning',
  'bg-amber-600': 'bg-status-warning',
  'text-amber-500': 'text-status-warning',
  'text-amber-600': 'text-status-warning',
  'border-amber-500': 'border-status-warning',
  
  // Error
  'bg-red-500': 'bg-status-error',
  'bg-red-600': 'bg-status-error',
  'text-red-500': 'text-status-error',
  'text-red-600': 'text-status-error',
  
  // Info
  'bg-sky-500': 'bg-status-info',
  'bg-blue-500': 'bg-status-info',
  'text-sky-500': 'text-status-info',
  'text-blue-500': 'text-status-info',
};

// Generic replacer for others that don't match exactly
function processContent(content) {
  let newContent = content;
  
  // Replace exact matches first
  for (const [oldClass, newClass] of Object.entries(classMap)) {
    // using regex to match word boundaries that are safe for tailwind classes (e.g. not matching -bg-purple-600)
    const regex = new RegExp("(?<=[\\s\"'`])" + oldClass + "(?=[\\s\"'`])", "g");
    newContent = newContent.replace(regex, newClass);
  }
  
  // Replace remaining generic patterns for brand (purple/indigo)
  newContent = newContent.replace(/(bg|text|border|ring|hover:bg|hover:text)-(purple|indigo|teal)-(500|600)/g, "$1-evenvibe-primary");
  newContent = newContent.replace(/(bg|text|border|ring|hover:bg|hover:text)-(purple|indigo|teal)-(700|800|900|950)/g, "$1-evenvibe-deep");
  newContent = newContent.replace(/(bg|text|border|ring|hover:bg|hover:text)-(purple|indigo|teal)-(50|100|200)/g, "$1-evenvibe-light");
  
  // Replace remaining generic patterns for semantic colors
  newContent = newContent.replace(/(bg|text|border|ring|hover:bg|hover:text)-(red|rose)-(500|600)/g, "$1-status-error");
  newContent = newContent.replace(/(bg|text|border|ring|hover:bg|hover:text)-(amber|orange|yellow)-(500|600)/g, "$1-status-warning");
  newContent = newContent.replace(/(bg|text|border|ring|hover:bg|hover:text)-(cyan|sky)-(500|600)/g, "$1-status-info");
  
  // Replace arbitrary hex codes inline if they exist
  newContent = newContent.replace(/#6366F1/gi, "var(--evenvibe-primary)");
  newContent = newContent.replace(/#16A34A/gi, "var(--evenvibe-primary)");
  newContent = newContent.replace(/#10B981/gi, "var(--evenvibe-primary)");

  // Specific overrides based on user instructions:
  // "Do NOT introduce unrelated purple/indigo primary buttons."
  // "Admin sidebar should follow EVENVIBE branding... Active navigation: Background: #EAF6E5 Text/icon: #17452D Accent: #65B741"
  return newContent;
}

let modifiedFiles = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const newContent = processContent(content);
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    modifiedFiles++;
  }
}
console.log('Modified files:', modifiedFiles);
