const fs = require('fs');

// --- 1. CONFIGURATION ---
const IGNORED_FIELDS = [
    'feedback', 'timestamp', 'user', 'refId', 'isManual', 
    'drafts', 'lastSentText', 'lastSentRating', 'frontUrl', 'backUrl',
    'image', 'img'
];

// Keys to display first in objects (in this order)
const PRIORITY_KEYS = ['name', 'type', 'phase', 'costS', 'costL', 'points', 'stats'];

const OUTPUT_FILE = 'diff_report.html';

// --- 2. HTML & CSS TEMPLATE ---
const HTML_HEADER = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>JSON Diff Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.5; color: #24292e; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f6f8fa; }
        h1 { border-bottom: 1px solid #eaecef; padding-bottom: 10px; }
        h2 { margin-top: 30px; color: #0366d6; border-bottom: 1px solid #eaecef; padding-bottom: 5px; }
        
        .card { background: #fff; border: 1px solid #e1e4e8; border-radius: 6px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-header { background: #f6f8fa; padding: 10px 15px; border-bottom: 1px solid #e1e4e8; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        .card-body { padding: 15px; font-size: 13px; }

        /* Diff Containers */
        .obj-diff { margin-left: 10px; padding-left: 10px; border-left: 2px solid #e1e4e8; margin-bottom: 10px; }
        .diff-row { display: flex; margin-bottom: 4px; font-family: Consolas, monospace; }
        .diff-key { min-width: 120px; color: #666; font-weight: bold; flex-shrink: 0; }
        .diff-val { flex-grow: 1; word-break: break-word; }

        /* Highlighting */
        .val-add { color: #1a7f37; background: #e6ffec; padding: 0 4px; border-radius: 3px; }
        .val-del { color: #cf222e; background: #ffebe9; text-decoration: line-through; padding: 0 4px; border-radius: 3px; }
        
        .row-add { background: #e6ffec; border-left: 3px solid #2da44e; padding: 5px; margin-bottom: 5px; border-radius: 0 4px 4px 0; }
        .row-del { background: #ffebe9; border-left: 3px solid #cf222e; padding: 5px; margin-bottom: 5px; border-radius: 0 4px 4px 0; }
        
        /* Inline Diff */
        .ins { background-color: #acf2bd; text-decoration: none; border-radius: 2px; border-bottom: 1px solid #22863a; color: #000; }
        .del { background-color: #fdb8c0; text-decoration: line-through; border-radius: 2px; color: #555; }

        .sub-header { font-weight: bold; color: #0366d6; margin-top: 15px; margin-bottom: 5px; font-family: sans-serif; border-bottom: 1px dashed #eaecef; padding-bottom: 2px; }
        .sub-header:first-child { margin-top: 0; }
        .rule-block-label { font-size: 11px; color: #999; text-transform: uppercase; margin-bottom: 2px; }
        
        .badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .badge-mod { background: #fff5b1; color: #735c0f; }
        .badge-add { background: #dafbe1; color: #1a7f37; }
        .badge-del { background: #ffebe9; color: #cf222e; }
    </style>
</head>
<body>
    <h1>Diff Report</h1>
    <div id="stats"></div>
`;

const HTML_FOOTER = `
    <script>
        const addCount = document.querySelectorAll('.badge-add').length;
        const delCount = document.querySelectorAll('.badge-del').length;
        const modCount = document.querySelectorAll('.badge-mod').length;
        document.getElementById('stats').innerHTML = 
            '<strong>' + addCount + '</strong> additions, ' +
            '<strong>' + delCount + '</strong> removals, ' +
            '<strong>' + modCount + '</strong> modifications.';
    </script>
</body>
</html>`;

// --- 3. UTILITIES ---

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function cleanText(text) {
    if (!text || typeof text !== 'string') return "";
    return text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|li|h[1-6])>/gi, '\n') // Block tags -> newline
        .replace(/<[^>]+>/g, '') // Strip inline tags
        .replace(/&nbsp;/g, ' ')
        .trim();
}

// Levenshtein Distance for Fuzzy Matching (Typo detection)
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
}

// --- 4. INLINE DIFF LOGIC ---

function getDiffOps(arr1, arr2) {
    const m = arr1.length, n = arr2.length;
    const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) 
        if (arr1[i-1] === arr2[j-1]) dp[i][j] = dp[i-1][j-1] + 1;
        else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
    
    let i = m, j = n, ops = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && arr1[i-1] === arr2[j-1]) { ops.push({op:'kp', val:arr1[i-1]}); i--; j--; }
        else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { ops.push({op:'add', val:arr2[j-1]}); j--; }
        else { ops.push({op:'del', val:arr1[i-1]}); i--; }
    }
    return ops.reverse();
}

function getInlineHtml(oldText, newText) {
    // 1. Tokenize (Keep words and punctuation separate but don't over-split)
    const tokenize = (s) => s.split(/([^\w\s]|\s+)/).filter(x => x);
    const ops = getDiffOps(tokenize(oldText), tokenize(newText));

    // 2. Merge adjacent ops to reduce tag noise (e.g. <del>H</del><del>i</del> -> <del>Hi</del>)
    let merged = [];
    if(ops.length > 0) {
        let current = ops[0];
        for(let i=1; i<ops.length; i++) {
            if(ops[i].op === current.op) {
                current.val += ops[i].val;
            } else {
                merged.push(current);
                current = ops[i];
            }
        }
        merged.push(current);
    }

    // 3. Render
    return merged.map(o => {
        const val = escapeHtml(o.val);
        if (o.op === 'add') return `<span class="ins">${val}</span>`;
        if (o.op === 'del') return `<span class="del">${val}</span>`;
        return val;
    }).join('');
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeRulesData(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.sections)) return data.sections;
    if (data.rules && Array.isArray(data.rules.sections)) return data.rules.sections;
    return [];
}

function normalizeUnitsData(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.units)) return data.units;
    if (Array.isArray(data.cards)) return data.cards;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.data)) return data.data;
    return [];
}

function sectionBlocks(section) {
    const blocks = [];

    // Older export schema with pages[].content[]
    if (Array.isArray(section?.pages)) {
        section.pages.forEach((page, pageIdx) => {
            const pageContent = toArray(page?.content);
            pageContent.forEach((block, blockIdx) => {
                blocks.push({
                    label: `Page ${pageIdx + 1} - Block ${blockIdx + 1}`,
                    type: block?.type || 'text',
                    value: cleanText(block?.value)
                });
            });
        });
    }

    // Newer export schema with items/subItems/subSubItems
    const walkItem = (item, chain) => {
        const title = cleanText(item?.title || 'Untitled');
        const nextChain = [...chain, title];

        toArray(item?.content).forEach((block, idx) => {
            blocks.push({
                label: `${nextChain.join(' > ')} - Block ${idx + 1}`,
                type: block?.type || 'text',
                value: cleanText(block?.value)
            });
        });

        toArray(item?.subItems).forEach(sub => walkItem(sub, nextChain));
        toArray(item?.subSubItems).forEach(sub => walkItem(sub, nextChain));
    };

    if (Array.isArray(section?.items)) {
        section.items.forEach(item => walkItem(item, []));
    }

    return blocks;
}

// --- 5. RULES DIFF LOGIC (NEW) ---

function generateRulesDiff(oldData, newData) {
    let html = '<h2>Rules Sections</h2>';
    const safeOld = toArray(oldData);
    const safeNew = toArray(newData);

    const oldMap = new Map(safeOld.map((s, i) => [s?.id || `old-${i}`, s]));
    const newMap = new Map(safeNew.map((s, i) => [s?.id || `new-${i}`, s]));

    newMap.forEach((newSection, id) => {
        const oldSection = oldMap.get(id);
        const title = newSection.title || "Untitled Section";

        if (!oldSection) {
            html += `<div class="card"><div class="card-header"><span>${escapeHtml(title)}</span><span class="badge badge-add">ADDED</span></div><div class="card-body">Entire section added.</div></div>`;
            return;
        }

        let sectionDiffHtml = '';

        const oldBlocks = sectionBlocks(oldSection);
        const newBlocks = sectionBlocks(newSection);
        const maxBlocks = Math.max(oldBlocks.length, newBlocks.length);
        for (let bIdx = 0; bIdx < maxBlocks; bIdx++) {
            const oldBlock = oldBlocks[bIdx];
            const newBlock = newBlocks[bIdx];
            const label = newBlock?.label || oldBlock?.label || `Block ${bIdx + 1}`;

            if (!oldBlock) {
                sectionDiffHtml += `<div class="rule-block-label">${escapeHtml(label)}</div>`;
                sectionDiffHtml += `<div class="row-add">+ ${escapeHtml(newBlock?.value || '')}</div>`;
                continue;
            }
            if (!newBlock) {
                sectionDiffHtml += `<div class="rule-block-label">${escapeHtml(label)}</div>`;
                sectionDiffHtml += `<div class="row-del">- ${escapeHtml(oldBlock?.value || '')}</div>`;
                continue;
            }

            const tOld = oldBlock.value || '';
            const tNew = newBlock.value || '';
            const typeOld = oldBlock.type || 'text';
            const typeNew = newBlock.type || 'text';

            if (typeOld !== typeNew || tOld !== tNew) {
                sectionDiffHtml += `<div class="rule-block-label">${escapeHtml(label)} (${escapeHtml(typeNew)})</div>`;
                if (typeNew === 'image' || typeOld === 'image') {
                    sectionDiffHtml += `<div class="diff-row"><span class="diff-val">[Image Source Updated]</span></div>`;
                } else {
                    sectionDiffHtml += `<div class="diff-row"><span class="diff-val">${getInlineHtml(tOld, tNew)}</span></div>`;
                }
                sectionDiffHtml += `<div style="margin-bottom:10px;"></div>`;
            }
        }

        if (sectionDiffHtml) {
            html += `<div class="card"><div class="card-header"><span>${escapeHtml(title)}</span><span class="badge badge-mod">MODIFIED</span></div><div class="card-body">${sectionDiffHtml}</div></div>`;
        }
    });

    oldMap.forEach((oldSection, id) => {
        if (newMap.has(id)) return;
        const title = oldSection?.title || 'Untitled Section';
        html += `<div class="card"><div class="card-header"><span>${escapeHtml(title)}</span><span class="badge badge-del">REMOVED</span></div><div class="card-body">Entire section removed.</div></div>`;
    });

    return html;
}

// --- 6. UNIT/CARD COMPARISON UTILS ---

function sortKeys(obj) {
    const keys = Object.keys(obj).sort((a,b) => {
        const idxA = PRIORITY_KEYS.indexOf(a);
        const idxB = PRIORITY_KEYS.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
    return keys;
}

function objectToHtml(obj) {
    if (typeof obj !== 'object' || obj === null) return String(obj);
    const keys = sortKeys(obj);
    return keys
        .filter(k => !IGNORED_FIELDS.includes(k))
        .map(k => {
            const val = typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : obj[k];
            return `<span style="color:#666">${k}:</span> ${escapeHtml(String(val))}`;
        }).join('<br>');
}

function compareObjects(oldObj, newObj, indent = 0) {
    let html = '';
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    const sortedKeys = Array.from(allKeys).sort((a,b) => {
        const idxA = PRIORITY_KEYS.indexOf(a);
        const idxB = PRIORITY_KEYS.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(key => {
        if (IGNORED_FIELDS.includes(key)) return;

        const oVal = oldObj[key];
        const nVal = newObj[key];

        if (nVal === undefined) {
            html += `<div class="diff-row"><span class="diff-key">${key}:</span><span class="diff-val val-del">${escapeHtml(String(oVal))}</span></div>`;
            return;
        }
        if (oVal === undefined) {
            html += `<div class="diff-row"><span class="diff-key">${key}:</span><span class="diff-val val-add">${escapeHtml(String(nVal))}</span></div>`;
            return;
        }

        if (JSON.stringify(oVal) !== JSON.stringify(nVal)) {
            if (typeof oVal === 'object' && oVal !== null && typeof nVal === 'object' && nVal !== null) {
                html += `<div class="sub-header">${key}</div>`;
                html += `<div class="obj-diff">${compareObjects(oVal, nVal, indent + 1)}</div>`;
            } else {
                let diffHtml = '';
                if (typeof oVal === 'string' && oVal.length > 15) {
                    diffHtml = getInlineHtml(oVal, nVal);
                } else {
                    diffHtml = `<span class="val-del">${escapeHtml(String(oVal))}</span> &#8594; <span class="val-add">${escapeHtml(String(nVal))}</span>`;
                }
                html += `<div class="diff-row"><span class="diff-key">${key}:</span><span class="diff-val">${diffHtml}</span></div>`;
            }
        }
    });

    return html;
}

function compareArrays(oldArr, newArr) {
    let html = '';
    const getKey = (item) => (item && typeof item === 'object') ? (item.id || item.name) : null;

    if (oldArr.length > 0 && typeof oldArr[0] !== 'object') {
        const ops = getDiffOps([...oldArr].sort(), [...newArr].sort());
        ops.forEach(op => {
            if (op.op === 'add') html += `<div class="diff-row row-add">+ ${escapeHtml(op.val)}</div>`;
            if (op.op === 'del') html += `<div class="diff-row row-del">- ${escapeHtml(op.val)}</div>`;
        });
        return html;
    }

    const newItems = [...newArr];
    const oldItems = [...oldArr];
    const matchedIndices = new Set();

    oldItems.forEach(oldItem => {
        let bestMatchIdx = -1;
        const oldKey = getKey(oldItem);
        if (oldKey) {
            const exactIdx = newItems.findIndex((n, idx) => getKey(n) === oldKey && !matchedIndices.has(idx));
            if (exactIdx !== -1) bestMatchIdx = exactIdx;
        }

        if (bestMatchIdx === -1 && oldItem.name) {
            newItems.forEach((newItem, idx) => {
                if (matchedIndices.has(idx) || !newItem.name) return;
                const dist = levenshtein(oldItem.name, newItem.name);
                if (dist <= 2) bestMatchIdx = idx;
            });
        }

        if (bestMatchIdx !== -1) {
            matchedIndices.add(bestMatchIdx);
            const newItem = newItems[bestMatchIdx];
            if (JSON.stringify(getCanonical(oldItem)) !== JSON.stringify(getCanonical(newItem))) {
                const displayName = oldItem.name || oldItem.id || "Item";
                html += `<div class="sub-header">${escapeHtml(displayName)}</div>`;
                html += `<div class="obj-diff">${compareObjects(oldItem, newItem)}</div>`;
            }
        } else {
            html += `<div class="row-del"><strong>- Removed:</strong><br>${objectToHtml(oldItem)}</div>`;
        }
    });

    newItems.forEach((newItem, idx) => {
        if (!matchedIndices.has(idx)) {
            html += `<div class="row-add"><strong>+ Added:</strong><br>${objectToHtml(newItem)}</div>`;
        }
    });

    return html;
}

function getCanonical(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(getCanonical);
    const keys = Object.keys(obj).sort();
    const res = {};
    keys.forEach(k => { if(!IGNORED_FIELDS.includes(k)) res[k] = getCanonical(obj[k]); });
    return res;
}

function generateUnitsDiff(oldData, newData) {
    let html = '';
    const safeOld = toArray(oldData);
    const safeNew = toArray(newData);
    const oldMap = new Map(safeOld.map((u, i) => [u?.id || u?.name || `old-${i}`, u]));

    safeNew.forEach((newItem, i) => {
        const itemKey = newItem?.id || newItem?.name || `new-${i}`;
        const oldItem = oldMap.get(itemKey);

        if (!oldItem) {
            html += `<div class="card"><div class="card-header"><span>${escapeHtml(newItem?.name || newItem?.id || itemKey)}</span><span class="badge badge-add">ADDED</span></div><div class="card-body">Item added to database.</div></div>`;
            return;
        }

        let itemDiffHtml = '';
        const allKeys = new Set([...Object.keys(oldItem), ...Object.keys(newItem)]);
        const sortedKeys = Array.from(allKeys).sort((a,b) => {
            const idxA = PRIORITY_KEYS.indexOf(a);
            const idxB = PRIORITY_KEYS.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        sortedKeys.forEach(key => {
            if (IGNORED_FIELDS.includes(key)) return;
            const o = oldItem[key], n = newItem[key];
            if (JSON.stringify(getCanonical(o)) === JSON.stringify(getCanonical(n))) return;

            if (Array.isArray(o) && Array.isArray(n)) {
                const arrHtml = compareArrays(o, n);
                if (arrHtml) itemDiffHtml += `<div class="sub-header">${key}</div><div class="obj-diff">${arrHtml}</div>`;
            } else if (typeof o === 'object' && o !== null && n !== null) {
                itemDiffHtml += `<div class="sub-header">${key}</div><div class="obj-diff">${compareObjects(o, n)}</div>`;
            } else {
                let valHtml = '';
                if (o === undefined) valHtml = `<span class="val-add">${escapeHtml(String(n))}</span>`;
                else if (n === undefined) valHtml = `<span class="val-del">${escapeHtml(String(o))}</span>`;
                else if (typeof o === 'string' && o.length > 20) valHtml = getInlineHtml(o, n);
                else valHtml = `<span class="val-del">${escapeHtml(String(o))}</span> &#8594; <span class="val-add">${escapeHtml(String(n))}</span>`;
                
                itemDiffHtml += `<div class="diff-row"><span class="diff-key">${key}:</span><span class="diff-val">${valHtml}</span></div>`;
            }
        });

        if (itemDiffHtml) {
            html += `<div class="card"><div class="card-header"><span>${escapeHtml(newItem?.name || newItem?.id || itemKey)}</span><span class="badge badge-mod">MODIFIED</span></div><div class="card-body">${itemDiffHtml}</div></div>`;
        }
    });

    oldMap.forEach((oldItem, key) => {
        const existsInNew = safeNew.some((newItem, i) => (newItem?.id || newItem?.name || `new-${i}`) === key);
        if (!existsInNew) {
            html += `<div class="card"><div class="card-header"><span>${escapeHtml(oldItem?.name || oldItem?.id || key)}</span><span class="badge badge-del">REMOVED</span></div><div class="card-body">Item removed from database.</div></div>`;
        }
    });

    return html;
}

// --- 7. MAIN ---

const fileA = process.argv[2];
const fileB = process.argv[3];

if (!fileA || !fileB) {
    console.error("Usage: node diff_html.js <old.json> <new.json>");
    process.exit(1);
}

try {
    const oldData = JSON.parse(fs.readFileSync(fileA, 'utf8'));
    const newData = JSON.parse(fs.readFileSync(fileB, 'utf8'));

    const isRules = (d) => {
        if (!d) return false;
        if (Array.isArray(d)) {
            if (d.length === 0) return false;
            return Boolean(d[0]?.pages || d[0]?.items || (d[0]?.title && d[0]?.order !== undefined));
        }
        if (typeof d === 'object') {
            if (Array.isArray(d.sections)) return true;
            if (d.type === 'rules') return true;
        }
        return false;
    };
    
    let content = '';
    if (isRules(oldData) || isRules(newData)) {
        const oldRules = normalizeRulesData(oldData);
        const newRules = normalizeRulesData(newData);
        content = generateRulesDiff(oldRules, newRules);
    } else {
        const oldUnits = normalizeUnitsData(oldData);
        const newUnits = normalizeUnitsData(newData);
        content = generateUnitsDiff(oldUnits, newUnits);
    }

    fs.writeFileSync(OUTPUT_FILE, HTML_HEADER + content + HTML_FOOTER);
    console.log(`✅ Report generated: ${OUTPUT_FILE}`);

} catch (e) {
    console.error("Error:", e.message);
}