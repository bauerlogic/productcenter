// ─── State ───────────────────────────────────────────────────────────────────
let currentFile = null;
let currentData = null;
let currentTemplate = null;
let templates = [];
let isYamlView = false;
let editingTemplate = false;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const fileList = document.getElementById('file-list');
const editorArea = document.getElementById('editor');
const emptyState = document.getElementById('empty-state');
const editorTitle = document.getElementById('editor-title');
const tableContainer = document.getElementById('table-container');
const tableView = document.getElementById('table-view');
const yamlView = document.getElementById('yaml-view');
const yamlRaw = document.getElementById('yaml-raw');
const btnSave = document.getElementById('btn-save');
const btnDelete = document.getElementById('btn-delete');
const btnToggle = document.getElementById('btn-toggle-view');
const btnNew = document.getElementById('btn-new');
const btnAddRoot = document.getElementById('btn-add-root');
const toast = document.getElementById('toast');
const modalOverlay = document.getElementById('modal-overlay');
const modalCreate = document.getElementById('modal-create');
const modalCancel = document.getElementById('modal-cancel');
const newFilenameInput = document.getElementById('new-filename');
const templateSelect = document.getElementById('template-select');
const templateListEl = document.getElementById('template-list');
const btnNewTemplate = document.getElementById('btn-new-template');
const modalOverlayTemplate = document.getElementById('modal-overlay-template');
const modalTemplateCreate = document.getElementById('modal-template-create');
const modalTemplateCancel = document.getElementById('modal-template-cancel');
const newTemplateFilename = document.getElementById('new-template-filename');

// ─── Utilities ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── API helpers ─────────────────────────────────────────────────────────────
async function api(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    return res.json();
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = type;
    setTimeout(() => (toast.className = 'hidden'), 2500);
}

// ─── Template schema helpers ─────────────────────────────────────────────────
function isMetaField(schema) {
    return schema && typeof schema === 'object' && '_type' in schema;
}

function getLabel(schema, key) {
    if (schema && schema._label) return schema._label;
    return key;
}

function getDefaultForType(meta) {
    if (!meta) return '';
    const d = meta._default;
    switch (meta._type) {
        case 'number': return d !== undefined ? d : null;
        case 'boolean': return d !== undefined ? d : false;
        case 'array': return [];
        case 'string-array': return [];
        case 'enum': return d || '';
        case 'date': return d || '';
        default: return d || '';
    }
}

function buildDefaultObject(schema) {
    if (isMetaField(schema)) return getDefaultForType(schema);
    const result = {};
    Object.entries(schema).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        if (isMetaField(v)) {
            result[k] = getDefaultForType(v);
        } else if (v && typeof v === 'object') {
            result[k] = buildDefaultObject(v);
        }
    });
    return result;
}

// ─── Path-based data helpers ─────────────────────────────────────────────────
function getByPath(obj, path) {
    let current = obj;
    for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

function setByPath(obj, path, value) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
}

function removeByPath(obj, path) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
    }
    const key = path[path.length - 1];
    if (Array.isArray(current)) {
        current.splice(key, 1);
    } else {
        delete current[key];
    }
}

function parseInputValue(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (val !== '' && !isNaN(val) && val.trim() !== '') return Number(val);
    return val;
}

// ─── Load templates ──────────────────────────────────────────────────────────
async function loadTemplates() {
    templates = await api('/api/templates');
    templateSelect.innerHTML = '<option value="">-- No template (freeform) --</option>';
    templates.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.filename;
        opt.textContent = `${t.name} – ${t.description}`;
        templateSelect.appendChild(opt);
    });
}

// ─── Load file list ──────────────────────────────────────────────────────────
async function loadFileList() {
    const products = await api('/api/products');
    fileList.innerHTML = '';
    products.forEach((p) => {
        const li = document.createElement('li');
        li.innerHTML = `${p.name}<span class="file-id">${p.filename}</span>`;
        li.dataset.filename = p.filename;
        if (currentFile === p.filename && !editingTemplate) li.classList.add('active');
        li.onclick = () => loadProduct(p.filename);
        fileList.appendChild(li);
    });
}

