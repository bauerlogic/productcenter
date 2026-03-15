// ─── State ───────────────────────────────────────────────────────────────────
let currentFile = null;
let currentData = null;
let isYamlView = false;
let searchFilter = '';
let isDirty = false;

// Domain suggestions for the dropdown
const DOMAIN_OPTIONS = [
    '', 'networking', 'fiber', 'power', 'mechanical', 'physical', 'environmental',
    'security', 'management', 'industrial', 'documentation', 'reliability', 'compliance'
];

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
const searchInput = document.getElementById('search-input');
const toast = document.getElementById('toast');
const modalOverlay = document.getElementById('modal-overlay');
const modalCreate = document.getElementById('modal-create');
const modalCancel = document.getElementById('modal-cancel');
const newFilenameInput = document.getElementById('new-filename');
const newNameInput = document.getElementById('new-name');
const newSourceLang = document.getElementById('new-source-lang');
const newTargetLang = document.getElementById('new-target-lang');

// Meta bar
const metaName = document.getElementById('meta-name');
const metaSourceLang = document.getElementById('meta-source-lang');
const metaTargetLang = document.getElementById('meta-target-lang');
const metaVersion = document.getElementById('meta-version');
const metaStatus = document.getElementById('meta-status');
const termCount = document.getElementById('term-count');

// ─── Utilities ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function markDirty() {
    if (!isDirty) {
        isDirty = true;
        btnSave.textContent = 'Save Changes';
        btnSave.classList.add('has-changes');
        btnSave.disabled = false;
    }
}

function markClean() {
    isDirty = false;
    btnSave.textContent = 'No Changes';
    btnSave.classList.remove('has-changes');
    btnSave.disabled = true;
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

// ─── Flatten terminology data ────────────────────────────────────────────────
// The YAML has categories as top-level keys (besides _meta),
// each containing an array of term objects.
// We flatten into: [{ category, source_term, target_term, domain, do_not_translate, context, notes }]

function flattenTerms(data) {
    const terms = [];
    if (!data) return terms;
    for (const [key, val] of Object.entries(data)) {
        if (key === '_meta') continue;
        if (Array.isArray(val)) {
            for (const item of val) {
                terms.push({
                    category: key,
                    source_term: item.source_term || '',
                    target_term: item.target_term || '',
                    domain: item.domain || '',
                    do_not_translate: !!item.do_not_translate,
                    context: item.context || '',
                    notes: item.notes || '',
                });
            }
        }
    }
    return terms;
}

// Rebuild structured data from flat term list
function rebuildData(meta, terms) {
    const data = { _meta: { ...meta } };
    const categories = {};
    for (const t of terms) {
        const cat = t.category || 'uncategorized';
        if (!categories[cat]) categories[cat] = [];
        const entry = {
            source_term: t.source_term,
            target_term: t.target_term,
        };
        if (t.domain) entry.domain = t.domain;
        entry.do_not_translate = t.do_not_translate;
        if (t.context) entry.context = t.context;
        if (t.notes) entry.notes = t.notes;
        categories[cat].push(entry);
    }
    for (const [cat, items] of Object.entries(categories)) {
        data[cat] = items;
    }
    return data;
}

// ─── Get current meta from UI ────────────────────────────────────────────────
function getCurrentMeta() {
    return {
        name: metaName.value,
        version: metaVersion.value,
        date: currentData?._meta?.date || new Date().toISOString().slice(0, 10),
        source_lang: metaSourceLang.value,
        target_lang: metaTargetLang.value,
        status: metaStatus.value,
    };
}

// ─── Get all terms from the table ────────────────────────────────────────────
function getTermsFromTable() {
    const terms = [];
    const rows = tableContainer.querySelectorAll('tr.term-row');
    rows.forEach(row => {
        terms.push({
            category: row.dataset.category || 'uncategorized',
            source_term: row.querySelector('.inp-source').value,
            target_term: row.querySelector('.inp-target').value,
            domain: row.querySelector('.sel-domain').value,
            do_not_translate: row.querySelector('.chk-dnt').checked,
            context: row.querySelector('.inp-context').value,
            notes: row.querySelector('.inp-notes').value,
        });
    });
    return terms;
}

// ─── Load file list ──────────────────────────────────────────────────────────
async function loadFileList() {
    const items = await api('/api/terminology');
    fileList.innerHTML = '';
    items.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `${escapeHtml(item.name)}<span class="file-id">${escapeHtml(item.filename)}</span>` +
            (item.source_lang && item.target_lang
                ? `<span class="lang-badge">${escapeHtml(item.source_lang)} → ${escapeHtml(item.target_lang)}</span>`
                : '');
        li.dataset.filename = item.filename;
        if (currentFile === item.filename) li.classList.add('active');
        li.onclick = () => loadFile(item.filename);
        fileList.appendChild(li);
    });
}

