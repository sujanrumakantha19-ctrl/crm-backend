function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const s = String(val).replace(/"/g, '""');
  return `"${s}"`;
}

function resolveNested(obj, path) {
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function streamCSV(req, res, cursor, columns, filename) {
  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}_${dateStr}.csv"`);
  res.write('\uFEFF');

  const headerRow = columns.map(c => escapeCSV(c.label)).join(',') + '\n';
  res.write(headerRow);

  let count = 0;
  let paused = false;

  cursor.on('data', (doc) => {
    const row = columns.map(c => {
      let val = resolveNested(doc, c.key);
      if (c.format) val = c.format(val, doc);
      return escapeCSV(val);
    }).join(',');
    count++;

    if (!res.write(row + '\n')) {
      cursor.pause();
      paused = true;
      res.once('drain', () => {
        paused = false;
        cursor.resume();
      });
    }
  });

  cursor.on('end', () => {
    if (!res.writableEnded) res.end();
  });

  cursor.on('error', (err) => {
    console.error('CSV stream error:', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end();
    }
  });

  req.on('close', () => {
    if (cursor.close) cursor.close();
  });
}

module.exports = { streamCSV };
