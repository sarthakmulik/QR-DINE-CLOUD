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

  // Fix the specific corruption string
  content = content.split('dark:border-zinc-800-').join('-');
  content = content.split('border dark:border-zinc-800 ').join('border ');
  content = content.split('dark:border dark:border-zinc-800').join('dark:border-zinc-800');

  // Let's also check for any other remnants of the bad script
  // e.g. dark:border-zinc-700/80-
  content = content.split('dark:border-zinc-700/80-').join('-');
  content = content.split('border dark:border-zinc-700/80 ').join('border ');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Cleaned up ${file}`);
  }
});

console.log(`Fixed corrupted CSS in ${changedFiles} files.`);
