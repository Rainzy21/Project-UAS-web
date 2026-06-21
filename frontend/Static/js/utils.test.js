#!/usr/bin/env node
/** Minimal unit tests for frontend/Static/js/utils.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsPath = path.join(__dirname, 'utils.js');
const code = fs.readFileSync(utilsPath, 'utf8');
const sandbox = { window: {}, URL };
vm.runInNewContext(code, sandbox);
const U = sandbox.window.AppUtils;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; return; }
    failed++;
    console.error('FAIL:', msg);
}

assert(U.escapeHtml('<script>') === '&lt;script&gt;', 'escapeHtml');
assert(U.safePosterUrl('https://image.tmdb.org/t/p/w500/x.jpg') !== null, 'safePosterUrl tmdb');
assert(U.safePosterUrl('javascript:alert(1)') === null, 'safePosterUrl blocks javascript');
assert(U.safeRedirectPath('/profile.html') === '/profile.html', 'safeRedirect relative');
assert(U.safeRedirectPath('//evil.com') === '/', 'safeRedirect blocks protocol-relative');
assert(U.safeRedirectPath('https://evil.com') === '/', 'safeRedirect blocks absolute');

console.log(`utils tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