// ─── Load a file ─────────────────────────────────────────────────────────────
async function loadFile(filename) {
    const result = await api(`/api/terminology/${encodeURIComponent(filename)}`);
    if (result.error) return showToast(result.error, 'error');

    currentFile = filename;
    currentData = result.data;

    emptyState.classList.add('hidden');
    editorArea.classList.remove('hidden');
    editorTitle.textContent = currentData?._meta?.name || filename;

    // Fill meta bar
    const meta = currentData?._meta || {};
    metaName.value = meta.name || '';
    metaSourceLang.value = meta.source_lang || 'de';
    metaTargetLang.value = meta.target_lang || 'en';
    metaVersion.value = meta.version || '1.0';
    metaStatus.value = meta.status || 'draft';

    // Reset view
    isYamlView = false;
    tableView.classList.remove('hidden');
    yamlView.classList.add('hidden');
    btnToggle.textContent = 'YAML View';
    searchInput.value = '';
    searchFilter = '';

    renderTable();
    yamlRaw.value = result.raw;
    markClean();

    document.querySelectorAll('#file-list li').forEach(li => {
        li.classList.toggle('active', li.dataset.filename === filename);
    });
}

// ─── Render the terminology table ────────────────────────────────────────────
function renderTable() {
    const terms = flattenTerms(currentData);
    updateTermCount(terms.length);

    // Group by category
    const grouped = {};
    for (const t of terms) {
        const cat = t.category || 'uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(t);
    }

    const sourceLang = (currentData?._meta?.source_lang || 'DE').toUpperCase();
    const targetLang = (currentData?._meta?.target_lang || 'EN').toUpperCase();

    let html = `<table class="term-table">
        <thead><tr>
            <th class="col-source">Source (${escapeHtml(sourceLang)})</th>
            <th class="col-target">Target (${escapeHtml(targetLang)})</th>
            <th class="col-domain">Domain</th>
            <th class="col-dnt">DNT</th>
            <th class="col-context">Context</th>
            <th class="col-notes">Notes</th>
            <th class="col-actions"></th>
        </tr></thead>
        <tbody>`;

    for (const [cat, items] of Object.entries(grouped)) {
        // Category header row
        html += `<tr class="category-row" data-category="${escapeHtml(cat)}">
            <td colspan="6">
                <span class="category-name">
                    ${escapeHtml(cat)}
                    <span class="category-count">${items.length}</span>
                </span>
            </td>
            <td class="actions-cell">
                <span class="category-actions">
                    <button onclick="addTermToCategory('${escapeHtml(cat)}')" title="Add term">+</button>
                </span>
            </td>
        </tr>`;

        // Term rows
        items.forEach((t, idx) => {
            const dntClass = t.do_not_translate ? 'dnt-true' : '';
            html += `<tr class="term-row ${dntClass}" data-category="${escapeHtml(cat)}" data-idx="${idx}">
                <td><textarea class="inp-source auto-expand" rows="1">${escapeHtml(t.source_term)}</textarea></td>
                <td><textarea class="inp-target auto-expand" rows="1">${escapeHtml(t.target_term)}</textarea></td>
                <td>${buildDomainSelect(t.domain)}</td>
                <td><div class="toggle-wrap"><input type="checkbox" class="toggle-checkbox chk-dnt" ${t.do_not_translate ? 'checked' : ''} /></div></td>
                <td><textarea class="inp-context auto-expand" rows="1">${escapeHtml(t.context)}</textarea></td>
                <td><textarea class="inp-notes auto-expand" rows="1">${escapeHtml(t.notes)}</textarea></td>
                <td class="actions-cell"><button class="btn-icon" onclick="removeRow(this)" title="Delete">×</button></td>
            </tr>`;
        });
    }

    // Add new category row at the bottom
    html += `<tr class="add-row">
        <td colspan="7">
            <button onclick="addNewCategory()">+ Add Category</button>
        </td>
    </tr>`;

    html += '</tbody></table>';
    tableContainer.innerHTML = html;

    // Wire up DNT checkbox to toggle row class
    tableContainer.querySelectorAll('.chk-dnt').forEach(chk => {
        chk.addEventListener('change', () => {
            chk.closest('tr').classList.toggle('dnt-true', chk.checked);
            markDirty();
        });
    });

    // Auto-expand textareas
    tableContainer.querySelectorAll('textarea.auto-expand').forEach(ta => {
        autoResize(ta);
        ta.addEventListener('input', () => {
            autoResize(ta);
            markDirty();
        });
    });

    // Wire up domain selects
    tableContainer.querySelectorAll('.sel-domain').forEach(sel => {
        sel.addEventListener('change', () => markDirty());
    });

    // Apply search filter if active
    if (searchFilter) applyFilter(searchFilter);
}

