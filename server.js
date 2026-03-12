const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { glob } = require('glob');

const app = express();
const PORT = 3000;
const PRODUCTS_DIR = path.join(__dirname, 'products');

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

// Ensure products directory exists
if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

app.listen(PORT, () => {
    console.log(`ProductCenter running at http://localhost:${PORT}`);
});
