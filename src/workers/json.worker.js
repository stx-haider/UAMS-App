self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'stringify') {
      self.postMessage({ id, result: JSON.stringify(payload, null, 2) });
      return;
    }
    if (type === 'parse') {
      self.postMessage({ id, result: JSON.parse(payload) });
      return;
    }
    throw new Error('Unsupported backup operation.');
  } catch (error) {
    self.postMessage({ id, error: error.message || 'Could not process this backup.' });
  }
});