function buildDomainSelect(current) {
    let html = '<select class="sel-domain">';
    for (const d of DOMAIN_OPTIONS) {
        const label = d || '—';
        const selected = d === current ? 'selected' : '';
        html += `<option value="${escapeHtml(d)}" ${selected}>${escapeHtml(label)}</option>`;
    }
    html += '</select>';
    return html;
}

function updateTermCount(count) {
    termCount.textContent = `${count} terms`;
}

// ─── Table actions ───────────────────────────────────────────────────────────

function addTermToCategory(category) {
    // Gather current terms, add a new blank one to the category, re-render
    const terms = getTermsFromTable();
    // Find last index of this category
    let insertIdx = -1;
    for (let i = terms.length - 1; i >= 0; i--) {
        if (terms[i].category === category) { insertIdx = i + 1; break; }
    }
    if (insertIdx === -1) insertIdx = terms.length;

    terms.splice(insertIdx, 0, {
        category,
        source_term: '',
        target_term: '',
        domain: '',
        do_not_translate: false,
        context: '',
        notes: '',
    });

    // Rebuild currentData so renderTable picks it up
    currentData = rebuildData(getCurrentMeta(), terms);
    renderTable();

    // Focus the new row's source input
    const rows = tableContainer.querySelectorAll(`tr.term-row[data-category="${category}"]`);
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
        const input = lastRow.querySelector('.inp-source');
        if (input) input.focus();
    }
}

function addNewCategory() {
    const name = prompt('Category name (e.g. fiber_optic, protocols):');
    if (!name || !name.trim()) return;
    const catKey = name.trim().replace(/\s+/g, '_').toLowerCase();

    const terms = getTermsFromTable();
    terms.push({
        category: catKey,
        source_term: '',
        target_term: '',
        domain: '',
        do_not_translate: false,
        context: '',
        notes: '',
    });

    currentData = rebuildData(getCurrentMeta(), terms);
    renderTable();
}

function removeRow(btn) {
    const row = btn.closest('tr');
    row.remove();
    // Update count
    const remaining = tableContainer.querySelectorAll('tr.term-row').length;
    updateTermCount(remaining);
}

