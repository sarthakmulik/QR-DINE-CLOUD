import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  // 1. Replace existing bad dark borders added by previous agents
  const newContent1 = content.replace(/dark:border-white\/(?:\[0\.0[0-9]\]|5|10|20)/g, 'dark:border-zinc-800/50');
  if (content !== newContent1) {
    content = newContent1;
    changed = true;
  }
  
  // 2. Add dark borders where there are gray/slate borders but NO dark border
  const classRegex = /className=(?:\{`|`|")([^`"]+)(?:`\}|`|")/g;
  const newContent2 = content.replace(classRegex, (match, classStr) => {
    // If it has a border but no dark border
    if (
      (classStr.includes('border-gray-') || classStr.includes('border-slate-') || 
       classStr.includes('divide-gray-') || classStr.includes('divide-slate-')) && 
      !classStr.includes('dark:border-') && 
      !classStr.includes('dark:divide-')
    ) {
      // Append dark borders
      let updatedStr = classStr;
      updatedStr = updatedStr.replace(/(?:^|\s)(border|divide)-(?:gray|slate)-(100|200|300)(?=\s|$)/g, '$& dark:$1-zinc-800/50');
      return match.replace(classStr, updatedStr);
    }
    return match;
  });
  
  if (content !== newContent2) {
    content = newContent2;
    changed = true;
  }

  // 3. Fix bg-white without dark bg
  const newContent3 = content.replace(classRegex, (match, classStr) => {
    if (classStr.includes('bg-white') && !classStr.includes('dark:bg-')) {
      let updatedStr = classStr.replace(/(?:^|\s)bg-white(?=\s|$)/g, '$& dark:bg-[#16161A]');
      return match.replace(classStr, updatedStr);
    }
    return match;
  });
  
  if (content !== newContent3) {
    content = newContent3;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Updated ' + file);
  }
});