// ─── Load template list in sidebar ───────────────────────────────────────────
async function loadTemplateListSidebar() {
    const tpls = await api('/api/templates');
    templateListEl.innerHTML = '';
    tpls.forEach((t) => {
        const li = document.createElement('li');
        li.innerHTML = `${t.name}<span class="file-id">${t.filename}</span>`;
        li.dataset.filename = t.filename;
        if (currentFile === t.filename && editingTemplate) li.classList.add('active');
        li.onclick = () => loadTemplateForEdit(t.filename);
        templateListEl.appendChild(li);
    });
}

// ─── Load a product ──────────────────────────────────────────────────────────
async function loadProduct(filename) {
    const result = await api(`/api/products/${encodeURIComponent(filename)}`);
    if (result.error) return showToast(result.error, 'error');

    currentFile = filename;
    currentData = result.data;
    editingTemplate = false;
    btnToggle.disabled = false;
    btnToggle.title = 'Switch between table and YAML view';

    // Try to find a matching template: prefer explicit _template field, fallback to category
    currentTemplate = null;
    const explicitTpl = currentData?._template || '';
    const category = currentData?.product?.category || '';
    let matchedTemplate = null;
    if (explicitTpl) {
        matchedTemplate = templates.find((t) => t.filename === explicitTpl);
    }
    if (!matchedTemplate && category) {
        matchedTemplate = templates.find((t) => t.category === category);
    }
    if (matchedTemplate) {
        const tplResult = await api(`/api/templates/${encodeURIComponent(matchedTemplate.filename)}`);
        if (tplResult.schema) currentTemplate = tplResult.schema;
    }

    emptyState.classList.add('hidden');
    editorArea.classList.remove('hidden');
    editorTitle.textContent = currentData?.product?.name || filename;

    isYamlView = false;
    tableView.classList.remove('hidden');
    yamlView.classList.add('hidden');
    btnToggle.textContent = 'YAML View';

    renderTable();
    yamlRaw.value = result.raw;

    document.querySelectorAll('#file-list li').forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === filename);
    });
    document.querySelectorAll('#template-list li').forEach((li) => {
        li.classList.remove('active');
    });
}

// ─── Load a template for editing ─────────────────────────────────────────────
async function loadTemplateForEdit(filename) {
    const result = await api(`/api/templates/${encodeURIComponent(filename)}`);
    if (result.error) return showToast(result.error, 'error');

    currentFile = filename;
    currentData = null;
    currentTemplate = null;
    editingTemplate = true;

    emptyState.classList.add('hidden');
    editorArea.classList.remove('hidden');
    editorTitle.textContent = '📄 Template: ' + (result.schema?._template?.name || filename);

    // Templates always open in YAML view
    isYamlView = true;
    tableView.classList.add('hidden');
    yamlView.classList.remove('hidden');
    btnToggle.textContent = 'Table View';
    btnToggle.disabled = true;
    btnToggle.title = 'Templates can only be edited as YAML';
    yamlRaw.value = result.raw;

    document.querySelectorAll('#template-list li').forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === filename);
    });
    document.querySelectorAll('#file-list li').forEach((li) => {
        li.classList.remove('active');
    });
}

// ─── Flatten data to rows ────────────────────────────────────────────────────
// Each row: { displayPath: string[], dataPath: (string|number)[], value, isLeaf, isArrayIndex[], schema }

