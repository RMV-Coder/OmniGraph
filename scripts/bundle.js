#!/usr/bin/env node
/**
 * Bundle script for creating a publishable `omnigraph` npm package.
 *
 * This script:
 * 1. Builds all workspace packages (types, parsers, server, cli, ui)
 * 2. Bundles the CLI entry point + all backend deps into a single JS file
 * 3. Copies the pre-built UI dist into the publish directory
 * 4. Generates a publish-ready package.json
 *
 * Usage: node scripts/bundle.js
 * Output: publish/ directory ready for `cd publish && npm publish`
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLISH_DIR = path.join(ROOT, 'publish');
const CLI_ENTRY = path.join(ROOT, 'packages/cli/src/index.ts');
const UI_DIST = path.join(ROOT, 'packages/ui/dist');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('=== OmniGraph Bundle Script ===\n');

  // Step 1: Build all workspace packages
  console.log('[1/4] Building workspace packages...');
  run('npm run build');

  // Step 2: Clean and create publish directory
  console.log('\n[2/4] Preparing publish directory...');
  if (fs.existsSync(PUBLISH_DIR)) {
    fs.rmSync(PUBLISH_DIR, { recursive: true });
  }
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  fs.mkdirSync(path.join(PUBLISH_DIR, 'dist'), { recursive: true });

  // Step 3: Bundle CLI with esbuild
  console.log('\n[3/4] Bundling CLI with esbuild...');
  await esbuild.build({
    entryPoints: [CLI_ENTRY],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(PUBLISH_DIR, 'dist/cli.js'),
    // Mark Node.js built-ins as external
    external: [],
    banner: {
      js: '#!/usr/bin/env node',
    },
    // Silence warnings about __dirname in ESM (we're targeting CJS)
    define: {},
    minify: false, // Keep readable for debugging
    sourcemap: false,
    // Handle the 'ignore' package (uses dynamic requires)
    mainFields: ['main', 'module'],
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    tsconfig: path.join(ROOT, 'packages/cli/tsconfig.json'),
    logLevel: 'info',
  });

  // Step 4: Copy UI dist
  console.log('\n[4/4] Copying UI dist...');
  if (!fs.existsSync(UI_DIST)) {
    throw new Error('UI dist not found. Run: cd packages/ui && npm run build');
  }
  copyDir(UI_DIST, path.join(PUBLISH_DIR, 'ui'));

  // Step 5: Generate package.json for publishing
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const cliPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/cli/package.json'), 'utf-8'));

  const publishPkg = {
    name: 'omnigraph',
    version: rootPkg.version || '1.0.0',
    description: 'A multi-language, AST-driven dependency visualizer for complex codebases. Parses TypeScript/NestJS, Python/FastAPI/Django, and PHP/Laravel and renders an interactive dependency graph.',
    bin: {
      omnigraph: 'dist/cli.js',
    },
    files: [
      'dist/',
      'ui/',
      'README.md',
      'LICENSE',
    ],
    keywords: [
      'dependency-graph',
      'code-visualizer',
      'ast',
      'static-analysis',
      'typescript',
      'python',
      'php',
      'nestjs',
      'fastapi',
      'django',
      'laravel',
      'react-flow',
      'obsidian',
    ],
    repository: {
      type: 'git',
      url: 'https://github.com/RMV-Coder/OmniGraph',
    },
    homepage: 'https://github.com/RMV-Coder/OmniGraph#readme',
    bugs: {
      url: 'https://github.com/RMV-Coder/OmniGraph/issues',
    },
    license: 'MIT',
    engines: {
      node: '>=18',
    },
    author: '',
  };

  fs.writeFileSync(
    path.join(PUBLISH_DIR, 'package.json'),
    JSON.stringify(publishPkg, null, 2) + '\n',
  );

  // Copy README if it exists
  const readmePath = path.join(ROOT, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, path.join(PUBLISH_DIR, 'README.md'));
  }

  // Copy LICENSE if it exists
  const licensePath = path.join(ROOT, 'LICENSE');
  if (fs.existsSync(licensePath)) {
    fs.copyFileSync(licensePath, path.join(PUBLISH_DIR, 'LICENSE'));
  }

  // Make the CLI file executable
  const cliPath = path.join(PUBLISH_DIR, 'dist/cli.js');
  try {
    fs.chmodSync(cliPath, '755');
  } catch {
    // chmod may not work on Windows, that's fine
  }

  console.log('\n=== Bundle complete! ===');
  console.log(`Output: ${PUBLISH_DIR}/`);
  console.log('\nTo publish:');
  console.log('  cd publish');
  console.log('  npm publish');
  console.log('\nTo test locally:');
  console.log('  cd publish');
  console.log('  npm link');
  console.log('  omnigraph --path /path/to/your/project');
}

main().catch((err) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
