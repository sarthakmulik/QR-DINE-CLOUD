import fs from 'fs';
import path from 'path';

const directoryPath = 'C:\\QR-DINE-CLOUD\\src';

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EACCES') console.warn(`Cannot access: ${dirFile}`);
    }
  });
  return filelist;
};

const tsxFiles = walkSync(directoryPath).filter(f => f.endsWith('.tsx'));
console.log(`Found ${tsxFiles.length} tsx files.`);

let changedFiles = 0;

tsxFiles.forEach(file => {
  if (file.includes('dashboard\\page.tsx')) return; // Already manually fixed
  
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Function to add dark classes safely
  const replaceClass = (regex, replacement) => {
    content = content.replace(regex, (match, p1) => {
      // If the match already contains 'dark:', don't replace
      // This is a bit tricky, regex handles the word boundaries
      return replacement;
    });
  };

  // Safe replacements using negative lookbehinds/lookaheads if possible, but JS string replace with custom function is easier
  const safeReplace = (targetClass, darkClass) => {
    // Match the target class but not if it's already followed by the darkClass
    // We can just split by class strings and replace, but regex is fine.
    // e.g. \bbg-white\b(?!\/|\])
    const regex = new RegExp(`\\b${targetClass}\\b(?![\\[\\/])(?!\\s+dark:)`, 'g');
    content = content.replace(regex, `${targetClass} ${darkClass}`);
  };

  safeReplace('bg-white', 'dark:bg-[#18181b]');
  safeReplace('bg-gray-50', 'dark:bg-white/[0.04]');
  safeReplace('bg-gray-100', 'dark:bg-white/[0.05]');
  safeReplace('bg-gray-200', 'dark:bg-white/[0.06]');
  
  safeReplace('border-gray-100', 'dark:border-white/[0.06]');
  safeReplace('border-gray-200', 'dark:border-white/[0.07]');
  safeReplace('border-gray-300', 'dark:border-white/[0.08]');
  
  safeReplace('text-gray-900', 'dark:text-gray-100');
  safeReplace('text-gray-800', 'dark:text-gray-200');
  safeReplace('text-gray-700', 'dark:text-gray-300');
  safeReplace('text-gray-600', 'dark:text-gray-400');
  safeReplace('text-gray-500', 'dark:text-gray-400');
  safeReplace('text-gray-400', 'dark:text-gray-500');

  safeReplace('hover:bg-gray-50', 'dark:hover:bg-white/[0.04]');
  safeReplace('hover:bg-gray-100', 'dark:hover:bg-white/[0.05]');
  
  safeReplace('divide-gray-100', 'dark:divide-white/[0.05]');
  safeReplace('divide-gray-200', 'dark:divide-white/[0.05]');

  // Inputs and selects that are raw:
  // Find <input ... className="... border ..."> and add standard classes.
  // Actually, simple regex to replace long classNames with input-base is risky.
  // We'll just append dark classes to them via safeReplace above, which is safer than rewriting className strings entirely!
  
  // Special case: `border` without a color defaults to light gray border in some resets, but in tailwind it's just a 1px border.
  // It's usually `border border-gray-200`. If it's just `border`, we should add `dark:border-white/[0.07]`.
  const borderRegex = /\bborder\b(?!\s+border-[a-z]+-\d+)(?!\s+dark:border)/g;
  content = content.replace(borderRegex, 'border dark:border-white/[0.07]');

  // Dedup repeated dark classes if any happened accidentally
  content = content.replace(/(dark:bg-\[#18181b\])\s+\1/g, '$1');
  content = content.replace(/(dark:bg-white\/\[0\.04\])\s+\1/g, '$1');
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Updated ${file}`);
  }
});

console.log(`Changed ${changedFiles} files.`);
