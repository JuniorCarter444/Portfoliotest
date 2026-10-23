// Minimal JSON-file storage. Swap for a real database (or a CRM/email hook) in production.
const fs = require('fs');
const path = require('path');

function file(name) {
  return path.join(__dirname, `${name}.json`);
}

function readAll(name) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(name, rows) {
  fs.writeFileSync(file(name), JSON.stringify(rows, null, 2));
}

function insert(name, row) {
  const rows = readAll(name);
  rows.push(row);
  writeAll(name, rows);
  return row;
}

function update(name, id, fields) {
  const rows = readAll(name);
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, fields);
  writeAll(name, rows);
  return row;
}

function find(name, id) {
  return readAll(name).find((r) => r.id === id) || null;
}

module.exports = { readAll, insert, update, find };