function flattenToRows(data, dataPath, displayPath, schema) {
    const rows = [];

    if (Array.isArray(data)) {
        if (data.length === 0) {
            rows.push({
                displayPath: [...displayPath, '(empty)'],
                dataPath: dataPath,
                value: null,
                isLeaf: true,
                isEmpty: true,
                isArrayContainer: true,
                schema: schema,
            });
        }
        const itemSchema = schema ? schema._item : null;
        data.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
                const childRows = flattenToRows(item, [...dataPath, idx], [...displayPath, `#${idx + 1}`], itemSchema);
                rows.push(...childRows);
            } else {
                rows.push({
                    displayPath: [...displayPath, `#${idx + 1}`],
                    dataPath: [...dataPath, idx],
                    value: item,
                    isLeaf: true,
                    schema: itemSchema,
                });
            }
        });
        // Add-item row
        rows.push({
            displayPath: displayPath,
            dataPath: dataPath,
            isLeaf: false,
            isAddArrayItem: true,
            schema: schema,
        });
    } else if (typeof data === 'object' && data !== null) {
        const entries = Object.entries(data);
        if (entries.length === 0) {
            rows.push({
                displayPath: [...displayPath, '(empty)'],
                dataPath: dataPath,
                value: null,
                isLeaf: true,
                isEmpty: true,
                schema: schema,
            });
        }
        entries.forEach(([key, value]) => {
            const fieldSchema = schema ? schema[key] : null;

            // Check _visible_if condition
            if (fieldSchema && fieldSchema._visible_if) {
                const condField = fieldSchema._visible_if.field;
                const condValue = fieldSchema._visible_if.value;
                if (data[condField] !== condValue) return;
            }

            if (typeof value === 'object' && value !== null) {
                const childRows = flattenToRows(value, [...dataPath, key], [...displayPath, getLabel(fieldSchema, key)], fieldSchema);
                rows.push(...childRows);
            } else {
                rows.push({
                    displayPath: [...displayPath, getLabel(fieldSchema, key)],
                    dataPath: [...dataPath, key],
                    value: value,
                    isLeaf: true,
                    schema: fieldSchema,
                });
            }
        });

        // Show missing template-defined fields as "add" buttons
        if (schema) {
            Object.keys(schema).forEach((key) => {
                if (key.startsWith('_')) return;
                if (data && key in data) return;
                const fieldSchema = schema[key];
                // Check _visible_if
                if (fieldSchema && fieldSchema._visible_if) {
                    const condField = fieldSchema._visible_if.field;
                    const condValue = fieldSchema._visible_if.value;
                    if (data[condField] !== condValue) return;
                }
                rows.push({
                    displayPath: [...displayPath, getLabel(fieldSchema, key)],
                    dataPath: [...dataPath, key],
                    isAddTemplateField: true,
                    templateKey: key,
                    parentDataPath: dataPath,
                    schema: fieldSchema,
                    parentSchema: schema,
                });
            });
        }

        // "Add property" row for this object
        rows.push({
            displayPath: displayPath,
            dataPath: dataPath,
            isAddProperty: true,
            schema: schema,
        });
    }

    return rows;
}

// ─── Compute maximum depth ───────────────────────────────────────────────────
function getMaxDepth(rows) {
    let max = 0;
    for (const row of rows) {
        if (row.displayPath) {
            max = Math.max(max, row.displayPath.length);
        }
    }
    return max;
}

// ─── Compute rowspan information ─────────────────────────────────────────────
// For each row and column, determine if the cell should be rendered and its rowspan.
function computeRenderMatrix(rows, numKeyCols) {
    // matrix[rowIdx][colIdx] = { render: true, rowspan, label } or { render: false }
    const matrix = rows.map(() => new Array(numKeyCols).fill(null));

    for (let col = 0; col < numKeyCols; col++) {
        let spanStart = 0;

        for (let row = 0; row <= rows.length; row++) {
            // Check if current row continues the same group as spanStart
            let continues = false;
            if (row < rows.length) {
                continues = true;
                // Entire prefix up to and including this column must match
                for (let c = 0; c <= col; c++) {
                    const a = rows[spanStart].displayPath ? rows[spanStart].displayPath[c] : undefined;
                    const b = rows[row].displayPath ? rows[row].displayPath[c] : undefined;
                    if (a !== b || a === undefined) {
                        continues = false;
                        break;
                    }
                }
            }

            if (!continues) {
                // Close the previous span
                const label = rows[spanStart].displayPath ? rows[spanStart].displayPath[col] : undefined;
                const spanLen = row - spanStart;

                if (label !== undefined) {
                    matrix[spanStart][col] = { render: true, rowspan: spanLen, label: label };
                } else {
                    matrix[spanStart][col] = { render: true, rowspan: spanLen, label: null };
                }

                for (let r = spanStart + 1; r < row; r++) {
                    matrix[r][col] = { render: false };
                }

                spanStart = row;
            }
        }
    }

    return matrix;
}

