// ─── State ───────────────────────────────────────────────────────────────────
let currentFile = null;
let currentData = null;
let currentTemplate = null; // the full template schema
let templates = [];         // list of available templates
let isYamlView = false;

// ─── Utilities ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const fileList = document.getElementById('file-list');
const editorArea = document.getElementById('editor');
const emptyState = document.getElementById('empty-state');
const editorTitle = document.getElementById('editor-title');
const formContainer = document.getElementById('form-container');
const formView = document.getElementById('form-view');
const yamlView = document.getElementById('yaml-view');
const yamlRaw = document.getElementById('yaml-raw');
const btnSave = document.getElementById('btn-save');
const btnDelete = document.getElementById('btn-delete');
const btnToggle = document.getElementById('btn-toggle-view');
const btnNew = document.getElementById('btn-new');
const toast = document.getElementById('toast');
const modalOverlay = document.getElementById('modal-overlay');
const modalCreate = document.getElementById('modal-create');
const modalCancel = document.getElementById('modal-cancel');
const newFilenameInput = document.getElementById('new-filename');
const templateSelect = document.getElementById('template-select');

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
        if (currentFile === p.filename) li.classList.add('active');
        li.onclick = () => loadProduct(p.filename);
        fileList.appendChild(li);
    });
}

// ─── Load a product ──────────────────────────────────────────────────────────
async function loadProduct(filename) {
    const result = await api(`/api/products/${encodeURIComponent(filename)}`);
    if (result.error) return showToast(result.error, 'error');

    currentFile = filename;
    currentData = result.data;

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
    formView.classList.remove('hidden');
    yamlView.classList.add('hidden');
    btnToggle.textContent = 'YAML View';

    renderForm(currentData, currentTemplate);
    yamlRaw.value = result.raw;

    document.querySelectorAll('#file-list li').forEach((li) => {
        li.classList.toggle('active', li.dataset.filename === filename);
    });
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

function addFieldFromSchema(target, key, fieldSchema) {
    if (!fieldSchema) { target[key] = ''; return; }
    if (isMetaField(fieldSchema)) {
        target[key] = getDefaultForType(fieldSchema);
    } else {
        const obj = {};
        Object.entries(fieldSchema).forEach(([k, v]) => {
            if (k.startsWith('_')) return;
            if (isMetaField(v)) {
                obj[k] = getDefaultForType(v);
            } else if (v && typeof v === 'object') {
                obj[k] = buildDefaultObject(v);
            }
        });
        target[key] = obj;
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

// ─── Render dynamic form ─────────────────────────────────────────────────────
function renderForm(data, schema) {
    formContainer.innerHTML = '';
    if (data && typeof data === 'object') {
        let topIdx = 0;
        Object.entries(data).forEach(([key, value]) => {
            const fieldSchema = schema ? schema[key] : null;
            topIdx++;
            formContainer.appendChild(buildSection(key, value, [key], fieldSchema, String(topIdx)));
        });
    }

    // Show template fields not yet in data
    if (schema) {
        Object.keys(schema).forEach((key) => {
            if (key.startsWith('_')) return;
            if (data && key in data) return;
            const btn = document.createElement('button');
            btn.className = 'btn-secondary btn-small btn-add-template-field';
            btn.textContent = `+ Add "${getLabel(schema[key], key)}"`;
            btn.onclick = () => {
                addFieldFromSchema(data, key, schema[key]);
                renderForm(data, schema);
            };
            formContainer.appendChild(btn);
        });
    }

    // Free-form add
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Custom Property';
    addBtn.style.marginTop = '8px';
    addBtn.onclick = () => showAddPropertyModal(data, [], schema, () => renderForm(data, schema));
    formContainer.appendChild(addBtn);
}

// ─── Build section ───────────────────────────────────────────────────────────
function buildSection(key, value, path, fieldSchema, sectionNum) {
    const section = document.createElement('div');
    section.className = 'form-section';

    const header = document.createElement('div');
    header.className = 'section-header';

    const title = document.createElement('h3');
    const numSpan = sectionNum ? `<span class="section-num">${sectionNum}</span> ` : '';
    title.innerHTML = numSpan + escapeHtml(getLabel(fieldSchema, key));
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'section-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${key}"`;
    delBtn.onclick = () => {
        if (confirm(`Remove "${key}" and all its contents?`)) {
            removeByPath(currentData, path);
            renderForm(currentData, currentTemplate);
        }
    };
    actions.appendChild(delBtn);
    header.appendChild(actions);
    section.appendChild(header);

    const content = document.createElement('div');

    if (isMetaField(fieldSchema) && fieldSchema._type === 'array') {
        content.appendChild(buildArrayEditor(Array.isArray(value) ? value : [], path, key, fieldSchema));
    } else if (isMetaField(fieldSchema) && fieldSchema._type === 'string-array') {
        content.appendChild(buildStringArrayEditor(Array.isArray(value) ? value : [], path, fieldSchema));
    } else if (isMetaField(fieldSchema)) {
        content.appendChild(buildMetaFieldRow(key, value, path, fieldSchema));
    } else if (Array.isArray(value)) {
        content.appendChild(buildArrayEditor(value, path, key, fieldSchema));
    } else if (value !== null && typeof value === 'object') {
        content.appendChild(buildObjectEditor(value, path, fieldSchema, sectionNum));
    } else {
        content.appendChild(buildFieldRow(key, value, path, fieldSchema));
    }

    section.appendChild(content);
    return section;
}

// ─── Build object editor ─────────────────────────────────────────────────────
function buildObjectEditor(obj, path, parentSchema, parentNum) {
    const container = document.createElement('div');
    let subIdx = 0;

    Object.entries(obj).forEach(([key, value]) => {
        const fieldSchema = parentSchema ? parentSchema[key] : null;

        // Check _visible_if condition
        if (fieldSchema && fieldSchema._visible_if) {
            const condField = fieldSchema._visible_if.field;
            const condValue = fieldSchema._visible_if.value;
            if (obj[condField] !== condValue) return;
        }

        if (isMetaField(fieldSchema)) {
            if (fieldSchema._type === 'array') {
                subIdx++;
                const subNum = parentNum ? `${parentNum}.${subIdx}` : String(subIdx);
                const sub = createSubSection(key, fieldSchema, path, subNum);
                sub.appendChild(buildArrayEditor(Array.isArray(value) ? value : [], [...path, key], key, fieldSchema));
                container.appendChild(sub);
            } else if (fieldSchema._type === 'string-array') {
                subIdx++;
                const subNum = parentNum ? `${parentNum}.${subIdx}` : String(subIdx);
                const sub = createSubSection(key, fieldSchema, path, subNum);
                sub.appendChild(buildStringArrayEditor(Array.isArray(value) ? value : [], [...path, key], fieldSchema));
                container.appendChild(sub);
            } else {
                container.appendChild(buildMetaFieldRow(key, value, [...path, key], fieldSchema));
            }
        } else if (Array.isArray(value)) {
            subIdx++;
            const subNum = parentNum ? `${parentNum}.${subIdx}` : String(subIdx);
            const sub = createSubSection(key, fieldSchema, path, subNum);
            // Check if it's a string array (all items are primitives or empty)
            const isStringArr = value.length === 0 || value.every(i => typeof i !== 'object');
            if (isStringArr && fieldSchema && fieldSchema._suggestions) {
                sub.appendChild(buildStringArrayEditor(value, [...path, key], fieldSchema));
            } else if (isStringArr && value.every(i => typeof i === 'string' || typeof i === 'number')) {
                sub.appendChild(buildStringArrayEditor(value, [...path, key], fieldSchema));
            } else {
                sub.appendChild(buildArrayEditor(value, [...path, key], key, fieldSchema));
            }
            container.appendChild(sub);
        } else if (value !== null && typeof value === 'object') {
            subIdx++;
            const subNum = parentNum ? `${parentNum}.${subIdx}` : String(subIdx);
            const sub = createSubSection(key, fieldSchema, path, subNum);
            sub.appendChild(buildObjectEditor(value, [...path, key], fieldSchema, subNum));
            container.appendChild(sub);
        } else {
            container.appendChild(buildFieldRow(key, value, [...path, key], fieldSchema));
        }
    });

    // Show template fields not yet present in this object
    if (parentSchema) {
        Object.keys(parentSchema).forEach((key) => {
            if (key.startsWith('_')) return;
            if (key in obj) return;

            const fieldSchema = parentSchema[key];

            // Check _visible_if
            if (fieldSchema && fieldSchema._visible_if) {
                const condField = fieldSchema._visible_if.field;
                const condValue = fieldSchema._visible_if.value;
                if (obj[condField] !== condValue) return;
            }

            const btn = document.createElement('button');
            btn.className = 'btn-secondary btn-small btn-add-template-field';
            btn.textContent = `+ ${getLabel(fieldSchema, key)}`;
            btn.onclick = () => {
                addFieldFromSchema(obj, key, fieldSchema);
                renderForm(currentData, currentTemplate);
            };
            container.appendChild(btn);
        });
    }

    // Free-form add
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Property';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => showAddPropertyModal(getByPath(currentData, path), path, parentSchema, () => renderForm(currentData, currentTemplate));
    container.appendChild(addBtn);

    return container;
}

function createSubSection(key, fieldSchema, parentPath, sectionNum) {
    const sub = document.createElement('div');
    sub.className = 'nested-section';

    const subHeader = document.createElement('div');
    subHeader.className = 'section-header';

    const subTitle = document.createElement('h3');
    const numSpan = sectionNum ? `<span class="section-num">${sectionNum}</span> ` : '';
    subTitle.innerHTML = numSpan + escapeHtml(getLabel(fieldSchema, key));
    subHeader.appendChild(subTitle);

    const subActions = document.createElement('div');
    subActions.className = 'section-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${key}"`;
    delBtn.onclick = () => {
        if (confirm(`Remove "${key}"?`)) {
            removeByPath(currentData, [...parentPath, key]);
            renderForm(currentData, currentTemplate);
        }
    };
    subActions.appendChild(delBtn);
    subHeader.appendChild(subActions);
    sub.appendChild(subHeader);
    return sub;
}

// ─── Build array editor ──────────────────────────────────────────────────────
function buildArrayEditor(arr, path, label, fieldSchema) {
    const container = document.createElement('div');
    const itemSchema = fieldSchema ? fieldSchema._item : null;

    arr.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'array-item';

            const itemHeader = document.createElement('div');
            itemHeader.className = 'array-item-header';

            const itemTitle = document.createElement('span');
            itemTitle.className = 'array-item-title';
            const displayVal = item.type || item.name || item.url || `#${index + 1}`;
            itemTitle.textContent = `${label} – ${displayVal}`;
            itemHeader.appendChild(itemTitle);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-icon btn-small';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove item';
            removeBtn.onclick = () => {
                arr.splice(index, 1);
                renderForm(currentData, currentTemplate);
            };
            itemHeader.appendChild(removeBtn);
            wrapper.appendChild(itemHeader);

            wrapper.appendChild(buildObjectEditor(item, [...path, index], itemSchema));
            container.appendChild(wrapper);
        } else {
            const row = document.createElement('div');
            row.className = 'field-row';

            const lbl = document.createElement('label');
            lbl.textContent = `[${index + 1}]`;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = item ?? '';
            input.oninput = () => { arr[index] = parseInputValue(input.value); };

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-icon';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => {
                arr.splice(index, 1);
                renderForm(currentData, currentTemplate);
            };

            row.appendChild(lbl);
            row.appendChild(input);
            row.appendChild(removeBtn);
            container.appendChild(row);
        }
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Item';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => {
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
        renderForm(currentData, currentTemplate);
    };
    container.appendChild(addBtn);

    return container;
}

