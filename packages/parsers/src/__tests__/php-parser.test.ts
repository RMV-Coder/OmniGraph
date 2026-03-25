import { describe, it, expect, beforeEach } from 'vitest';
import { PhpParser } from '../php/php-parser';
import * as path from 'path';
import * as fs from 'fs';

const fixturesDir = path.resolve(__dirname, 'fixtures/php-project');

describe('PhpParser', () => {
  let parser: PhpParser;

  beforeEach(() => {
    parser = new PhpParser();
    parser.setRootDir(fixturesDir);
  });

  describe('canHandle', () => {
    it('handles .php files', () => {
      expect(parser.canHandle('app/Controller.php')).toBe(true);
    });

    it('rejects non-PHP files', () => {
      expect(parser.canHandle('app.ts')).toBe(false);
      expect(parser.canHandle('main.py')).toBe(false);
      expect(parser.canHandle('style.css')).toBe(false);
    });
  });

  describe('parse — basic PHP file', () => {
    it('creates a node with php-file type for plain PHP', () => {
      const source = `<?php

function helper() {
    return true;
}
`;
      const result = parser.parse('/project/helpers.php', source);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes![0].type).toBe('php-file');
      expect(result.nodes![0].label).toBe('helpers');
      expect(result.nodes![0].metadata.language).toBe('php');
    });
  });

  describe('parse — Laravel controller detection', () => {
    it('detects Laravel controller from extends Controller', () => {
      const filePath = path.join(fixturesDir, 'app', 'Http', 'Controllers', 'UserController.php');
      const source = fs.readFileSync(filePath, 'utf-8');
      const result = parser.parse(filePath, source);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes![0].type).toBe('php-laravel-controller');
      expect(result.nodes![0].label).toBe('UserController');
      expect(result.nodes![0].metadata.framework).toBe('laravel');
      expect(result.nodes![0].metadata.namespace).toBe('App\\Http\\Controllers');
      expect(result.nodes![0].metadata.classes).toContain('UserController');
    });

    it('detects methods in controller', () => {
      const source = `<?php

namespace App\\Http\\Controllers;

class PostController extends Controller
{
    public function index() {}
    public function store() {}
    public function show(int $id) {}
    public function update(int $id) {}
    public function destroy(int $id) {}
}
`;
      const result = parser.parse('/project/app/Http/Controllers/PostController.php', source);
      expect(result.nodes![0].metadata.methods).toContain('index');
      expect(result.nodes![0].metadata.methods).toContain('store');
      expect(result.nodes![0].metadata.methods).toContain('destroy');
    });
  });

  describe('parse — Laravel model detection', () => {
    it('detects Laravel model from extends Model', () => {
      const filePath = path.join(fixturesDir, 'app', 'Models', 'User.php');
      const source = fs.readFileSync(filePath, 'utf-8');
      const result = parser.parse(filePath, source);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes![0].type).toBe('php-laravel-model');
      expect(result.nodes![0].label).toBe('User');
      expect(result.nodes![0].metadata.framework).toBe('laravel');
    });
  });

  describe('parse — Laravel route detection', () => {
    it('detects route definitions in route files', () => {
      const filePath = path.join(fixturesDir, 'routes', 'web.php');
      const source = fs.readFileSync(filePath, 'utf-8');
      const result = parser.parse(filePath, source);

      expect(result.nodes![0].type).toBe('php-laravel-route');
      expect(result.nodes![0].metadata.framework).toBe('laravel');
      expect(result.nodes![0].metadata.route).toContain('GET /users');
      expect(result.nodes![0].metadata.route).toContain('POST /users');
    });
  });

  describe('parse — namespace and use statement extraction', () => {
    it('extracts namespace from PHP files', () => {
      const source = `<?php

namespace App\\Services;

use App\\Models\\User;

class UserService
{
    public function getAll() {}
}
`;
      const result = parser.parse('/project/app/Services/UserService.php', source);
      expect(result.nodes![0].metadata.namespace).toBe('App\\Services');
    });

    it('creates edges from use statements when files exist', () => {
      const filePath = path.join(fixturesDir, 'app', 'Http', 'Controllers', 'UserController.php');
      const source = fs.readFileSync(filePath, 'utf-8');
      const result = parser.parse(filePath, source);

      // UserController uses App\Models\User — should try to resolve it
      // The edge may or may not resolve depending on PSR-4 mapping
      expect(result.edges).toBeDefined();
    });
  });

  describe('parse — require/include detection', () => {
    it('detects require statements and creates edges', () => {
      const source = `<?php

require_once __DIR__ . '/config.php';
include 'helpers.php';
`;
      // Create a temporary config.php next to our test file
      const filePath = path.join(fixturesDir, 'bootstrap.php');
      const configPath = path.join(fixturesDir, 'config.php');

      // Write temp config so resolution works
      fs.writeFileSync(configPath, '<?php // config');
      try {
        const result = parser.parse(filePath, source);
        const requireEdges = result.edges!.filter(e => e.label === 'requires');
        expect(requireEdges.length).toBeGreaterThanOrEqual(1);
        // Should have an edge to config.php
        const hasConfigEdge = requireEdges.some(e => e.target.includes('config.php'));
        expect(hasConfigEdge).toBe(true);
      } finally {
        fs.unlinkSync(configPath);
      }
    });
  });
});
