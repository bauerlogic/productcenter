// ─── State ───────────────────────────────────────────────────────────────────
let currentFile = null;
let currentData = null;
let isYamlView = false;

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
    setTimeout(() => toast.className = 'hidden', 2500);
}

// ─── Load file list ──────────────────────────────────────────────────────────
async function loadFileList() {
    const products = await api('/api/products');
    fileList.innerHTML = '';
    products.forEach(p => {
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

    emptyState.classList.add('hidden');
    editorArea.classList.remove('hidden');
    editorTitle.textContent = currentData?.product?.name || filename;

    // Reset to form view
    isYamlView = false;
    formView.classList.remove('hidden');
    yamlView.classList.add('hidden');
    btnToggle.textContent = 'YAML View';

    renderForm(currentData);
    yamlRaw.value = result.raw;

    // Update active state in sidebar
    document.querySelectorAll('#file-list li').forEach(li => {
        li.classList.toggle('active', li.dataset.filename === filename);
    });
}

// ─── Render dynamic form ─────────────────────────────────────────────────────
function renderForm(data) {
    formContainer.innerHTML = '';
    if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, value]) => {
            formContainer.appendChild(buildSection(key, value, [key]));
        });
    }
    // Add "add top-level key" button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Top-Level Key';
    addBtn.style.marginTop = '8px';
    addBtn.onclick = () => promptAddKey(data, [], () => renderForm(data));
    formContainer.appendChild(addBtn);
}

function buildSection(key, value, path) {
    const section = document.createElement('div');
    section.className = 'form-section';

    const header = document.createElement('div');
    header.className = 'section-header';

    const title = document.createElement('h3');
    title.textContent = key;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'section-actions';

    // Delete this key
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${key}"`;
    delBtn.onclick = () => {
        if (confirm(`Remove "${key}" and all its contents?`)) {
            removeByPath(currentData, path);
            renderForm(currentData);
        }
    };
    actions.appendChild(delBtn);
    header.appendChild(actions);
    section.appendChild(header);

    const content = document.createElement('div');

    if (Array.isArray(value)) {
        content.appendChild(buildArrayEditor(value, path, key));
    } else if (value !== null && typeof value === 'object') {
        content.appendChild(buildObjectEditor(value, path));
    } else {
        content.appendChild(buildFieldRow(key, value, path));
    }

    section.appendChild(content);
    return section;
}

function buildObjectEditor(obj, path) {
    const container = document.createElement('div');

    Object.entries(obj).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            const sub = document.createElement('div');
            sub.className = 'nested-section';
            const subHeader = document.createElement('div');
            subHeader.className = 'section-header';
            const subTitle = document.createElement('h3');
            subTitle.textContent = key;
            subTitle.style.fontSize = '13px';
            subHeader.appendChild(subTitle);

            const subActions = document.createElement('div');
            subActions.className = 'section-actions';
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.innerHTML = '&times;';
            delBtn.title = `Remove "${key}"`;
            delBtn.onclick = () => {
                if (confirm(`Remove "${key}"?`)) {
                    removeByPath(currentData, [...path, key]);
                    renderForm(currentData);
                }
            };
            subActions.appendChild(delBtn);
            subHeader.appendChild(subActions);

            sub.appendChild(subHeader);
            sub.appendChild(buildArrayEditor(value, [...path, key], key));
            container.appendChild(sub);
        } else if (value !== null && typeof value === 'object') {
            const sub = document.createElement('div');
            sub.className = 'nested-section';
            const subHeader = document.createElement('div');
            subHeader.className = 'section-header';
            const subTitle = document.createElement('h3');
            subTitle.textContent = key;
            subTitle.style.fontSize = '13px';
            subHeader.appendChild(subTitle);

            const subActions = document.createElement('div');
            subActions.className = 'section-actions';
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon';
            delBtn.innerHTML = '&times;';
            delBtn.title = `Remove "${key}"`;
            delBtn.onclick = () => {
                if (confirm(`Remove "${key}"?`)) {
                    removeByPath(currentData, [...path, key]);
                    renderForm(currentData);
                }
            };
            subActions.appendChild(delBtn);
            subHeader.appendChild(subActions);

            sub.appendChild(subHeader);
            sub.appendChild(buildObjectEditor(value, [...path, key]));
            container.appendChild(sub);
        } else {
            container.appendChild(buildFieldRow(key, value, [...path, key]));
        }
    });

    // Add new property button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Property';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => promptAddKey(getByPath(currentData, path), path, () => renderForm(currentData));
    container.appendChild(addBtn);

    return container;
}