// ─── Build string-array editor (with suggestions) ───────────────────────────
function buildStringArrayEditor(arr, path, fieldSchema) {
    const container = document.createElement('div');
    const suggestions = fieldSchema?._suggestions || [];

    arr.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'field-row';

        const lbl = document.createElement('label');
        lbl.textContent = `[${index + 1}]`;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = item ?? '';
        if (suggestions.length > 0) {
            const listId = `suggest-${path.join('-')}-${index}`;
            input.setAttribute('list', listId);
            const datalist = document.createElement('datalist');
            datalist.id = listId;
            suggestions.forEach((s) => {
                const opt = document.createElement('option');
                opt.value = s;
                datalist.appendChild(opt);
            });
            container.appendChild(datalist);
        }
        input.oninput = () => { arr[index] = input.value; };

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            arr.splice(index, 1);
            renderForm(currentData, currentTemplate);
        };

        row.appendChild(lbl);
        row.appendChild(input);
        row.appendChild(removeBtn);
        container.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Item';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => {
        arr.push('');
        renderForm(currentData, currentTemplate);
    };
    container.appendChild(addBtn);

    // Quick-add suggestion chips
    if (suggestions.length > 0) {
        const unused = suggestions.filter((s) => !arr.includes(s));
        if (unused.length > 0) {
            const suggestWrap = document.createElement('div');
            suggestWrap.className = 'suggestions-bar';
            const sugLabel = document.createElement('span');
            sugLabel.textContent = 'Suggestions: ';
            sugLabel.className = 'suggest-label';
            suggestWrap.appendChild(sugLabel);
            unused.forEach((s) => {
                const chip = document.createElement('button');
                chip.className = 'chip';
                chip.textContent = s;
                chip.onclick = () => {
                    arr.push(s);
                    renderForm(currentData, currentTemplate);
                };
                suggestWrap.appendChild(chip);
            });
            container.appendChild(suggestWrap);
        }
    }

    return container;
}