// ─── Search / Filter ─────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
    searchFilter = searchInput.value.trim().toLowerCase();
    applyFilter(searchFilter);
});

function applyFilter(filter) {
    const rows = tableContainer.querySelectorAll('tr.term-row');
    const catRows = tableContainer.querySelectorAll('tr.category-row');
    const visibleCats = new Set();

    rows.forEach(row => {
        if (!filter) {
            row.classList.remove('filtered-out');
            visibleCats.add(row.dataset.category);
            return;
        }
        const source = row.querySelector('.inp-source').value.toLowerCase();
        const target = row.querySelector('.inp-target').value.toLowerCase();
        const domain = row.querySelector('.sel-domain').value.toLowerCase();
        const context = row.querySelector('.inp-context').value.toLowerCase();
        const notes = row.querySelector('.inp-notes').value.toLowerCase();
        const match = source.includes(filter) || target.includes(filter) ||
            domain.includes(filter) || context.includes(filter) || notes.includes(filter);
        row.classList.toggle('filtered-out', !match);
        if (match) visibleCats.add(row.dataset.category);
    });

    catRows.forEach(catRow => {
        catRow.classList.toggle('filtered-out', filter && !visibleCats.has(catRow.dataset.category));
    });
}

// ─── View toggle ─────────────────────────────────────────────────────────────
btnToggle.addEventListener('click', () => {
    isYamlView = !isYamlView;
    if (isYamlView) {
        // Sync table → YAML
        const terms = getTermsFromTable();
        const fullData = rebuildData(getCurrentMeta(), terms);
        yamlRaw.value = buildYamlString(fullData);

        tableView.classList.add('hidden');
        yamlView.classList.remove('hidden');
        btnToggle.textContent = 'Table View';
    } else {
        // Sync YAML → table (re-parse)
        try {
            const parsed = jsyamlLiteParse(yamlRaw.value);
            if (parsed) {
                currentData = parsed;
                const meta = currentData._meta || {};
                metaName.value = meta.name || '';
                metaSourceLang.value = meta.source_lang || '';
                metaTargetLang.value = meta.target_lang || '';
                metaVersion.value = meta.version || '';
                metaStatus.value = meta.status || 'draft';
            }
        } catch (e) {
            showToast('YAML parse error – keeping previous table state', 'error');
        }
        renderTable();
        tableView.classList.remove('hidden');
        yamlView.classList.add('hidden');
        btnToggle.textContent = 'YAML View';
    }
});

// Simple YAML builder (we send JSON to server, server does the YAML dump)
function buildYamlString(data) {
    // We'll use the server to format – for now just show a basic representation
    // Actually we'll do a quick local formatting for preview
    let lines = [];
    if (data._meta) {
        lines.push('_meta:');
        for (const [k, v] of Object.entries(data._meta)) {
            lines.push(`  ${k}: ${JSON.stringify(v)}`);
        }
        lines.push('');
    }
    for (const [key, val] of Object.entries(data)) {
        if (key === '_meta') continue;
        if (!Array.isArray(val)) continue;
        lines.push(`${key}:`);
        lines.push('');
        for (const item of val) {
            lines.push(`  - source_term: ${JSON.stringify(item.source_term)}`);
            lines.push(`    target_term: ${JSON.stringify(item.target_term)}`);
            if (item.domain) lines.push(`    domain: ${item.domain}`);
            lines.push(`    do_not_translate: ${item.do_not_translate}`);
            if (item.context) lines.push(`    context: ${JSON.stringify(item.context)}`);
            if (item.notes) lines.push(`    notes: ${JSON.stringify(item.notes)}`);
            lines.push('');
        }
    }
    return lines.join('\n');
}

// Minimal YAML-like parse (delegate to server for real parse but provide fallback)
function jsyamlLiteParse(yamlStr) {
    // We'll do an async parse via server round-trip, but for toggle we try a basic approach
    // Actually we just re-fetch. For now, store a flag and roundtrip on save.
    // Return null to keep current state
    return null;
}

