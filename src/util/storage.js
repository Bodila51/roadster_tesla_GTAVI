function storageGet(a) {
  try {
    return localStorage.getItem(a);
  } catch {
    return null;
  }
}
function storageSet(a, e) {
  try {
    localStorage.setItem(a, e);
  } catch {}
}

export { storageGet, storageSet };