// ─── Build meta-aware field row ──────────────────────────────────────────────
function buildMetaFieldRow(key, value, path, fieldSchema) {
    const row = document.createElement('div');
    row.className = 'field-row';

    const label = document.createElement('label');
    label.textContent = getLabel(fieldSchema, key);
    if (fieldSchema._required) {
        const req = document.createElement('span');
        req.className = 'required-marker';
        req.textContent = ' *';
        label.appendChild(req);
    }

    let inputEl;
    const type = fieldSchema._type;

    if (type === 'enum') {
        inputEl = document.createElement('select');
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- select --';
        inputEl.appendChild(emptyOpt);
        (fieldSchema._options || []).forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (String(value) === String(opt)) o.selected = true;
            inputEl.appendChild(o);
        });
        inputEl.onchange = () => { setByPath(currentData, path, inputEl.value); };
    } else if (type === 'boolean') {
        inputEl = document.createElement('div');
        inputEl.className = 'toggle-wrap';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.className = 'toggle-checkbox';
        toggle.checked = !!value;
        toggle.id = `toggle-${path.join('-')}`;
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-label';
        toggleLabel.htmlFor = toggle.id;
        toggleLabel.textContent = value ? 'Yes' : 'No';
        toggle.onchange = () => {
            setByPath(currentData, path, toggle.checked);
            toggleLabel.textContent = toggle.checked ? 'Yes' : 'No';
            renderForm(currentData, currentTemplate);
        };
        inputEl.appendChild(toggle);
        inputEl.appendChild(toggleLabel);
    } else if (type === 'number') {
        inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.step = 'any';
        inputEl.value = value ?? '';
        if (fieldSchema._min !== undefined) inputEl.min = fieldSchema._min;
        if (fieldSchema._max !== undefined) inputEl.max = fieldSchema._max;
        if (fieldSchema._placeholder) inputEl.placeholder = fieldSchema._placeholder;
        inputEl.oninput = () => {
            const v = inputEl.value;
            setByPath(currentData, path, v === '' ? null : Number(v));
        };
    } else if (type === 'date') {
        inputEl = document.createElement('input');
        inputEl.type = 'date';
        inputEl.value = value || '';
        inputEl.oninput = () => { setByPath(currentData, path, inputEl.value); };
    } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.value = value ?? '';
        if (fieldSchema._placeholder) inputEl.placeholder = fieldSchema._placeholder;
        if (fieldSchema._pattern) inputEl.pattern = fieldSchema._pattern;
        inputEl.oninput = () => { setByPath(currentData, path, inputEl.value); };
    }

    // Unit badge
    let unitEl = null;
    if (fieldSchema._unit) {
        unitEl = document.createElement('span');
        unitEl.className = 'unit-badge';
        unitEl.textContent = fieldSchema._unit;
    }

    // Delete field button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${key}"`;
    delBtn.onclick = () => {
        removeByPath(currentData, path);
        renderForm(currentData, currentTemplate);
    };

    row.appendChild(label);
    row.appendChild(inputEl);
    if (unitEl) row.appendChild(unitEl);
    row.appendChild(delBtn);
    return row;
}