// ─── Save ────────────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
    if (!currentFile) return;

    let dataToSave;
    if (isYamlView) {
        // Send raw YAML to a special endpoint or parse server-side
        // We'll re-use the PUT but send the whole structure
        // Actually: we can send raw and let the server re-parse? No, our PUT expects .data
        // Let's sync from YAML view by POSTing raw
        try {
            const res = await fetch(`/api/terminology/${encodeURIComponent(currentFile)}/raw`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw: yamlRaw.value }),
            });
            const result = await res.json();
            if (result.error) return showToast(result.error, 'error');
            showToast('Saved!');
            yamlRaw.value = result.raw || yamlRaw.value;
            markClean();
            loadFileList();
            return;
        } catch (e) {
            return showToast('Save failed: ' + e.message, 'error');
        }
    }

    // Table view: gather data
    const terms = getTermsFromTable();
    dataToSave = rebuildData(getCurrentMeta(), terms);

    const result = await api(`/api/terminology/${encodeURIComponent(currentFile)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: dataToSave }),
    });

    if (result.error) return showToast(result.error, 'error');
    showToast('Saved!');
    currentData = dataToSave;
    yamlRaw.value = result.raw || '';
    editorTitle.textContent = getCurrentMeta().name || currentFile;
    markClean();
    loadFileList();
});

// ─── Delete ──────────────────────────────────────────────────────────────────
btnDelete.addEventListener('click', async () => {
    if (!currentFile) return;
    if (!confirm(`Delete "${currentFile}"?`)) return;

    const result = await api(`/api/terminology/${encodeURIComponent(currentFile)}`, {
        method: 'DELETE',
    });
    if (result.error) return showToast(result.error, 'error');

    showToast('Deleted');
    currentFile = null;
    currentData = null;
    editorArea.classList.add('hidden');
    emptyState.classList.remove('hidden');
    loadFileList();
});

// ─── New file modal ──────────────────────────────────────────────────────────
btnNew.addEventListener('click', () => {
    newNameInput.value = '';
    newFilenameInput.value = '';
    newSourceLang.value = 'de';
    newTargetLang.value = 'en';
    modalOverlay.classList.remove('hidden');
    newNameInput.focus();
});

modalCancel.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
});

modalCreate.addEventListener('click', async () => {
    const name = newNameInput.value.trim();
    const filename = newFilenameInput.value.trim();
    if (!filename) return showToast('Filename required', 'error');

    const data = {
        _meta: {
            name: name || filename,
            version: '1.0',
            date: new Date().toISOString().slice(0, 10),
            source_lang: newSourceLang.value || 'de',
            target_lang: newTargetLang.value || 'en',
            status: 'draft',
        },
        terms: [
            {
                source_term: '',
                target_term: '',
                domain: '',
                do_not_translate: false,
            }
        ],
    };

    const result = await api('/api/terminology', {
        method: 'POST',
        body: JSON.stringify({ filename, data }),
    });

    if (result.error) return showToast(result.error, 'error');
    modalOverlay.classList.add('hidden');
    showToast('Created!');
    await loadFileList();
    loadFile(result.filename);
});

// Close modal on overlay click
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
});

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        btnSave.click();
    }
    // Escape to close modal
    if (e.key === 'Escape') {
        modalOverlay.classList.add('hidden');
    }
    // Ctrl+F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (!isYamlView && editorArea.classList.contains('hidden') === false) {
            e.preventDefault();
            searchInput.focus();
        }
    }
});

// ─── Track changes on meta bar & YAML textarea ──────────────────────────────
[metaName, metaSourceLang, metaTargetLang, metaVersion].forEach(el => {
    el.addEventListener('input', () => markDirty());
});
metaStatus.addEventListener('change', () => markDirty());
yamlRaw.addEventListener('input', () => markDirty());

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
    await loadFileList();
}

init();
