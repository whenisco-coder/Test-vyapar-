import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function findFiles(dir: string, ext: string = '.tsx'): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext) || entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Architectural Layer Boundaries (D2 Strict Rule)', () => {
  it('enforces that src/ui/ NEVER imports directly from src/data/', () => {
    const uiDir = path.resolve(__dirname, '../src/ui');
    const uiFiles = findFiles(uiDir);

    const violations: { file: string; line: string }[] = [];

    for (const filePath of uiFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        // Look for import statements referencing data layer
        if (
          (line.startsWith('import ') || line.includes('from ')) &&
          (line.includes('/data/') || line.includes('../data') || line.includes('../../data'))
        ) {
          violations.push({ file: filePath, line });
        }
      }
    }

    expect(
      violations,
      `Layer boundary violation detected! UI must never import from src/data/. Found: ${JSON.stringify(violations)}`
    ).toHaveLength(0);
  });
});
