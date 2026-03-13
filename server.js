const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { glob } = require('glob');

const app = express();
const PORT = 3000;
const PRODUCTS_DIR = path.join(__dirname, 'products');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// List all product YAML files
app.get('/api/products', async (req, res) => {
    try {
        const files = await glob('*.yaml', { cwd: PRODUCTS_DIR });
        const products = files.map(file => {
            const content = fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
            const data = yaml.load(content);
            return {
                filename: file,
                name: data?.product?.name || file,
                id: data?.product?.id || file,
            };
        });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Load a single product YAML
app.get('/api/products/:filename', (req, res) => {
    try {
        const filePath = path.join(PRODUCTS_DIR, req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        const content = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(content);
        res.json({ data, raw: content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save a product YAML
app.put('/api/products/:filename', (req, res) => {
    try {
        const filePath = path.join(PRODUCTS_DIR, req.params.filename);
        const yamlStr = yaml.dump(req.body.data, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
            quotingType: '"',
            forceQuotes: false,
        });
        fs.writeFileSync(filePath, yamlStr, 'utf8');
        res.json({ success: true, raw: yamlStr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new product YAML
app.post('/api/products', (req, res) => {
    try {
        const { filename, data } = req.body;
        if (!filename) return res.status(400).json({ error: 'Filename required' });
        const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const fullName = safeName.endsWith('.yaml') ? safeName : `${safeName}.yaml`;
        const filePath = path.join(PRODUCTS_DIR, fullName);
        if (fs.existsSync(filePath)) return res.status(409).json({ error: 'File already exists' });
        const yamlStr = yaml.dump(data || { product: { id: '', name: '', category: '' } }, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
        });
        fs.writeFileSync(filePath, yamlStr, 'utf8');
        res.json({ success: true, filename: fullName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a product YAML
app.delete('/api/products/:filename', (req, res) => {
    try {
        const filePath = path.join(PRODUCTS_DIR, req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ensure directories exist
if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

// ─── Template helpers ────────────────────────────────────────────────────────

// Extract default values from a template schema (strip _meta fields)
function extractDefaults(schema) {
    if (schema === null || schema === undefined) return '';

    // If it has _type, it's a leaf field definition
    if (schema._type) {
        if (schema._type === 'array') {
            return [];
        }
        if (schema._type === 'string-array') {
            return [];
        }
        if (schema._type === 'boolean') {
            return schema._default !== undefined ? schema._default : false;
        }
        if (schema._type === 'number') {
            return schema._default !== undefined ? schema._default : null;
        }
        if (schema._type === 'enum') {
            return schema._default || '';
        }
        if (schema._type === 'date') {
            return schema._default || '';
        }
        // string
        return schema._default || '';
    }

    // Object: recurse into non-meta keys
    const result = {};
    for (const [key, val] of Object.entries(schema)) {
        if (key.startsWith('_')) continue;
        if (val !== null && typeof val === 'object') {
            result[key] = extractDefaults(val);
        } else {
            result[key] = val;
        }
    }
    return result;
}

// ─── Template API ────────────────────────────────────────────────────────────

// List all templates
app.get('/api/templates', async (req, res) => {
    try {
        const files = await glob('*.yaml', { cwd: TEMPLATES_DIR });
        const templates = files.map(file => {
            const content = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
            const data = yaml.load(content);
            return {
                filename: file,
                name: data?._template?.name || file,
                description: data?._template?.description || '',
                category: data?._template?.category || '',
            };
        });
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single template (full schema)
app.get('/api/templates/:filename', (req, res) => {
    try {
        const filePath = path.join(TEMPLATES_DIR, req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Template not found' });
        const content = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(content);
        res.json({ schema: data, defaults: extractDefaults(data) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`ProductCenter running at http://localhost:${PORT}`);
});
