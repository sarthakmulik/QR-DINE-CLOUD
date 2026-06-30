import fs from 'fs';
import path from 'path';

const directoryPath = 'C:\\QR-DINE-CLOUD\\src';

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      if (fs.statSync(dirFile).isDirectory()) {
        filelist = walkSync(dirFile, filelist);
      } else {
        filelist.push(dirFile);
      }
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EACCES') console.warn(`Cannot access: ${dirFile}`);
    }
  });
  return filelist;
};

const tsxFiles = walkSync(directoryPath).filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'));

let changedFiles = 0;

const replacements = {
  'dark:bg-[#0F0F11]': 'dark:bg-zinc-950',
  'dark:bg-[#18181b]': 'dark:bg-zinc-900',
  'dark:bg-[#18181B]': 'dark:bg-zinc-900',
  'dark:bg-white/\\[0.04\\]': 'dark:bg-zinc-900/50',
  'dark:bg-white/\\[0.05\\]': 'dark:bg-zinc-800/50',
  'dark:bg-white/\\[0.06\\]': 'dark:bg-zinc-800/70',
  'dark:border-white/\\[0.07\\]': 'dark:border-zinc-800',
  'dark:border-white/\\[0.08\\]': 'dark:border-zinc-700/80',
  'dark:border-white/\\[0.05\\]': 'dark:border-zinc-800',
  'dark:hover:bg-white/\\[0.02\\]': 'dark:hover:bg-zinc-800/30',
  'dark:hover:bg-white/\\[0.04\\]': 'dark:hover:bg-zinc-800/50',
  'dark:hover:bg-white/\\[0.05\\]': 'dark:hover:bg-zinc-800',
  'dark:divide-white/\\[0.05\\]': 'dark:divide-zinc-800',
  'dark:text-gray-100': 'dark:text-zinc-100',
  'dark:text-gray-200': 'dark:text-zinc-200',
  'dark:text-gray-300': 'dark:text-zinc-300',
  'dark:text-gray-400': 'dark:text-zinc-400',
  'dark:text-gray-500': 'dark:text-zinc-500'
};

tsxFiles.forEach(file => {
  // Skip staff and kitchen because they use a bespoke emerald/amber palette
  // But wait, the text and borders there were actually carefully crafted. 
  // Let's only skip staff/page.tsx, kitchen/[hotelId]/page.tsx
  if (file.includes('staff\\page.tsx') || file.includes('kitchen\\[hotelId]\\page.tsx')) {
    // Actually we can replace the grays there safely? The staff panel uses dark:bg-[#0C0C0E] mostly, not #18181b.
    // I will skip staff and kitchen to be safe, they already look good.
    return;
  }

  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  for (const [key, value] of Object.entries(replacements)) {
    // Un-escape the manually escaped keys from earlier so string replacement works
    const actualKey = key.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    content = content.split(actualKey).join(value);
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Updated ${file}`);
  }
});

console.log(`Changed ${changedFiles} files.`);