// ─── Build plain field row (no schema) ───────────────────────────────────────
function buildFieldRow(key, value, path, fieldSchema) {
    if (fieldSchema && isMetaField(fieldSchema)) {
        return buildMetaFieldRow(key, value, path, fieldSchema);
    }

    const row = document.createElement('div');
    row.className = 'field-row';

    const label = document.createElement('label');
    label.textContent = getLabel(fieldSchema, key);

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

    input.oninput = () => { setByPath(currentData, path, parseInputValue(input.value)); };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${key}"`;
    delBtn.onclick = () => {
        removeByPath(currentData, path);
        renderForm(currentData, currentTemplate);
    };

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(delBtn);
    return row;
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
        <div id="add-prop-extra" class="hidden">
            <label>Options (comma-separated):</label>
            <input type="text" id="add-prop-options" placeholder="e.g. option1, option2, option3">
        </div>
        <div id="add-prop-unit-row">
            <label>Unit (optional):</label>
            <input type="text" id="add-prop-unit" placeholder="e.g. W, mm, kg, °C">
        </div>
        <div class="modal-actions">
            <button class="btn-secondary" id="add-prop-cancel">Cancel</button>
            <button class="btn-primary" id="add-prop-ok">Add</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const nameInput = modal.querySelector('#add-prop-name');
    const typeSelect = modal.querySelector('#add-prop-type');
    const extraDiv = modal.querySelector('#add-prop-extra');

    nameInput.focus();

    typeSelect.onchange = () => {
        extraDiv.classList.toggle('hidden', typeSelect.value !== 'enum');
    };

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
        formView.classList.add('hidden');
        yamlView.classList.remove('hidden');
        btnToggle.textContent = 'Form View';
    } else {
        try {
            currentData = window.jsyaml.load(yamlRaw.value);
            renderForm(currentData, currentTemplate);
        } catch (e) {
            showToast('Invalid YAML, staying in YAML view', 'error');
            isYamlView = true;
            return;
        }
        yamlView.classList.add('hidden');
        formView.classList.remove('hidden');
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
modalCancel.onclick = hideModal;
modalCreate.onclick = createProduct;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) hideModal(); };
newFilenameInput.onkeydown = (e) => { if (e.key === 'Enter') createProduct(); };

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
})();
