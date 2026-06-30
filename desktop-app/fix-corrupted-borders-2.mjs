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

  // Clean up the `border -` mistakes left by the previous fix
  content = content.split('border -').join('border-');
  content = content.split('dark:border -').join('dark:border-');
  content = content.split('border-border-').join('border-');
  content = content.split('border  -').join('border-');
  
  // Clean up any stray `border dark:border-zinc-800 ` without a trailing dash that I might have missed
  // No, those were replaced with `border ` correctly in the previous pass.
  // We just need to fix `border -`

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Cleaned up ${file}`);
  }
});

console.log(`Fixed corrupted CSS in ${changedFiles} files.`);