// ─── Render the spreadsheet table ────────────────────────────────────────────
function renderTable() {
    tableContainer.innerHTML = '';

    if (!currentData || typeof currentData !== 'object') {
        tableContainer.textContent = 'No data to display.';
        return;
    }

    // Flatten the data
    const rows = flattenToRows(currentData, [], [], currentTemplate);
    if (rows.length === 0) {
        tableContainer.textContent = 'Empty product data.';
        return;
    }

    // Determine column count (max path depth among leaf rows)
    const maxDepth = getMaxDepth(rows);
    const numKeyCols = maxDepth; // columns for path segments

    // Compute rowspan info
    const matrix = computeRenderMatrix(rows, numKeyCols);

    // Build table
    const table = document.createElement('table');
    table.className = 'sheet-table';

    // Header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let c = 0; c < numKeyCols; c++) {
        const th = document.createElement('th');
        th.textContent = c === 0 ? 'Key' : `Level ${c + 1}`;
        headerRow.appendChild(th);
    }
    const thVal = document.createElement('th');
    thVal.textContent = 'Value';
    headerRow.appendChild(thVal);
    const thAct = document.createElement('th');
    thAct.textContent = '';
    thAct.style.width = '36px';
    headerRow.appendChild(thAct);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');

    rows.forEach((row, rowIdx) => {
        const tr = document.createElement('tr');

        // Special row types
        if (row.isAddArrayItem) {
            tr.className = 'add-row';
            const td = document.createElement('td');
            td.colSpan = numKeyCols + 2;
            const btn = document.createElement('button');
            btn.textContent = '+ Add Item';
            btn.onclick = () => addArrayItem(row.dataPath, row.schema);
            td.appendChild(btn);
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        if (row.isAddProperty) {
            tr.className = 'add-row';
            const td = document.createElement('td');
            td.colSpan = numKeyCols + 2;
            const btn = document.createElement('button');
            btn.textContent = '+ Add Property';
            btn.onclick = () => {
                const obj = row.dataPath.length > 0 ? getByPath(currentData, row.dataPath) : currentData;
                showAddPropertyModal(obj, row.dataPath, row.schema, () => renderTable());
            };
            td.appendChild(btn);
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        if (row.isAddTemplateField) {
            tr.className = 'add-row';
            // Render key cells for context
            for (let col = 0; col < numKeyCols; col++) {
                const cellInfo = matrix[rowIdx][col];
                if (cellInfo && cellInfo.render) {
                    const td = document.createElement('td');
                    if (cellInfo.rowspan > 1) td.rowSpan = cellInfo.rowspan;
                    if (cellInfo.label !== null) {
                        td.className = `key-cell depth-${Math.min(col, 4)}`;
                        td.textContent = cellInfo.label;
                    } else {
                        td.className = 'empty-cell';
                    }
                    tr.appendChild(td);
                }
            }
            const tdVal = document.createElement('td');
            tdVal.colSpan = 2;
            const btn = document.createElement('button');
            btn.textContent = `+ Add`;
            btn.onclick = () => {
                const parent = getByPath(currentData, row.parentDataPath);
                const fieldSchema = row.parentSchema[row.templateKey];
                if (isMetaField(fieldSchema)) {
                    parent[row.templateKey] = getDefaultForType(fieldSchema);
                } else {
                    parent[row.templateKey] = buildDefaultObject(fieldSchema);
                }
                renderTable();
            };
            tdVal.appendChild(btn);
            tr.appendChild(tdVal);
            tbody.appendChild(tr);
            return;
        }

        // Regular data row: render key cells
        for (let col = 0; col < numKeyCols; col++) {
            const cellInfo = matrix[rowIdx][col];
            if (cellInfo && cellInfo.render) {
                const td = document.createElement('td');
                if (cellInfo.rowspan > 1) td.rowSpan = cellInfo.rowspan;
                if (cellInfo.label !== null) {
                    td.className = `key-cell depth-${Math.min(col, 4)}`;
                    // Check if it's an array index
                    if (typeof cellInfo.label === 'string' && cellInfo.label.startsWith('#')) {
                        td.classList.add('is-array-idx');
                    }
                    td.textContent = cellInfo.label;
                } else {
                    td.className = 'empty-cell';
                }
                tr.appendChild(td);
            }
        }

        // Value cell
        const tdVal = document.createElement('td');
        tdVal.className = 'value-cell';
        // If the row's path is shorter than numKeyCols, the value cell should span remaining cols
        const pathLen = row.displayPath ? row.displayPath.length : 0;
        if (pathLen < numKeyCols) {
            // This shouldn't happen for leaf rows normally, but handle edge cases
        }

        if (row.isEmpty) {
            tdVal.innerHTML = '<span style="color: #999; font-style: italic;">empty</span>';
        } else if (row.isLeaf) {
            tdVal.appendChild(buildValueInput(row));
        }
        tr.appendChild(tdVal);

        // Actions cell
        const tdAct = document.createElement('td');
        tdAct.className = 'actions-cell';
        if (row.isLeaf && !row.isEmpty) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Remove';
            delBtn.onclick = () => {
                const key = row.dataPath[row.dataPath.length - 1];
                if (confirm(`Remove "${key}"?`)) {
                    removeByPath(currentData, row.dataPath);
                    renderTable();
                }
            };
            tdAct.appendChild(delBtn);
        }
        tr.appendChild(tdAct);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableContainer.appendChild(table);
}

// ─── Build value input for a row ─────────────────────────────────────────────
function buildValueInput(row) {
    const schema = row.schema;
    const value = row.value;
    const dataPath = row.dataPath;

    // Template-aware field
    if (schema && isMetaField(schema)) {
        return buildMetaInput(value, dataPath, schema);
    }

    // Plain value
    const input = document.createElement('input');
    if (typeof value === 'boolean') {
        input.type = 'text';
        input.value = value.toString();
        input.placeholder = 'true / false';
    } else if (typeof value === 'number') {
        input.type = 'number';
        input.value = value;
        input.step = 'any';
    } else {
        input.type = 'text';
        input.value = value ?? '';
    }
    input.oninput = () => { setByPath(currentData, dataPath, parseInputValue(input.value)); };
    return input;
}

// ─── Build meta-aware input ──────────────────────────────────────────────────
function buildMetaInput(value, dataPath, schema) {
    const type = schema._type;

    if (type === 'enum') {
        const select = document.createElement('select');
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- select --';
        select.appendChild(emptyOpt);
        (schema._options || []).forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (String(value) === String(opt)) o.selected = true;
            select.appendChild(o);
        });
        select.onchange = () => { setByPath(currentData, dataPath, select.value); };
        return select;
    }

    if (type === 'boolean') {
        const wrap = document.createElement('div');
        wrap.className = 'toggle-wrap';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.className = 'toggle-checkbox';
        toggle.checked = !!value;
        toggle.id = `toggle-${dataPath.join('-')}`;
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-label';
        toggleLabel.htmlFor = toggle.id;
        toggleLabel.textContent = value ? 'Yes' : 'No';
        toggle.onchange = () => {
            setByPath(currentData, dataPath, toggle.checked);
            toggleLabel.textContent = toggle.checked ? 'Yes' : 'No';
            renderTable();
        };
        wrap.appendChild(toggle);
        wrap.appendChild(toggleLabel);
        return wrap;
    }

    if (type === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.value = value ?? '';
        if (schema._min !== undefined) input.min = schema._min;
        if (schema._max !== undefined) input.max = schema._max;
        if (schema._placeholder) input.placeholder = schema._placeholder;
        input.oninput = () => {
            const v = input.value;
            setByPath(currentData, dataPath, v === '' ? null : Number(v));
        };

        if (schema._unit) {
            const wrap = document.createElement('span');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '4px';
            wrap.appendChild(input);
            const badge = document.createElement('span');
            badge.className = 'unit-badge';
            badge.textContent = schema._unit;
            wrap.appendChild(badge);
            return wrap;
        }
        return input;
    }

    if (type === 'date') {
        const input = document.createElement('input');
        input.type = 'date';
        input.value = value || '';
        input.oninput = () => { setByPath(currentData, dataPath, input.value); };
        return input;
    }

    // Default: string
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? '';
    if (schema._placeholder) input.placeholder = schema._placeholder;
    if (schema._pattern) input.pattern = schema._pattern;
    input.oninput = () => { setByPath(currentData, dataPath, input.value); };

    if (schema._unit) {
        const wrap = document.createElement('span');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '4px';
        wrap.appendChild(input);
        const badge = document.createElement('span');
        badge.className = 'unit-badge';
        badge.textContent = schema._unit;
        wrap.appendChild(badge);
        return wrap;
    }
    return input;
}

