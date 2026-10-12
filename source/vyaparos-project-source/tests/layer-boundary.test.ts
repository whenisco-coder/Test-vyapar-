import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function findFiles(dir: string, ext: string = '.tsx'): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(findFiles(fullPath, ext));
    else if (entry.name.endsWith(ext) || entry.name.endsWith('.ts')) files.push(fullPath);
  }
  return files;
}

function importedSpecifiers(line: string): string[] {
  const specifiers: string[] = [];
  const pattern = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g;
  for (const match of line.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function resolvesIntoDataLayer(importerPath: string, specifier: string, projectRoot: string): boolean {
  let resolved: string;
  if (specifier.startsWith('@/')) resolved = path.resolve(projectRoot, specifier.slice(2));
  else if (specifier.startsWith('.')) resolved = path.resolve(path.dirname(importerPath), specifier);
  else return false;
  const dataRoot = path.resolve(projectRoot, 'src/data');
  return resolved === dataRoot || resolved.startsWith(`${dataRoot}${path.sep}`);
}

function findDataLayerImports(importerPath: string, content: string, projectRoot: string): string[] {
  return content.split('\n').flatMap((line) =>
    importedSpecifiers(line)
      .filter((specifier) => resolvesIntoDataLayer(importerPath, specifier, projectRoot))
      .map((specifier) => `${line.trim()} -> ${specifier}`),
  );
}

describe('Architectural Layer Boundaries (D2 Strict Rule)', () => {
  it('enforces that src/ui/ NEVER imports directly from src/data/', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const uiDir = path.resolve(projectRoot, 'src/ui');
    const violations: { file: string; line: string }[] = [];

    for (const filePath of findFiles(uiDir)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const matches = findDataLayerImports(filePath, line, projectRoot);
        for (const match of matches) violations.push({ file: filePath, line: match });
      }
    }

    expect(
      violations,
      `Layer boundary violation detected! UI must never import from src/data/. Found: ${JSON.stringify(violations)}`,
    ).toHaveLength(0);
  });

  it('catches a real src/data import but allows domain/data imports', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const importer = path.resolve(projectRoot, 'src/ui/views/FakeView.tsx');
    expect(findDataLayerImports(importer, "import { db } from '../../data/db';", projectRoot)).toHaveLength(1);
    expect(findDataLayerImports(importer, "import { categories } from '../../domain/data/categories';", projectRoot)).toHaveLength(0);
  });
});
