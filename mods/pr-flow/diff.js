// Parses `gh pr diff` output into files and numbered lines.
export function parseDiff(text) {
  const files = [];
  let file = null;
  let oldNo = 0;
  let newNo = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      file = { path: m ? m[2] : line.slice(11), added: 0, removed: 0, lines: [] };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (line.startsWith('rename to ')) {
      file.path = line.slice(10);
      continue;
    }
    if (line.startsWith('Binary files')) {
      file.lines.push({ kind: 'meta', text: 'Binary file not shown.' });
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      file.lines.push({ kind: 'hunk', text: hunk[3].trim() });
      continue;
    }
    if (file.lines.length === 0) continue;
    if (line.startsWith('+')) {
      file.added += 1;
      file.lines.push({ kind: 'add', newNo: newNo++, text: line.slice(1) });
    } else if (line.startsWith('-')) {
      file.removed += 1;
      file.lines.push({ kind: 'del', oldNo: oldNo++, text: line.slice(1) });
    } else if (line.startsWith(' ')) {
      file.lines.push({ kind: 'ctx', oldNo: oldNo++, newNo: newNo++, text: line.slice(1) });
    }
  }
  return files;
}