// ─── Add array item ──────────────────────────────────────────────────────────
function addArrayItem(dataPath, schema) {
    const arr = getByPath(currentData, dataPath);
    if (!Array.isArray(arr)) return;

    const itemSchema = schema ? schema._item : null;
    if (itemSchema) {
        const newItem = {};
        Object.entries(itemSchema).forEach(([k, v]) => {
            if (k.startsWith('_')) return;
            newItem[k] = isMetaField(v) ? getDefaultForType(v) : '';
        });
        arr.push(newItem);
    } else if (arr.length > 0 && typeof arr[0] === 'object') {
        const tmpl = {};
        Object.keys(arr[0]).forEach((k) => (tmpl[k] = ''));
        arr.push(tmpl);
    } else {
        arr.push('');
    }
    renderTable();
}

// ─── Add Property Modal ─────────────────────────────────────────────────────
function showAddPropertyModal(obj, path, parentSchema, redraw) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-inline';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
        <h3>Add Property</h3>
        <label>Property name:</label>
        <input type="text" id="add-prop-name" placeholder="e.g. firmware_version">
        <label>Data type:</label>
        <select id="add-prop-type">
            <option value="string">String (Text)</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean (Yes/No)</option>
            <option value="enum">Enum (Dropdown)</option>
            <option value="date">Date</option>
            <option value="object">Object (Section)</option>
            <option value="array">Array (List of objects)</option>
            <option value="string-array">String Array (List of values)</option>
        </select>
        <div class="modal-actions">
            <button class="btn-secondary" id="add-prop-cancel">Cancel</button>
            <button class="btn-primary" id="add-prop-ok">Add</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const nameInput = modal.querySelector('#add-prop-name');
    const typeSelect = modal.querySelector('#add-prop-type');

    nameInput.focus();

    const close = () => overlay.remove();

    modal.querySelector('#add-prop-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const doAdd = () => {
        const key = nameInput.value.trim();
        if (!key) return showToast('Name required', 'error');

        const target = path.length > 0 ? getByPath(currentData, path) : obj;
        if (target[key] !== undefined) return showToast('Property already exists', 'error');

        const type = typeSelect.value;

        switch (type) {
            case 'number': target[key] = null; break;
            case 'boolean': target[key] = false; break;
            case 'object': target[key] = {}; break;
            case 'array': target[key] = []; break;
            case 'string-array': target[key] = []; break;
            case 'enum': target[key] = ''; break;
            case 'date': target[key] = ''; break;
            default: target[key] = '';
        }
        close();
        redraw();
    };

    modal.querySelector('#add-prop-ok').onclick = doAdd;
    nameInput.onkeydown = (e) => { if (e.key === 'Enter') doAdd(); };
}

