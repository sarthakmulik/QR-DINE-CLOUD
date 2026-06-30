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
    } catch (err) { }
  });
  return filelist;
};

const tsxFiles = walkSync(directoryPath).filter(f => f.endsWith('.tsx'));

let changedFiles = 0;

tsxFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Add missing dark mode borders to slate borders
  content = content.replace(/border-slate-300(?! dark:border)/g, 'border-slate-300 dark:border-zinc-700');
  content = content.replace(/border-slate-200(?! dark:border)/g, 'border-slate-200 dark:border-zinc-800');
  content = content.replace(/border-slate-100(?! dark:border)/g, 'border-slate-100 dark:border-zinc-800/50');

  // Replace old white/x dark borders
  content = content.replace(/dark:border-white\/5(?!0)/g, 'dark:border-zinc-800/50');
  content = content.replace(/dark:border-white\/10/g, 'dark:border-zinc-800');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Added dark borders to ${file}`);
  }
});

console.log(`Fixed missing dark borders in ${changedFiles} files.`);
