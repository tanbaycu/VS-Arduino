const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.next', '.backup', 'media']);

function scriptKindFor(filePath) {
    switch (path.extname(filePath)) {
        case '.tsx':
        case '.jsx':
            return ts.ScriptKind.TSX;
        case '.js':
        case '.mjs':
        case '.cjs':
            return ts.ScriptKind.JS;
        default:
            return ts.ScriptKind.TS;
    }
}

function parse(filePath, text) {
    return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKindFor(filePath));
}

function isJSDocNode(node) {
    return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
}

function tokenSignature(sourceFile) {
    const tokens = [];
    const walk = node => {
        if (isJSDocNode(node)) {
            return;
        }
        if (node.getChildCount(sourceFile) === 0) {
            tokens.push(`${node.kind}:${node.getText(sourceFile)}`);
            return;
        }
        node.getChildren(sourceFile).forEach(walk);
    };
    sourceFile.getChildren(sourceFile).forEach(walk);
    return tokens.join(' ');
}

function hasParseErrors(sourceFile) {
    const diagnostics = sourceFile.parseDiagnostics || [];
    return diagnostics.length > 0;
}

function collectCommentRanges(sourceFile, text) {
    const ranges = [];
    const seen = new Set();

    const addRange = (start, end) => {
        const key = `${start}:${end}`;
        if (!seen.has(key)) {
            seen.add(key);
            ranges.push({ start, end });
        }
    };

    const visitToken = node => {
        const triviaStart = node.pos;
        const tokenStart = node.getStart(sourceFile);
        if (tokenStart <= triviaStart) {
            return;
        }
        const trivia = text.slice(triviaStart, tokenStart);
        const comments = ts.getLeadingCommentRanges(trivia, 0) || [];
        for (const comment of comments) {
            addRange(triviaStart + comment.pos, triviaStart + comment.end);
        }
    };

    const walk = node => {
        const children = node.getChildren(sourceFile);
        if (children.length === 0) {
            visitToken(node);
            return;
        }
        children.forEach(walk);
    };

    walk(sourceFile);
    ranges.sort((a, b) => a.start - b.start);
    return ranges;
}

function collectEmptyJsxExpressions(sourceFile, ranges) {
    const empties = [];
    const isCommentOnly = node => {
        if (!node.expression) {
            return true;
        }
        return false;
    };
    const walk = node => {
        if (ts.isJsxExpression(node) && isCommentOnly(node)) {
            const overlapping = ranges.some(range => range.start >= node.pos && range.end <= node.end);
            if (overlapping) {
                empties.push({ start: node.getStart(sourceFile), end: node.end });
            }
        }
        node.forEachChild(walk);
    };
    sourceFile.forEachChild(walk);
    return empties;
}

function mergeRanges(ranges) {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of sorted) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end) {
            last.end = Math.max(last.end, range.end);
        } else {
            merged.push({ ...range });
        }
    }
    return merged;
}

function removeRanges(text, ranges) {
    let result = '';
    let cursor = 0;
    for (const range of ranges) {
        result += text.slice(cursor, range.start);
        cursor = range.end;
    }
    result += text.slice(cursor);
    return result;
}

function tidyBlankLines(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const kept = [];
    let blankRun = 0;
    for (const line of lines) {
        const trimmedEnd = line.replace(/[ \t]+$/, '');
        if (trimmedEnd.trim() === '') {
            blankRun++;
            if (blankRun > 1) {
                continue;
            }
            kept.push('');
        } else {
            blankRun = 0;
            kept.push(trimmedEnd);
        }
    }
    while (kept.length > 0 && kept[0] === '') {
        kept.shift();
    }
    while (kept.length > 1 && kept[kept.length - 1] === '') {
        kept.pop();
    }
    return kept.join(eol) + eol;
}

function stripFile(filePath, apply) {
    const original = fs.readFileSync(filePath, 'utf8');
    const sourceFile = parse(filePath, original);

    if (hasParseErrors(sourceFile)) {
        return { filePath, status: 'skipped', reason: 'file does not parse cleanly before stripping' };
    }

    const commentRanges = collectCommentRanges(sourceFile, original);
    if (commentRanges.length === 0) {
        return { filePath, status: 'unchanged' };
    }

    const emptyJsx = collectEmptyJsxExpressions(sourceFile, commentRanges);
    const stripped = removeRanges(original, mergeRanges([...commentRanges, ...emptyJsx]));
    const tidied = tidyBlankLines(stripped);

    const reparsed = parse(filePath, tidied);
    if (hasParseErrors(reparsed)) {
        return { filePath, status: 'rejected', reason: 'result failed to parse' };
    }
    if (tokenSignature(sourceFile) !== tokenSignature(reparsed)) {
        return { filePath, status: 'rejected', reason: 'token stream changed' };
    }

    if (apply) {
        fs.writeFileSync(filePath, tidied, 'utf8');
    }
    return { filePath, status: 'stripped', removed: commentRanges.length };
}

function walkDir(dir, files) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) {
                continue;
            }
            walkDir(path.join(dir, entry.name), files);
        } else if (EXTENSIONS.has(path.extname(entry.name))) {
            files.push(path.join(dir, entry.name));
        }
    }
    return files;
}

function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const targets = args.filter(arg => !arg.startsWith('--'));
    if (targets.length === 0) {
        console.error('Usage: node scripts/strip-comments.js <file-or-dir>... [--apply]');
        process.exit(1);
    }

    const files = [];
    for (const target of targets) {
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
            walkDir(target, files);
        } else {
            files.push(target);
        }
    }

    const summary = { stripped: 0, unchanged: 0, skipped: 0, rejected: 0 };
    for (const file of files) {
        const result = stripFile(file, apply);
        summary[result.status]++;
        if (result.status === 'rejected' || result.status === 'skipped') {
            console.log(`${result.status.toUpperCase()}: ${result.filePath} (${result.reason})`);
        } else if (result.status === 'stripped') {
            console.log(`${apply ? 'stripped' : 'would strip'}: ${result.filePath} (${result.removed} comments)`);
        }
    }

    console.log('---');
    console.log(`stripped=${summary.stripped} unchanged=${summary.unchanged} skipped=${summary.skipped} rejected=${summary.rejected}`);
}

main();