// ─── Save ────────────────────────────────────────────────────────────────────
async function saveProduct() {
    if (!currentFile) return;

    // Template save
    if (editingTemplate) {
        try {
            jsYamlLiteParse(yamlRaw.value); // validate
        } catch (e) {
            return showToast('Invalid YAML: ' + e.message, 'error');
        }
        const result = await api(`/api/templates/${encodeURIComponent(currentFile)}`, {
            method: 'PUT',
            body: JSON.stringify({ raw: yamlRaw.value }),
        });
        if (result.success) {
            showToast('Template saved!');
            loadTemplates();
            loadTemplateListSidebar();
        } else {
            showToast('Error: ' + result.error, 'error');
        }
        return;
    }

    // Product save
    let dataToSave;
    if (isYamlView) {
        try {
            const parsed = jsYamlLiteParse(yamlRaw.value);
            dataToSave = parsed;
            currentData = parsed;
        } catch (e) {
            return showToast('Invalid YAML: ' + e.message, 'error');
        }
    } else {
        dataToSave = currentData;
    }

    const result = await api(`/api/products/${encodeURIComponent(currentFile)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: dataToSave }),
    });

    if (result.success) {
        showToast('Saved successfully!');
        yamlRaw.value = result.raw;
        loadFileList();
    } else {
        showToast('Error: ' + result.error, 'error');
    }
}

// Load js-yaml from CDN
let jsYamlLiteParse = null;
(function loadJsYaml() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
    script.onload = () => { jsYamlLiteParse = window.jsyaml.load; };
    document.head.appendChild(script);
})();

// ─── Delete ──────────────────────────────────────────────────────────────────
async function deleteProduct() {
    if (!currentFile) return;

    // Template delete
    if (editingTemplate) {
        if (!confirm(`Delete template "${currentFile}"? This cannot be undone.`)) return;
        const result = await api(`/api/templates/${encodeURIComponent(currentFile)}`, { method: 'DELETE' });
        if (result.success) {
            showToast('Template deleted.');
            currentFile = null;
            editingTemplate = false;
            editorArea.classList.add('hidden');
            emptyState.classList.remove('hidden');
            btnToggle.disabled = false;
            loadTemplates();
            loadTemplateListSidebar();
        } else {
            showToast('Error: ' + result.error, 'error');
        }
        return;
    }

    // Product delete
    if (!confirm(`Delete "${currentFile}"? This cannot be undone.`)) return;

    const result = await api(`/api/products/${encodeURIComponent(currentFile)}`, { method: 'DELETE' });
    if (result.success) {
        showToast('Deleted.');
        currentFile = null;
        currentData = null;
        currentTemplate = null;
        editorArea.classList.add('hidden');
        emptyState.classList.remove('hidden');
        loadFileList();
    } else {
        showToast('Error: ' + result.error, 'error');
    }
}

// ─── Toggle view ─────────────────────────────────────────────────────────────
function toggleView() {
    isYamlView = !isYamlView;
    if (isYamlView) {
        try {
            yamlRaw.value = window.jsyaml.dump(currentData, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false });
        } catch (_) { }
        tableView.classList.add('hidden');
        yamlView.classList.remove('hidden');
        btnToggle.textContent = 'Table View';
    } else {
        try {
            currentData = window.jsyaml.load(yamlRaw.value);
            renderTable();
        } catch (e) {
            showToast('Invalid YAML, staying in YAML view', 'error');
            isYamlView = true;
            return;
        }
        yamlView.classList.add('hidden');
        tableView.classList.remove('hidden');
        btnToggle.textContent = 'YAML View';
    }
}

// ─── New product modal ───────────────────────────────────────────────────────
function showNewModal() {
    newFilenameInput.value = '';
    templateSelect.value = '';
    modalOverlay.classList.remove('hidden');
    newFilenameInput.focus();
}
function hideModal() {
    modalOverlay.classList.add('hidden');
}

async function createProduct() {
    const filename = newFilenameInput.value.trim();
    if (!filename) return showToast('Please enter a filename', 'error');

    let data;
    const selectedTemplate = templateSelect.value;

    if (selectedTemplate) {
        const tplResult = await api(`/api/templates/${encodeURIComponent(selectedTemplate)}`);
        if (tplResult.defaults) {
            data = tplResult.defaults;
            data._template = selectedTemplate;
        } else {
            data = { _template: selectedTemplate, product: { id: '', name: '', category: '', status: 'draft' } };
        }
    } else {
        data = { product: { id: '', name: '', category: '', manufacturer: '', status: 'draft' } };
    }

    const result = await api('/api/products', {
        method: 'POST',
        body: JSON.stringify({ filename, data }),
    });

    if (result.success) {
        hideModal();
        showToast('Product created!');
        await loadFileList();
        loadProduct(result.filename);
    } else {
        showToast(result.error, 'error');
    }
}

// ─── Event listeners ─────────────────────────────────────────────────────────
btnSave.onclick = saveProduct;
btnDelete.onclick = deleteProduct;
btnToggle.onclick = toggleView;
btnNew.onclick = showNewModal;
btnAddRoot.onclick = () => {
    showAddPropertyModal(currentData, [], currentTemplate, () => renderTable());
};
modalCancel.onclick = hideModal;
modalCreate.onclick = createProduct;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) hideModal(); };
newFilenameInput.onkeydown = (e) => { if (e.key === 'Enter') createProduct(); };

// Template modal
btnNewTemplate.onclick = () => {
    newTemplateFilename.value = '';
    modalOverlayTemplate.classList.remove('hidden');
    newTemplateFilename.focus();
};
modalTemplateCancel.onclick = () => modalOverlayTemplate.classList.add('hidden');
modalOverlayTemplate.onclick = (e) => { if (e.target === modalOverlayTemplate) modalOverlayTemplate.classList.add('hidden'); };
modalTemplateCreate.onclick = createTemplate;
newTemplateFilename.onkeydown = (e) => { if (e.key === 'Enter') createTemplate(); };

async function createTemplate() {
    const filename = newTemplateFilename.value.trim();
    if (!filename) return showToast('Please enter a filename', 'error');
    const result = await api('/api/templates', {
        method: 'POST',
        body: JSON.stringify({ filename }),
    });
    if (result.success) {
        modalOverlayTemplate.classList.add('hidden');
        showToast('Template created!');
        await loadTemplates();
        await loadTemplateListSidebar();
        loadTemplateForEdit(result.filename);
    } else {
        showToast(result.error, 'error');
    }
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProduct();
    }
});

// ─── Init ────────────────────────────────────────────────────────────────────
(async function init() {
    await loadTemplates();
    await loadFileList();
    await loadTemplateListSidebar();
})();