function buildArrayEditor(arr, path, label) {
    const container = document.createElement('div');

    arr.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'array-item';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-icon btn-small remove-array-item';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove item';
            removeBtn.onclick = () => {
                arr.splice(index, 1);
                renderForm(currentData);
            };
            wrapper.appendChild(removeBtn);
            wrapper.appendChild(buildObjectEditor(item, [...path, index]));
            container.appendChild(wrapper);
        } else {
            const row = document.createElement('div');
            row.className = 'field-row';

            const label = document.createElement('label');
            label.textContent = `[${index}]`;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = item ?? '';
            input.oninput = () => {
                arr[index] = parseInputValue(input.value);
            };

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-icon';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => {
                arr.splice(index, 1);
                renderForm(currentData);
            };

            row.appendChild(label);
            row.appendChild(input);
            row.appendChild(removeBtn);
            container.appendChild(row);
        }
    });

    // Add item button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Item';
    addBtn.style.marginTop = '4px';
    addBtn.onclick = () => {
        // Determine template from existing items
        if (arr.length > 0 && typeof arr[0] === 'object') {
            const template = {};
            Object.keys(arr[0]).forEach(k => template[k] = '');
            arr.push(template);
        } else {
            arr.push('');
        }
        renderForm(currentData);
    };
    container.appendChild(addBtn);

    return container;
}

function buildFieldRow(key, value, path) {
    const row = document.createElement('div');
    row.className = 'field-row';

    const label = document.createElement('label');
    label.textContent = key;

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

    input.oninput = () => {
        setByPath(currentData, path, parseInputValue(input.value));
    };

    // Delete field button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Remove "${key}"`;
    delBtn.onclick = () => {
        removeByPath(currentData, path);
        renderForm(currentData);
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

// ─── Add key prompt ──────────────────────────────────────────────────────────
function promptAddKey(obj, path, redraw) {
    const key = prompt('Property name:');
    if (!key || key.trim() === '') return;

    const type = prompt('Type: string, number, boolean, object, array, string-array', 'string');
    const target = path.length > 0 ? getByPath(currentData, path) : obj;

    switch (type) {
        case 'number':
            target[key] = 0;
            break;
        case 'boolean':
            target[key] = false;
            break;
        case 'object':
            target[key] = {};
            break;
        case 'array':
            target[key] = [{}];
            break;
        case 'string-array':
            target[key] = [''];
            break;
        default:
            target[key] = '';
    }
    redraw();
}

// ─── Save ────────────────────────────────────────────────────────────────────
async function saveProduct() {
    if (!currentFile) return;

    let dataToSave;
    if (isYamlView) {
        // Parse from raw YAML textarea
        try {
            // We'll send raw YAML to be parsed server-side
            // Actually, let's parse on client for validation
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

// Minimal YAML parse via server round-trip — or we use a trick:
// We send the raw text to the server to parse. Let's add that endpoint.
// Actually, for simplicity, we load js-yaml from CDN.
// Let's add a script tag dynamically.
let jsYamlLiteParse = null;

(function loadJsYaml() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js';
    script.onload = () => {
        jsYamlLiteParse = window.jsyaml.load;
    };
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
        // Sync form data → raw YAML
        try {
            yamlRaw.value = window.jsyaml.dump(currentData, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false });
        } catch (_) { }
        formView.classList.add('hidden');
        yamlView.classList.remove('hidden');
        btnToggle.textContent = 'Form View';
    } else {
        // Sync raw YAML → form data
        try {
            currentData = window.jsyaml.load(yamlRaw.value);
            renderForm(currentData);
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
    modalOverlay.classList.remove('hidden');
    newFilenameInput.focus();
}
function hideModal() {
    modalOverlay.classList.add('hidden');
}

async function createProduct() {
    const filename = newFilenameInput.value.trim();
    if (!filename) return showToast('Please enter a filename', 'error');

    const result = await api('/api/products', {
        method: 'POST',
        body: JSON.stringify({
            filename,
            data: {
                product: {
                    id: '',
                    name: '',
                    category: '',
                    manufacturer: '',
                    status: 'draft',
                    general: {},
                    ports: [],
                    network: {},
                    management: {},
                    security: {},
                    power: {},
                    physical: {},
                    environmental: {},
                    certifications: [],
                    documents: [],
                }
            }
        }),
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

// Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProduct();
    }
});

// ─── Init ────────────────────────────────────────────────────────────────────
loadFileList();
