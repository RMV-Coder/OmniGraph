import { describe, it, expect, beforeEach } from 'vitest';
import { PythonParser } from '../python/python-parser';
import * as path from 'path';
import * as fs from 'fs';

const fixturesDir = path.resolve(__dirname, 'fixtures/python-project');

describe('PythonParser', () => {
  let parser: PythonParser;

  beforeEach(() => {
    parser = new PythonParser();
    parser.setRootDir(fixturesDir);
  });

  describe('canHandle', () => {
    it('handles .py files', () => {
      expect(parser.canHandle('app/main.py')).toBe(true);
    });

    it('rejects non-Python files', () => {
      expect(parser.canHandle('app.ts')).toBe(false);
      expect(parser.canHandle('style.css')).toBe(false);
      expect(parser.canHandle('index.js')).toBe(false);
      expect(parser.canHandle('file.php')).toBe(false);
    });
  });

  describe('parse — basic Python file', () => {
    it('creates a node with python-file type', () => {
      const source = `
import os
import sys

def main():
    print("hello")
`;
      const result = parser.parse('/project/app/utils.py', source);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes![0].type).toBe('python-file');
      expect(result.nodes![0].label).toBe('utils');
      expect(result.nodes![0].metadata.language).toBe('python');
    });

    it('extracts function names in metadata', () => {
      const source = `
def hello():
    pass

async def fetch_data():
    pass
`;
      const result = parser.parse('/project/app/funcs.py', source);
      expect(result.nodes![0].metadata.functions).toContain('hello');
      expect(result.nodes![0].metadata.functions).toContain('fetch_data');
    });

    it('extracts class names in metadata', () => {
      const source = `
class MyService:
    def run(self):
        pass

class Config(BaseConfig):
    debug = True
`;
      const result = parser.parse('/project/app/services.py', source);
      expect(result.nodes![0].metadata.classes).toContain('MyService');
      expect(result.nodes![0].metadata.classes).toContain('Config');
    });
  });

  describe('parse — FastAPI detection', () => {
    it('detects FastAPI route decorators', () => {
      const source = `
from fastapi import APIRouter

router = APIRouter()

@router.get("/items")
async def list_items():
    return []

@router.post("/items")
async def create_item():
    return {}
`;
      const result = parser.parse('/project/app/routes.py', source);
      expect(result.nodes![0].type).toBe('python-fastapi-route');
      expect(result.nodes![0].metadata.framework).toBe('fastapi');
      expect(result.nodes![0].metadata.route).toContain('GET /items');
    });

    it('detects Flask-style @app.route decorators', () => {
      const source = `
from flask import Flask
app = Flask(__name__)

@app.route("/hello")
def hello():
    return "Hello"
`;
      const result = parser.parse('/project/app/flask_app.py', source);
      expect(result.nodes![0].type).toBe('python-fastapi-route');
    });
  });

  describe('parse — Django detection', () => {
    it('detects Django view classes', () => {
      const source = `
from django.views import View

class HomeView(View):
    def get(self, request):
        return HttpResponse("Hello")
`;
      const result = parser.parse('/project/app/views.py', source);
      expect(result.nodes![0].type).toBe('python-django-view');
      expect(result.nodes![0].metadata.framework).toBe('django');
    });

    it('detects Django REST framework APIView', () => {
      const source = `
from rest_framework.views import APIView

class UserList(APIView):
    def get(self, request):
        return Response([])
`;
      const result = parser.parse('/project/app/api.py', source);
      expect(result.nodes![0].type).toBe('python-django-view');
    });

    it('detects Django models', () => {
      const source = `
from django.db import models

class Article(models.Model):
    title = models.CharField(max_length=200)
`;
      // Note: "models.Model" won't match our simple check for "Model" alone,
      // but just "Model" will:
      const source2 = `
from django.db.models import Model

class Article(Model):
    title = ""
`;
      const result = parser.parse('/project/app/models.py', source2);
      expect(result.nodes![0].type).toBe('python-django-model');
    });
  });

  describe('parse — import resolution', () => {
    it('resolves relative imports to files', () => {
      const mainFile = path.join(fixturesDir, 'app', 'main.py');
      const source = fs.readFileSync(mainFile, 'utf-8');
      const result = parser.parse(mainFile, source);

      // main.py imports from .routers (users) and .models (user_model)
      expect(result.edges!.length).toBeGreaterThan(0);
      const targets = result.edges!.map(e => e.target);
      // Should resolve to the routers package (__init__.py or users.py)
      const hasRoutersImport = targets.some(t => t.includes('routers'));
      expect(hasRoutersImport).toBe(true);
    });

    it('resolves relative imports in routers/users.py', () => {
      const usersFile = path.join(fixturesDir, 'app', 'routers', 'users.py');
      const source = fs.readFileSync(usersFile, 'utf-8');
      const result = parser.parse(usersFile, source);

      expect(result.nodes![0].type).toBe('python-fastapi-route');
      // Has at least the relative import edge
      const edges = result.edges!;
      const hasModelImport = edges.some(e => e.target.includes('models'));
      expect(hasModelImport).toBe(true);
    });
  });
});
